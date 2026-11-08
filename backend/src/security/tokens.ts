import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import type { Store, UserRecord } from '../store/types.js';

export interface AccessClaims {
  sub: string;
  ver: number;
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/**
 * Access tokens: short-lived HS256 JWTs.
 * Refresh tokens: opaque "<jti>.<secret>" strings. Only a SHA-256 of the
 * secret is stored. They rotate on every use; presenting an already-used
 * token revokes the whole session family (stolen-token detection).
 */
export function createTokenService(env: Env, store: Store) {
  const key = new TextEncoder().encode(env.JWT_SECRET);

  async function signAccess(user: UserRecord) {
    const exp = Math.floor(Date.now() / 1000) + env.ACCESS_TOKEN_TTL_SECONDS;
    const token = await new SignJWT({ ver: user.tokenVersion })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(exp)
      .setJti(randomUUID())
      .sign(key);
    return { token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async function verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithms: ['HS256'],
        clockTolerance: 5,
      });
      if (typeof payload.sub !== 'string' || typeof payload.ver !== 'number') throw new Error('claims');
      return { sub: payload.sub, ver: payload.ver };
    } catch {
      throw unauthorized('Session expired');
    }
  }

  async function issueRefresh(userId: string, familyId: string, userAgent?: string) {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await store.saveRefreshToken({
      id,
      userId,
      familyId,
      tokenHash: sha256(secret).toString('hex'),
      expiresAt,
      createdAt: new Date(),
      userAgent: userAgent?.slice(0, 200),
    });
    return { token: `${id}.${secret}`, id, expiresAt };
  }

  async function issuePair(user: UserRecord, userAgent?: string, familyId: string = randomUUID()): Promise<TokenPair> {
    const [access, refresh] = await Promise.all([signAccess(user), issueRefresh(user.id, familyId, userAgent)]);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    };
  }

  async function rotate(presented: string, userAgent?: string): Promise<{ user: UserRecord; tokens: TokenPair }> {
    const [id, secret] = presented.split('.');
    if (!id || !secret || id.length > 64 || secret.length > 128) throw unauthorized('Invalid session');
    const rec = await store.findRefreshToken(id);
    if (!rec) throw unauthorized('Invalid session');

    const expected = Buffer.from(rec.tokenHash, 'hex');
    const actual = sha256(secret);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw unauthorized('Invalid session');

    if (rec.revokedAt) {
      // A rotated token came back: someone else has a copy. Kill the family.
      await store.revokeFamily(rec.familyId);
      throw unauthorized('Session revoked, please sign in again');
    }
    if (rec.expiresAt.getTime() <= Date.now()) throw unauthorized('Session expired');

    const user = await store.findUserById(rec.userId);
    if (!user) throw unauthorized('Invalid session');

    const next = await issueRefresh(user.id, rec.familyId, userAgent);
    // Atomic: if two refreshes race, only one wins; the loser is treated as reuse.
    const won = await store.revokeRefreshToken(rec.id, next.id);
    if (!won) {
      await store.revokeFamily(rec.familyId);
      throw unauthorized('Session revoked, please sign in again');
    }
    const access = await signAccess(user);
    return {
      user,
      tokens: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken: next.token,
        refreshTokenExpiresAt: next.expiresAt.toISOString(),
      },
    };
  }

  async function revoke(presented: string) {
    const [id, secret] = presented.split('.');
    if (!id || !secret || id.length > 64 || secret.length > 128) return;
    const rec = await store.findRefreshToken(id);
    if (!rec) return;
    const expected = Buffer.from(rec.tokenHash, 'hex');
    const actual = sha256(secret);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) await store.revokeFamily(rec.familyId);
  }

  return { issuePair, verifyAccess, rotate, revoke };
}

export type TokenService = ReturnType<typeof createTokenService>;
