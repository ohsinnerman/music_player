# Changelog

## 1.1.0-beta — in progress

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
- Sound: 24-bit (float) playback + 5.1 → stereo downmix, bit-perfect USB DAC mode (Android 14+), ReplayGain, parametric EQ with AutoEQ headphone presets
- Receivers: Yamaha MusicCast control, Google Cast (TVs and speakers) in the Play-on picker
- Library: album and artist pages for your own music with covers, photos and bios from the web; fake-lossless detector
- iOS build with native Liquid Glass

## 1.0.0-alpha — 2026-11-09

First public alpha (`v1.0.0-alpha`, APK `aura-1.0.0-9812ede.apk`).

- Streaming from Audius / Deezer previews / Jamendo, search, radio, library, playlists, accounts with sync
- Full-screen player with living artwork, synced lyrics (LRCLIB), queue, sleep timer, lock-screen controls
- Light / dark themes; glass material slider (Liquid Glass ↔ Frosted ↔ Opaque) with a GPU refraction lens on Android 13+
- Your own music: FLAC, WAV, MP3, M4A (AAC/ALAC), OGG, Opus, AIFF from files or folders; on-device tag, cover and lyrics reading
- AI song identification and lyrics (tags → file name → Groq LLM → Whisper listening)
- Audio quality badges and a Poweramp-style signal path
- Play on Wi-Fi receivers (DLNA), original file, Android mixer bypassed
- Backend: Express 5 on Vercel, MongoDB, rotating refresh tokens, rate limits
