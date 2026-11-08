# Security

## Threat model (short)

| Asset | Threats | Main controls |
|---|---|---|
| User accounts | credential stuffing, brute force, password-DB leak | Argon2id, per-IP + per-account rate limits, generic errors, timing-safe login |
| Sessions | token theft from device/network, replay | https-only builds, short JWTs, Keystore storage, rotating refresh tokens with reuse detection |
| User data (likes, playlists) | IDOR / cross-user access | every query scoped by `userId` from the verified token; tests prove isolation |
| Server | SSRF, injection via IDs, DoS of free upstreams | allow-listed upstream hosts, strict ID regex, zod validation, body limits, LRU cache + coalescing |
| Provider API keys | leakage via the app | keys only on the server; stream URLs resolved server-side |
| Groq API key / AI budget | key leakage, someone burning your quota | key only in server env, never logged or returned; per-IP limits on `/identify*`; per-instance daily AI cap (`AI_DAILY_LIMIT`) |
| Files on the phone | over-broad storage access | Storage Access Framework: the user picks files/folders, read-only grants, no storage permission requested |

## Backend controls

**Passwords** — Argon2id (19 MiB, t=2, p=1 — OWASP recommendation) via `@node-rs/argon2`. Unknown
emails still run a full hash check, so login timing doesn't reveal which emails exist. Basic policy:
8–128 chars, not a common password, not your email.

**Tokens** — Access tokens are HS256 JWTs (15 min) with `iss`, `aud`, `exp`, `jti` and a
`tokenVersion` claim; only `HS256` is accepted (no `alg:none`/confusion). Refresh tokens are opaque
`<uuid>.<256-bit secret>`; only a SHA-256 of the secret is stored and compared in constant time.
Every refresh rotates the token atomically. Presenting an already-rotated token revokes the entire
session family (theft detection). Changing the password or "sign out everywhere" bumps
`tokenVersion`, killing all outstanding access tokens immediately.

**Input** — every body, query and path param is validated with zod. IDs must match
`^(audius|deezer|jamendo):[A-Za-z0-9_-]{1,64}$`, so nothing user-supplied can alter an upstream URL.
JSON bodies are capped at 32 KB. Track metadata stored in likes/playlists is always fetched by the
server, never trusted from the client.

**Upstream calls (SSRF)** — the HTTP client refuses any host not explicitly configured (Audius,
Deezer, Jamendo, LRCLIB), uses timeouts and one retry. The `/play` redirect only targets https URLs
returned by a provider.

**AI identification** — `/v1/identify` accepts only small JSON (tags, file name, duration);
`/v1/identify/audio` accepts only audio MIME types up to 4 MB (raw body parser on that route alone).
Tags, file names and transcripts are treated as untrusted data in the prompts; model output is
validated with zod and only used as an LRCLIB search query. Clips are forwarded to Groq and not stored.
Groq errors are mapped to generic codes (`ai_unavailable`, `ai_rate_limited`) so nothing about the key
leaks. The Groq host is fixed (no user-controlled URLs).

**HTTP hardening** — `helmet` with `default-src 'none'` CSP, HSTS in production, `nosniff`,
frame-ancestors none, no `X-Powered-By`; CORS closed by default (native apps don't need it); global,
search and auth rate limits; `trust proxy` configurable so limits see real client IPs behind
Render/Vercel; generic 500s (details only in server logs); log redaction of `Authorization`,
cookies, passwords and tokens.

**Configuration guards** — production refuses to boot without a 32+ char `JWT_SECRET`, without
persistent storage (unless explicitly `STORE=memory`), or with `ALLOW_INSECURE_STREAMS`.

**Data rights** — users can delete their account and all associated data (`DELETE /v1/me`,
password-confirmed). Mongo TTL indexes purge expired refresh tokens.

## Mobile controls

- **Token storage** — refresh token in SecureStore (Android Keystore,
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`); access token only in memory. AsyncStorage never holds secrets.
- **No backups** — `android:allowBackup="false"` and SecureStore backup exclusion rules, so tokens
  can't be extracted via adb/cloud backups.
- **Transport** — release builds set `usesCleartextTraffic=false`; the app also rejects `http://`
  server URLs unless the build was made with `AURA_ALLOW_CLEARTEXT=true` (LAN testing only).
- **Least privilege** — microphone, location, contacts, storage and overlay permissions are
  explicitly blocked. Requested: internet, foreground media playback, notifications (lock-screen
  controls), vibrate. Your own music is opened through the system file picker (Storage Access
  Framework) with read-only grants — no storage permission. Reading the audio output device needs no
  permission either.
- **Code shrinking** — R8 minification and resource shrinking in release builds.
- **Session expiry handling** — a rejected refresh clears local tokens and returns to guest mode.
- **Server URL validation** — must parse as a URL, no embedded credentials, verified by calling
  `/v1/config` before saving.

## Operating it safely

1. Generate `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
2. Use MongoDB Atlas with a dedicated database user and IP access list.
3. Set `TRUST_PROXY=1` behind Render/Vercel/Nginx.
4. Set `ALLOW_REGISTRATION=false` once your own account exists if the server is just for you.
5. Use your own keystore for release signing (see [BUILD_APK.md](BUILD_APK.md)) and keep it secret.
6. Keep dependencies patched — the backend CI runs `npm audit --omit=dev`.

## Known limits / ideas

- No email verification or password reset by email (would need an email provider).
- Certificate pinning isn't enabled (would break when your host rotates certificates); consider it
  if you run on a fixed domain.
- The stream endpoints are public (like any music CDN) but rate-limited.
- `/identify` endpoints are public too (guests can import music), protected by rate limits and the daily
  AI cap. If your server is just for you, keep `AI_DAILY_LIMIT` low.

Report a vulnerability: open a private security advisory on the GitHub repository.
