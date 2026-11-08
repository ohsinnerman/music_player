# API reference

Base URL: `https://<your-server>/v1` · JSON only · UTF-8

## Conventions

- **Success:** `{ "data": … }` (204 responses have no body).
- **Error:** `{ "error": { "code": "validation_failed", "message": "Enter a valid email", "details": [{ "path": "email", "message": "…" }], "requestId": "…" } }`
- **IDs** are namespaced: `audius:D7KyD`, `deezer:3135556`, `jamendo:1234`. Anything else is rejected with 400.
- **Auth:** `Authorization: Bearer <accessToken>` on `/me/*`.
- **Rate limits** (defaults, per IP): 300 req/min overall, 90 searches/min, 20 auth attempts/15 min, 10 logins/15 min per email. Exceeding returns `429 rate_limited` with standard `RateLimit-*` headers.
- Every response carries `X-Request-Id` (send your own to correlate logs).

| Status | `code` | Meaning |
|---|---|---|
| 400 | `bad_request`, `validation_failed` | Bad input |
| 401 | `unauthorized` | Missing/expired/invalid token |
| 403 | `forbidden` | e.g. registration closed |
| 404 | `not_found` | Unknown route or item |
| 409 | `conflict` | Email already registered |
| 413 | `payload_too_large` | Body over 32 KB |
| 429 | `rate_limited` | Slow down |
| 502 | `upstream_unavailable` | Music source failed |

## Data model

```ts
Track    { kind:'track', id, title, artists:[{id,name}], album?:{id,title}, durationMs, artwork:{small?,medium?,large?},
           explicit, streamKind:'full'|'preview', provider, genre?, playCount?, releaseDate? }
Album    { kind:'album', id, title, artists, artwork, releaseDate?, trackCount?, albumType:'album'|'single'|'ep'|'compilation', provider, tracks?, description? }
Artist   { kind:'artist', id, name, image, followers?, verified?, provider }
ArtistDetail = Artist & { bio?, cover?, topTracks: Track[], albums: Album[] }
Playlist { kind:'playlist', id, title, description?, artwork, owner?, trackCount?, provider|'user', tracks? }
Genre    { kind:'genre', id, name, colors:[hex,hex] }
Section  { id, title, subtitle?, layout:'hero'|'shelf'|'grid'|'chart'|'artists'|'genres'|'quickpicks', items }
Lyrics   { trackId?, synced: {timeMs,text}[] | null, plain: string|null, instrumental, source:'lrclib'|'embedded' }
Identification { match: { title, artist, album?, durationSec?, confidence:'high'|'medium'|'low', source:'tags'|'filename'|'search'|'ai'|'audio' } | null,
                 lyrics: Lyrics | null, ai: { used, available }, canListen, transcript? }
StreamInfo { url, kind:'full'|'preview', expiresAt, mimeType? }
```

## Meta

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status:'ok', time}` |
| GET | `/config` | Enabled providers, whether sign-ups are open, `features: { identify, ai, listen }` |

## Identify (songs imported from the phone)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/identify` | JSON `{ title?, artist?, album?, duration?, filename? }` (title or filename required) | `Identification`. Tags → file name → LRCLIB search → Groq LLM. 30/min/IP |
| POST | `/identify/audio` | Raw audio clip ≤ 4 MB (`audio/mpeg`, `audio/flac`, `audio/wav`, `audio/ogg`, `audio/opus`, `audio/mp4`); same hints as query string | `Identification` (+ `transcript`). Groq Whisper → LLM → LRCLIB. 40/h/IP |

AI steps need `GROQ_API_KEY` on the server; without it `/identify` still matches tags and file names.
Errors: `ai_unavailable` (503/502), `ai_rate_limited` (429), `payload_too_large` (413). See [LOCAL_MUSIC.md](LOCAL_MUSIC.md).

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{email, password, displayName}` | `201 {user, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt}` |
| POST | `/auth/login` | `{email, password}` | same as register |
| POST | `/auth/refresh` | `{refreshToken}` | new pair (old refresh token is now dead) |
| POST | `/auth/logout` | `{refreshToken}` | `204` — revokes that session family |

Password rules: 8–128 chars, not a common password, not equal to the email.

## Catalogue (public)

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/browse/home` | | `Section[]` |
| GET | `/browse/genres` | | `Genre[]` |
| GET | `/browse/genres/:genreId` | | `{genre, tracks}` |
| GET | `/search` | `q` (1–100 chars), `limit` (≤50) | `{query, top?, tracks, albums, artists, playlists}` |
| GET | `/tracks/:id` | | `Track` |
| GET | `/tracks/:id/stream` | | `StreamInfo` (`Cache-Control: no-store`) |
| GET | `/tracks/:id/play` | | `302` → fresh stream URL (what the app's native player uses) |
| GET | `/tracks/:id/radio` | | `Track[]` similar songs |
| GET | `/albums/:id` | | `Album` with `tracks` |
| GET | `/artists/:id` | | `ArtistDetail` |
| GET | `/playlists/:id` | | `Playlist` with `tracks` |
| GET | `/lyrics` | `trackId` **or** `title`,`artist`[,`album`,`duration`] | `Lyrics` (404 if none) |

Catalogue responses are cacheable (`Cache-Control: public, max-age=…`).

## Me (requires auth, `Cache-Control: private, no-store`)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/me` | | `User` |
| PATCH | `/me` | `{displayName}` | `User` |
| POST | `/me/password` | `{currentPassword, newPassword}` | new token pair; all other sessions revoked |
| POST | `/me/logout-all` | | `204` — every device signed out |
| DELETE | `/me` | `{password}` | `204` — account + all data deleted |
| GET | `/me/likes` | `limit`, `before` | `Track & {likedAt}` newest first |
| GET | `/me/likes/contains` | `ids=a,b,c` | ids that are liked |
| PUT | `/me/likes/:id` | | `204` (idempotent; metadata resolved server-side) |
| DELETE | `/me/likes/:id` | | `204` |
| GET | `/me/playlists` | | `UserPlaylist[]` (without track arrays) |
| POST | `/me/playlists` | `{title, description?, trackIds?}` | `201 UserPlaylist` |
| GET | `/me/playlists/:pid` | | `UserPlaylist` |
| PATCH | `/me/playlists/:pid` | `{title?, description?, trackIds?}` (full order) | `UserPlaylist` |
| POST | `/me/playlists/:pid/tracks` | `{trackIds}` | `UserPlaylist` (duplicates skipped) |
| DELETE | `/me/playlists/:pid/tracks/:id` | | `UserPlaylist` |
| DELETE | `/me/playlists/:pid` | | `204` |
| GET | `/me/history` | `limit` (≤200) | `Track & {playedAt}` |
| POST | `/me/history` | `{trackId}` | `204` |

Limits: 200 playlists per user, 1000 tracks per playlist, 200 history entries (oldest trimmed).

## Example

```bash
API=https://aura-api.onrender.com/v1
curl "$API/search?q=lofi&limit=5"
TOKENS=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"your passphrase"}')
ACCESS=$(echo "$TOKENS" | jq -r .data.accessToken)
curl -X PUT "$API/me/likes/audius:D7KyD" -H "Authorization: Bearer $ACCESS"
```
