# Your own music + AI lyrics

Aura can play songs that are already on your phone (FLAC, WAV, MP3, M4A/AAC/ALAC,
OGG Vorbis, Opus, AIFF) and find synced lyrics for them, even when the files have
messy or missing tags.

**In the app:** Library → **On this phone** → *Add songs* (pick files) or *Add a folder*
(everything inside it, including subfolders). Songs show up right away with their own
title, artist, album and cover art. Open the player and tap **Lyrics**.

## What happens to a file

```
pick files / folder (Android Storage Access Framework, read-only, remembered)
        │
        ▼
mobile/src/local/tags   ── reads only the bytes it needs, never the whole file
  ID3v1 / ID3v2.2–2.4 (APIC cover, USLT/SYLT lyrics, TXXX), FLAC (STREAMINFO,
  VORBIS_COMMENT, PICTURE), Ogg Vorbis/Opus comments, MP4 ilst atoms (©nam ©ART
  ©alb covr ©lyr), WAV LIST/INFO + id3 chunk, AIFF COMM + ID3. Duration from
  Xing/VBRI, STREAMINFO, granule positions, mvhd or the data chunk.
        │
        ├─ title / artist / album from tags, or "Artist - Title" from the file name
        ├─ codec, bit depth, sample rate, bitrate, encoder → quality badge (AUDIO_QUALITY.md)
        ├─ cover art saved as a small image in the app's folder
        └─ lyrics inside the file (LRC in USLT, SYLT, LYRICS, ©lyr) → used as-is, offline
```

The audio is played **in place** — Aura keeps a read permission to the original file. If a phone's
media player can't open picked files directly (some storage providers hand out URIs only the app can
read), Aura notices the first failure, copies that song into its cache once, plays the copy, and from
then on prepares copies of the next two songs ahead of time (`src/local/playback.ts`; cache capped at
1.5 GB, oldest first, and the OS may clear it). Removing a song from Aura leaves the file on your phone.

## Finding the right song and its lyrics

When you open lyrics for an imported song (or tap ✨ *Find lyrics for all songs*):

1. **Embedded lyrics / cache** — instant, no network.
2. **`POST /v1/identify`** on your server, cheapest step first:
   1. the file's own tags → LRCLIB
   2. an "Artist - Title" guess from the file name (both orders) → LRCLIB
   3. LRCLIB free-text search, accepted only when the duration matches within 3 s
   4. **Groq LLM** (`openai/gpt-oss-20b`, strict JSON schema) reads the tags + file name
      and returns the canonical title/artist (+ up to 3 alternatives) → LRCLIB
3. **`POST /v1/identify/audio`** — only if still unknown: the app cuts a ~20 s clip
   from about 30 % into the song (no re-encoding; a valid MP3/FLAC/WAV/Ogg/Opus/M4A
   excerpt, ≤ 3.5 MB), the server sends it to **Groq Whisper** (`whisper-large-v3-turbo`),
   and the LLM recognises the song from the words it heard → LRCLIB. Each song is
   listened to at most once automatically; you can turn this off in
   *Settings → Songs on this phone → Listen to identify songs*.

If the song had no usable tags, what Aura learns (real title, artist, album) is written
back into your library. Your own tags are never overwritten.

## Server setup

Add to your server's environment (Vercel → Project → Settings → Environment Variables):

| Variable | Default | |
|---|---|---|
| `GROQ_API_KEY` | — | From https://console.groq.com/keys. Without it, steps 2.1–2.3 still work. |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Any Groq chat model; strict JSON schemas are used when supported. |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | |
| `RATE_LIMIT_IDENTIFY_PER_MIN` | `30` | per IP |
| `RATE_LIMIT_IDENTIFY_AUDIO_PER_HOUR` | `40` | per IP |
| `AI_DAILY_LIMIT` | `2000` | Groq calls per server instance per UTC day — protects your key. |

Redeploy after adding them. `GET /v1/config` then reports
`features: { identify: true, ai: true, listen: true }`.

The key stays on the server: the app never sees it, it isn't logged, and errors from
Groq are mapped to generic messages (`ai_unavailable`, `ai_rate_limited`).

## Privacy

- Tags, file names and durations are sent to your server for identification.
- Audio clips are only sent when listening is enabled, are forwarded to Groq for
  transcription, and are not stored by Aura's server.
- LLM output is validated (zod) and only ever used as a lyrics search query.

## Quality

Every imported song gets a quality tier — **Hi-Res Lossless**, **Lossless**, or the bitrate for lossy
files — shown in lists and the player, with a full *How it’s playing* breakdown on tap. See
[AUDIO_QUALITY.md](AUDIO_QUALITY.md).

## Limits

- M4A files whose index (`moov`) sits at the end of the file can't be clipped without
  re-encoding, so they are identified from tags/file name only.
- Songs on your phone stay on your phone: they can be liked and added to on-device
  playlists, but not to account playlists synced to the server.
- Android only for importing (the web preview shows the screens but can't read files).
