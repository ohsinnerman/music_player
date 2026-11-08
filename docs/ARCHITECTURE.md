# Architecture

## System overview

```
┌──────────────────────────── Android phone ────────────────────────────┐
│  Aura app (React Native, Hermes, New Architecture)                    │
│                                                                       │
│  Screens (Expo Router) ──► TanStack Query ──► api/client.ts ───────┐  │
│        │                                     (JWT, refresh, timeouts)│ │
│        ▼                                                            │  │
│  Zustand stores: player · library · device music · settings · auth  │  │
│        │                                                            │  │
│        ▼                                                            │  │
│  player/engine.ts ──► expo-audio AudioPlaylist (ExoPlayer) ─────────┤  │
│                       background service + media notification       │  │
│  SecureStore (Android Keystore): refresh token                      │  │
│  local/: your own files (SAF) → tag reader → plays file:// content:// │  │
│  modules/aura-audio-route: output device + mixer rate (Kotlin)      │  │
└─────────────────────────────────────────────────────────────────────┼──┘
                                                         HTTPS        │
┌───────────────────────── Aura API (backend/) ────────────────────────▼─┐
│ Express 5: helmet · CORS allow-list · rate limits · zod validation     │
│                                                                        │
│  /v1/auth/*  ──► security/tokens.ts (JWT + rotating refresh tokens)    │
│  /v1/me/*    ──► store (MongoDB | memory): users, likes, playlists…    │
│  /v1/browse, /search, /tracks, /albums, /artists, /playlists           │
│              ──► services/catalog.ts ──► providers/{audius,deezer,…}   │
│  /v1/lyrics  ──► services/lyrics.ts ──► LRCLIB                         │
│  /v1/identify[/audio] ──► services/identify.ts ──► LRCLIB · Groq (opt.)│
│  /v1/tracks/:id/play ──► 302 to a freshly-resolved stream URL          │
│                                                                        │
│  lib/http.ts: allow-listed hosts only, timeouts, 1 retry               │
│  lib/cache.ts: LRU + TTL + request coalescing                          │
└───────────┬───────────────┬────────────────┬───────────────┬───────────┘
            ▼               ▼                ▼               ▼
        Audius API      Deezer API      Jamendo API      LRCLIB API      Groq API
     (full streams)   (30s previews)   (optional, CC)    (lyrics)    (LLM + Whisper, opt.)
```

The app never talks to a music provider directly. It only knows the Aura API and a normalised
data model (`Track`, `Album`, `Artist`, `Playlist`, `Section`…), defined once in
`backend/src/domain/types.ts` and mirrored in `mobile/src/api/types.ts`.

## Why a backend at all?

- **Secrets stay off the phone.** Provider API keys live on the server.
- **One model, many sources.** Providers can be swapped or added without an app update.
- **Fresh stream URLs.** Signed provider URLs expire; the `/play` endpoint resolves a new one each time.
- **Accounts & sync.** Likes, playlists and history follow the user across devices.
- **Caching & rate-limit shielding** in front of free public APIs.

## Request flows

### Browsing

```
Home screen → useHome() → GET /v1/browse/home
   catalog.home(): Promise.allSettled(every provider.homeSections())
   → merge in a curated order, insert genres, cache 5 min
   → one failing provider never breaks the page (its sections are skipped)
```

### Playing a song

```
tap row → player.playQueue(tracks, index, context)
   → native AudioPlaylist.clear(); add({ uri: <API>/v1/tracks/<id>/play  or  the file's own URI }) × N; skipTo(index); play()
   → ExoPlayer requests /play → server resolves a fresh stream → 302 → audio bytes from the CDN
   → status events (250 ms) → zustand + UI-thread clock → scrubber, lyrics, mini player
```

Because each queue entry is a *stable* URL that redirects at play time, the native queue can hold
200 tracks without any of them going stale, and lock-screen next/previous work with the app in the
background.

### Your own files: lyrics + identification

```
Library → On this phone → pick files / folder (Storage Access Framework, persistent read grant)
   local/tags reads tags, cover, duration, bit depth, embedded lyrics → Track { provider:'local', local.uri }
open Lyrics → embedded / cached? → done (offline)
   else POST /v1/identify {tags, filename, duration}
        tags → file name → LRCLIB search → Groq LLM (only if needed) → LRCLIB
   still nothing → cut a ~20 s clip (no re-encode) → POST /v1/identify/audio
        Groq Whisper → LLM names the song → LRCLIB
   result cached as a file; real title/artist fill in missing tags
```

See [LOCAL_MUSIC.md](LOCAL_MUSIC.md).

### Audio quality

```
badge tap → specOf(track) + getOutputInfo() (native) → signalPath(): file → decode → mixer → output
```

See [AUDIO_QUALITY.md](AUDIO_QUALITY.md).

### Signing in

```
POST /v1/auth/login → { accessToken (15 min JWT), refreshToken (opaque, 30 days) }
   app: access token in memory only; refresh token in Android Keystore (SecureStore)
   any 401 → single-flight POST /v1/auth/refresh (rotates the refresh token) → retry once
   replayed (old) refresh token → server revokes the whole session family
```

## The player engine (mobile/src/player)

| File | Role |
|---|---|
| `engine.ts` | All playback commands. Owns the native `AudioPlaylist`, keeps it 1:1 with the queue, handles shuffle/repeat, lock-screen metadata, persistence and history. |
| `store.ts` | `usePlayer` (queue, index, flags) and `clock` — Reanimated shared values updated by native status and interpolated every frame by `<PlaybackClock/>` while playing. |
| `ui.ts` | Player sheet state (open, lyrics/queue panel). |

Shuffle never interrupts the current song: the engine removes everything around it and rebuilds the
queue in place. The last session (queue, position, modes) is restored on launch, paused.

## Folder layout

```
backend/
  src/
    app.ts                 Express app factory (dependency-injected, used by tests)
    index.ts / vercel.ts   Long-running server / serverless entry
    config/env.ts          Validated configuration, production guards
    domain/types.ts        The API contract
    http/                  routes + middleware (auth, validation, limits, errors)
    providers/             audius, deezer, jamendo, registry
    services/              catalog (merge/rank/cache), lyrics (LRCLIB + LRC parser), genres,
                           identify (tags → LRCLIB → Groq LLM / Whisper), groq client
    security/              password (argon2id), tokens (JWT + refresh rotation)
    store/                 Store interface, memory + Mongo implementations
    lib/                   http client (SSRF guard), cache, errors, ids, logger
  test/                    Vitest + supertest suites
  scripts/demo.ts          Offline demo server (dev only)

mobile/
  app.config.ts            Build-time config (API URL, cleartext, permissions, plugins)
  plugins/                 withReleaseSigning config plugin
  modules/aura-audio-route Local Expo module (Kotlin): output device + mixer rate for the signal path
  modules/aura-liquid-glass Local Expo module (Kotlin + AGSL): GPU Liquid Glass lens over the page
  src/
    app/                   Routes (Expo Router): tabs, player-less detail pages, auth, settings
    api/                   types, fetch client, endpoints, query hooks
    auth/                  auth store, secure token storage
    player/                engine, stores, sheet UI state
    library/               guest library store + unified hooks (local ⇄ server)
    local/                 songs imported from the phone: tag reader + clipper (tags/), import,
                           identify / lyrics resolution, store — see LOCAL_MUSIC.md
    settings/              persisted settings (incl. appearance), server URL validation
    components/
      ui/                  Glass, Text, PressableScale, Sheet, Toast, TextField, TopBar…
      music/               TrackRow, MediaCard, HeroCarousel, Shelves, CollectionScreen…
      player/              PlayerSheet, LivingBackground, Scrubber, Controls, LyricsView, QueueView
      dock/                GlassDock + shared geometry
      sheets/              Track actions, playlist picker, create playlist
      quality/             QualityBadge, AudioQualitySheet
    lib/                   palette extraction, chrome (shared animation state), format, nav, haptics,
                           quality (tiers + signal path, pure)
    theme/                 dark + light tokens, ThemeProvider/ThemeScope, makeStyles, typography, motion
```
