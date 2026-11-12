# Mobile app internals

## Stack

Expo SDK 58 · React Native 0.88 (New Architecture, Hermes) · Expo Router (file-based routes in
`src/app`) · Reanimated 4 + react-native-worklets · Gesture Handler 3 (hook API) · Skia 2 ·
expo-audio (ExoPlayer) · expo-file-system (SAF file/folder access) · expo-image · FlashList 2 · TanStack Query 5 · Zustand 5 ·
SecureStore · Plus Jakarta Sans + Instrument Serif · lucide icons. Three local native modules (Kotlin, autolinked from `modules/`): `aura-audio-route` (audio output info —
see [AUDIO_QUALITY.md](AUDIO_QUALITY.md) — and the player's output stage: float decoding, EQ, ReplayGain,
downmix, bit-perfect USB — see [SOUND.md](SOUND.md)) and `aura-cast` (DLNA and Google Cast discovery,
control and media server — see [DLNA.md](DLNA.md)).

## Navigation

```
src/app/_layout.tsx        Root: fonts, providers, BlurTargetView, Stack, + global overlays
  (tabs)/_layout.tsx       Tabs (index · explore · library) with the native tab bar hidden
  album/[id] artist/[id] playlist/[id] my-playlist/[id] genre/[id] liked
  search  settings  auth  onboarding  device (songs on this phone)
```

The visible tab bar is `<Dock/>`, rendered in the root layout *above* the navigator, so it floats
over detail pages too. `<PlayerSheet/>`, `<SheetHost/>`
and `<ToastHost/>` are siblings on top. Tapping a tab from a detail page pops back to the tabs first
(`lib/nav.ts → goTab`).

## State

| Store | Persisted | Holds |
|---|---|---|
| `settings/store.ts` | AsyncStorage | server URL, onboarded, appearance (system/light/dark), haptics, living background, listen-to-identify, recent searches |
| `local/store.ts` | AsyncStorage (+ art & lyrics files in the documents folder) | songs imported from the phone, their likes, identification status |
| `auth/store.ts` | refresh token in SecureStore | status (`loading`/`guest`/`authed`), user |
| `player/store.ts` | queue snapshot in AsyncStorage | queue, index, context, repeat, shuffle, playing/buffering; `clock` shared values |
| `library/store.ts` | AsyncStorage | guest likes, playlists, local history |
| TanStack Query | memory | all server data (home, search, albums, `me/*`) |
| `audio/sound.ts` | AsyncStorage | EQ bands / preset / headphone profile, ReplayGain, downmix, bit-perfect; pushed to the native output stage on change |
| `lib/diagnostics.ts` | AsyncStorage (last 80 entries) | errors and playback failures, shared from Settings → Diagnostics |

All persisted stores write through `lib/storage.ts`, which coalesces writes: the latest state is kept
in memory and serialised once things go quiet (700 ms) or immediately when the app is backgrounded,
instead of stringifying the whole store on every change.

### Library: guest ⇄ account

`library/hooks.ts` exposes one API (`useLikedTracks`, `toggleLike`, `usePlaylists`,
`createPlaylist`, `addToPlaylist`, …). Signed out, it reads/writes the device store; signed in, it
uses the server with optimistic updates. On sign-in, guest likes and playlists are uploaded and the
local copy cleared. History is always mirrored locally so "Recently played" is instant.

### Songs on this phone

`local/` holds everything for the user's own files: `tags/` (pure-TS tag, artwork, duration and
quality reader + clip cutter, unit-tested), `import.ts` (file/folder pickers, building `Track`s with a
`local` block), `identify.ts` (embedded → cached → `/v1/identify` → `/v1/identify/audio` lyrics), and
`store.ts`. Imported tracks have `provider: 'local'` and `local.uri`; the engine plays that URI directly.
Their likes stay on the device and they're kept out of server-synced playlists. Details:
[LOCAL_MUSIC.md](LOCAL_MUSIC.md).

## Chrome

Every floating or framing piece of UI (dock, mini player, sheets, toasts, top bar, search field) is a
`Surface` (`components/ui/Surface.tsx`) in one of four tones. Colours come from the theme tokens
(`chrome`, `chromeBorder`, `chromeSheen`, `bar`, `scrimSurface`). See
[DESIGN.md → Surface](DESIGN.md#signature-components).

## Theming

`theme/tokens.ts` defines `darkColors` and `lightColors`; `ThemeProvider` picks one from
Settings → Appearance (or the system), and `useColors()` / `makeStyles((c) => …)` read it.
The full player is wrapped in `<ThemeScope scheme="dark">` so it stays dark over album art in light mode.

## Playback

See [ARCHITECTURE.md → The player engine](ARCHITECTURE.md#the-player-engine-mobilesrcplayer).

- Background playback and the media notification come from expo-audio's foreground service
  (`enableBackgroundPlayback`) and `setActiveForLockScreen(…, { showNextTrack, showPreviousTrack })`.
- Audio session: `doNotMix` (other apps pause), plays in silent mode, continues in background.
- Android 13+: notification permission is requested on first play (needed to show controls).
- Previous: restarts the song if >3 s in, otherwise goes back.
- Errors: ExoPlayer goes idle after any playback error and ignores next/skip until re-prepared, so the
  engine **rebuilds the native playlist** and continues with the next song. A song on the phone that
  failed to open is first retried from a cached copy; one the phone can't decode (e.g. some 6-channel
  192 kHz FLACs) gets a clear message naming the format.
- Pressing play after the queue has ended restarts the last song.
- Last session restores paused at the saved position.

## Performance notes

- All animation (dock, player morph, scrubber, lyrics highlighting, tab lens) runs on the UI thread
  via shared values; React re-renders only when the track or play state changes.
- The playback clock is interpolated every frame from 250 ms native updates (`PlaybackClock`) —
  only while playing; when paused the engine writes the position directly.
- Scrubber times use an animated `TextInput` (`ReText`) — no re-renders while playing.
- Lists: FlatList with tuned windows for shelves, FlashList for the queue; rows are memoised and
  subscribe to the player store with narrow selectors.
- Images: expo-image with memory+disk cache, recycling keys, sized sources (150/500/1000 px).
- Living background renders at 1/25th of the pixels, only while the player is open, and is unmounted
  when the player collapses. The title marquee only animates while visible.
- Heavy panels (lyrics) mount a frame after the panel animation starts.
- Fonts: only the five weights used are bundled.
- Icons: `babel/lucide-direct-imports.js` rewrites `import { Play } from 'lucide-react-native'` to the
  single icon file, so only the ~80 icons used are bundled instead of all ~2 000 (JS bundle 6.4 → 4.7 MB,
  faster cold start).
- Folder imports walk one folder per tick and resolve real file names in batches, so the UI keeps
  moving on folders with thousands of songs.

### Crashes and errors

`_layout.tsx` exports an `ErrorBoundary` (a "Something went wrong · Try again" screen instead of a
white screen), and `installGlobalHandlers()` records uncaught errors and unhandled promise rejections.
Error toasts and playback failures (Media3 error code, file format) go to the same log. **Settings →
Diagnostics → Share** sends it with the app version and server, without tokens or personal data.

## Configuration

Build-time (`app.config.ts`):

| Env | Effect |
|---|---|
| `EXPO_PUBLIC_API_URL` | Default server URL baked into the build |
| `AURA_ALLOW_CLEARTEXT=true` | Allow `http://` (sets `usesCleartextTraffic`); LAN testing only |

Runtime: **Settings → Server** overrides the baked URL (validated with a live `/v1/config` check).

## Tests

`npm test` (vitest) covers the pure modules: the tag reader / clip cutter
(`src/local/tags/tags.test.ts`, with small ffmpeg-made fixtures in `__fixtures__/`) and quality
assessment (`src/lib/quality.test.ts`). UI is checked on device and in the web preview.

## Adding a screen

1. Create `src/app/<name>.tsx` (or a folder with `[param].tsx`).
2. Use `useDockGeometry().contentInset` as bottom padding so content clears the dock.
3. For collection-style pages reuse `CollectionScreen`.
4. Pass `dockScrollWorklet` in your scroll handler if the dock should minimise on scroll.
