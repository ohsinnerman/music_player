# Changelog

## 1.2.6-beta — 2026-11-12

Liquid glass removed; solid, animated dark chrome instead.

- **Removed all liquid glass:** Haze Material 3 glass, Aura's own GPU lens (`aura-liquid-glass` module),
  Apple's Liquid Glass on iOS (`expo-glass-effect`), the expo-blur backdrop, the Settings → Glass slider
  and the Haze toggle. Saved settings drop the old glass values on update.
- **New `Surface`** for the dock, mini player, sheets, toasts, cast volume overlay, top bar, search field
  and sign-in card: solid layered colours from the theme, hairline edge, a faint top light and a soft
  shadow on floating pieces. Same look on every phone, nothing to blur.
- **Dock:** an ember highlight slides (with a small stretch) between tabs; the active icon cross-fades to
  ember with a pop and its label brightens; search lights up ember while open.
- **Toasts** carry a green / red wash for success / error.
- **Palette:** dark layers re-stepped (`#09090C` → `#0F0F14` → `#16161D` → `#1E1E27`, chrome `#18181F`)
  so floating pieces separate cleanly from the page; light theme gets white chrome with an ink hairline.

## 1.2.5-beta — 2026-11-10

Google Cast, after the first good run of Aura's TV screen on a 2013 Chromecast.

- **Volume buttons control the Chromecast** while casting, in 5 % steps, also while paused, with an
  on-screen level overlay. The phone's own volume is left alone. Aura's slider follows volume changes
  made anywhere (TV remote, Google Home, another phone) and no longer jumps back while you drag it.
- **Song changes:** status from the previous song is ignored (no double skips, no progress-bar jumps
  after skip / seek); play shows as playing straight away; 96 kHz+ songs are stepped over in one go
  with one message; after 3 failed songs in a row Aura stops instead of running through the queue.
- **Aura's screen falls back to Google's** when it can't start on a device, and says so, instead of
  failing the cast.
- **Device list:** tapping a device that dropped off the list (restarted / changed address) searches
  again and retries once. The stray "didn't answer" warnings 20 s after a failed tap are gone.
- **TV screen sheet** shows each device's IP address and model.
- **Diagnostics:** Cast errors in plain words with Cast's own reason next to the code (e.g. "Bedroom TV
  ended the cast — <reason> (code 2160)"); repeats folded into one line with a count; every line says which version
  wrote it; casting milestones (connected, which screen, what's playing); a *Casting* section in the
  shared report (devices, IPs, screens); the preview in Settings shows only problems.

## 1.2.4-beta — 2026-11-10

Google Cast fixes from the first real Chromecast test.

- Fixed: the Google Cast device list was read off the main thread ("Must be called from the main thread"); the list is now cached by the main thread and read from there.
- Fixed: casting failed with "Cannot convert '[object Object]' to a Kotlin type" — the load request (with lyrics / up next that can be null) now goes to the native side as JSON.
- Fixed: setting Aura's TV screen App ID hid every Chromecast that can't run it yet (unpublished app, device not registered or not restarted). Devices now always show up; ones that can't run Aura's screen play with Google's screen, and the picker says so.
- TV screen sheet lists your Cast devices and whether each one shows Aura's screen yet.
- The "Playing on" card says which TV screen the session uses.

## 1.2.3-beta — 2026-11-10

The 1.1.0-beta line so far (from here on every commit bumps the version by one, see CLAUDE.md).

Focus: speed, stability, sound quality, receivers, library.

- Optimization and bug-fix pass
  - JS bundle 27% smaller (6.4 → 4.7 MB): icons are imported one by one instead of the whole set
  - Saving settings / library no longer re-writes everything on every change (writes are batched)
  - Long lists render in smaller batches; folder imports keep the UI responsive and show "Found N songs…"
  - Fixed: songs imported from files or folders were named after the Android document id
    ("primary%3AMusic%2F…" or "audio%3A1234"), which hurt title guessing and identification.
    Real file names are now used, and existing songs are repaired on first launch
  - Crash screen with "Try again" instead of a blank app; Settings → Diagnostics shows recent errors and
    playback failures and can share them
- Sound (Settings → Sound & equalizer, [docs/SOUND.md](docs/SOUND.md))
  - 32-bit float output: 24-bit files are no longer reduced to 16-bit
  - 10-band EQ with presets, plus AutoEq headphone correction (~8 800 measured models), no-clip pre-amp
  - ReplayGain track / album with pre-amp, fallback gain and clipping prevention (FLAC, Ogg, Opus R128, MP3, M4A tags)
  - 5.1 / 7.1 → stereo downmix (ITU coefficients)
  - Bit-perfect USB DAC mode on Android 14+ (falls back to the song's own rate when the DAC can't)
  - The Audio quality sheet shows the float stage, applied processing and bit-perfect state
- Play on (docs/DLNA.md)
  - Google Cast: Chromecast, Google TV, Nest speakers, Cast-enabled TVs / receivers and speaker groups, original file
  - Redesigned Spotify-style picker: device that's playing (with song, volume, controls), This phone, Google Cast, DLNA — with TV / speaker / receiver / group icons
  - Yamaha MusicCast remote: power, volume in dB, mute, zones, input, Pure Direct, sound programs, enhancer, sleep
- Library (docs/LOCAL_MUSIC.md)
  - Albums and Artists shelves and pages for the songs on your phone
  - Covers for albums without art, artist photos, year, label, genres and Wikipedia summaries (Deezer, MusicBrainz / Cover Art Archive, Wikipedia; AI only disambiguates); cached for offline use
  - "Is it really lossless?" check: spots FLACs made from MP3/AAC, upsampled Hi-Res and 24-bit padded from 16-bit
- Aura's own Chromecast / Google TV screen (custom Cast receiver at `/cast/receiver`): cover on its
  colours, quality badge, progress, up next and synced lyrics; light enough for the 1st-gen Chromecast.
  Set up in Settings → TV screen (needs a Cast App ID). Files above 96 kHz now give a clear message on
  Google Cast instead of failing silently.
- Android Liquid Glass now drawn by Haze 2.1 (`haze-glass` + Material 3 Glass Style): refraction,
  depth blur, specular, edge light and chromatic aberration on every glass surface (Android 13+;
  Settings → Haze glass switches back to Aura's own lens). The app now builds with Kotlin 2.3.20.
- iOS ([docs/IOS.md](docs/IOS.md))
  - Apple's Liquid Glass (iOS 26, `UIGlassEffect`) on every glass surface, following the Glass slider; system blur on older iOS
  - Manual *iOS build* workflow: unsigned IPA from Xcode 26 on macOS 26, attached to the pre-release

## 1.0.0-alpha — 2026-11-09

First public alpha: commit `9812ede`, APK `aura-1.0.0-9812ede.apk` (attached to the `latest` release).

- Streaming from Audius / Deezer previews / Jamendo, search, radio, library, playlists, accounts with sync
- Full-screen player with living artwork, synced lyrics (LRCLIB), queue, sleep timer, lock-screen controls
- Light / dark themes; glass material slider (Liquid Glass ↔ Frosted ↔ Opaque) with a GPU refraction lens on Android 13+
- Your own music: FLAC, WAV, MP3, M4A (AAC/ALAC), OGG, Opus, AIFF from files or folders; on-device tag, cover and lyrics reading
- AI song identification and lyrics (tags → file name → Groq LLM → Whisper listening)
- Audio quality badges and a Poweramp-style signal path
- Play on Wi-Fi receivers (DLNA), original file, Android mixer bypassed
- Backend: Express 5 on Vercel, MongoDB, rotating refresh tokens, rate limits
