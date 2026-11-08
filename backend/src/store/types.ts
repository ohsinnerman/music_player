import type { Track } from '../domain/types.js';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
  /** Bumped on password change / "sign out everywhere" to kill old access tokens. */
  tokenVersion: number;
}

export interface RefreshTokenRecord {
  id: string; // jti
  userId: string;
  familyId: string;
  tokenHash: string; // sha256 of the secret half, never the token itself
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
  replacedBy?: string;
  userAgent?: string;
}

export interface LikeRecord {
  userId: string;
  trackId: string;
  track: Track;
  createdAt: Date;
}

export interface UserPlaylistRecord {
  id: string;
  userId: string;
  title: string;
  description?: string;
  tracks: Track[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HistoryRecord {
  userId: string;
  track: Track;
  playedAt: Date;
}

export interface Store {
  init(): Promise<void>;
  close(): Promise<void>;

  createUser(u: UserRecord): Promise<void>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  updateUser(id: string, patch: Partial<Pick<UserRecord, 'displayName' | 'passwordHash' | 'tokenVersion'>>): Promise<void>;
  deleteUser(id: string): Promise<void>;

  saveRefreshToken(t: RefreshTokenRecord): Promise<void>;
  findRefreshToken(id: string): Promise<RefreshTokenRecord | null>;
  /** Atomically revoke a token only if it is still active. Returns false if it was already revoked. */
  revokeRefreshToken(id: string, replacedBy?: string): Promise<boolean>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;

  listLikes(userId: string, limit: number, before?: Date): Promise<LikeRecord[]>;
  addLike(l: LikeRecord): Promise<void>;
  removeLike(userId: string, trackId: string): Promise<void>;
  hasLikes(userId: string, trackIds: string[]): Promise<string[]>;

  listPlaylists(userId: string): Promise<UserPlaylistRecord[]>;
  getPlaylist(userId: string, id: string): Promise<UserPlaylistRecord | null>;
  createPlaylist(p: UserPlaylistRecord): Promise<void>;
  updatePlaylist(userId: string, id: string, patch: Partial<Pick<UserPlaylistRecord, 'title' | 'description' | 'tracks'>>): Promise<UserPlaylistRecord | null>;
  deletePlaylist(userId: string, id: string): Promise<boolean>;
  countPlaylists(userId: string): Promise<number>;

  addHistory(h: HistoryRecord): Promise<void>;
  listHistory(userId: string, limit: number): Promise<HistoryRecord[]>;
}
