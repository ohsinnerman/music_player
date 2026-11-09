# Audio quality & signal path

Every song has a quality badge, and a tap on it shows exactly **what the file is** and **how this
phone is playing it**, step by step. It's inspired by Poweramp's output info and Apple Music's
Lossless badge, but written in plain language.

**Where:** the badge in the middle of the full player's bottom bar (e.g. `HI-RES 24/96`,
`LOSSLESS 16/44.1`, `MP3 320`) → tap. Also from any song's **⋯ → Audio quality**. Imported
songs show a small `HI-RES` / `LOSSLESS` tag in lists, and *On this phone* shows a summary
(`12 Hi-Res · 40 Lossless · 8 lossy`) with **Lossless only** / **Hi-Res** filters.

## 1 · What the file is

Read on the phone by `mobile/src/local/tags` (no server involved):

| Field | Where it comes from |
|---|---|
| Codec | FLAC, ALAC, PCM (WAV/AIFF), MP3, AAC, Vorbis, Opus |
| Bit depth | FLAC STREAMINFO, ALAC `alac` config atom, WAV `fmt `, AIFF `COMM` (lossless only — lossy codecs have none) |
| Sample rate | the same headers; ALAC uses its config atom because the MP4 entry field tops out at 65 535 Hz |
| Bitrate | CBR MP3: frame header; VBR MP3: Xing/VBRI frame count; others: size ÷ duration |
| Encoder | LAME/Lavc tag in the MP3 Xing header, or the Vorbis-comment vendor string (FLAC/Ogg) |
| VBR / CBR | Xing (VBR) vs Info (CBR) header, LAME method byte |

The sheet re-reads these every time it opens, so songs imported by older versions get the full details
too.

### Tiers (`mobile/src/lib/quality.ts → assess`)

| Tier | Rule | Badge |
|---|---|---|
| **Hi-Res Lossless** | lossless and (> 16-bit or > 48 kHz) | gold, 5 bars |
| **Lossless** | FLAC / ALAC / PCM up to 16-bit 48 kHz (16/44.1 = "CD quality") | 4 bars |
| **High quality** | MP3 ≥ 256 kbps, AAC/Vorbis ≥ 192, Opus ≥ 128 | 3 bars |
| **Standard** | MP3 ≥ 160, AAC/Vorbis ≥ 128, Opus ≥ 96 | 2 bars |
| **Low bitrate** | below that | 1 bar |

Catalog songs are labelled from what the source delivers: Deezer previews are 128 kbps MP3; Audius
and Jamendo streams are marked as *typical* values (`~320 kbps`), because the exact stream isn't
measured.

## 2 · How it's playing (`signalPath`)

```
File ──► Decode ──► Android mixer ──► Output
FLAC     24 → 16-bit   96 → 48 kHz      Wired / USB DAC / Bluetooth / speaker
24/96    PCM          + volume, effects
```

Each step is marked ✓ clean, ⊖ small compromise, ⚠ lossy, or ⓘ info:

- **Decode** — the player (expo-audio / Media3 ExoPlayer, default settings) decodes to 16-bit PCM.
  24-bit files are therefore reduced to 16-bit; that still covers 96 dB of dynamic range.
- **Android mixer** — Android mixes all audio at its native rate (`PROPERTY_OUTPUT_SAMPLE_RATE`,
  48 kHz on almost every phone), so 44.1 / 88.2 / 96 / 192 kHz songs are resampled. Volume and sound
  effects are applied here, so phone playback is never bit-perfect. With a **USB DAC** the sheet
  checks whether the DAC supports the song's rate, and whether the phone offers Android 14's
  bit-perfect USB mode.
- **Output** — the device media is actually routed to (Android 13+ asks the system directly; older
  versions use the most specific connected device). Bluetooth (SBC / AAC / aptX / LDAC, chosen by
  the phone) and LE Audio (LC3) re-compress audio, so they're marked lossy. Wired, USB, HDMI and line
  out are clean. The built-in speaker is fine but limited.

Below the path: the **effective format** reaching the output (e.g. `16-bit / 48 kHz → Bluetooth`),
a one-line verdict, and tips (e.g. "Use wired headphones or a USB-C DAC for lossless playback").
The sheet updates live when you plug in headphones or connect Bluetooth.

## The native piece

`mobile/modules/aura-audio-route` is a tiny local Expo module (Kotlin, Android only, no permissions):

| JS | Android API |
|---|---|
| `getOutputInfo().mixerSampleRate` | `AudioManager.getProperty(PROPERTY_OUTPUT_SAMPLE_RATE)` |
| `getOutputInfo().device` | `AudioManager.getAudioDevicesForAttributes(USAGE_MEDIA)` (API 33+), else device priority |
| `device.sampleRates / encodings / channelCounts` | `AudioDeviceInfo` |
| `bitPerfectCapable` | `getSupportedMixerAttributes(device)` has `MIXER_BEHAVIOR_BIT_PERFECT` (API 34+) |
| `addRouteListener` | `AudioDeviceCallback` (devices added / removed) |

It's autolinked from `mobile/modules/` by Expo. On web, iOS or an APK built before the module existed,
the JS wrapper returns `{ available: false }` and the sheet shows the output step as "unknown" instead of
crashing.

## Playing on a DLNA receiver

While casting ([DLNA.md](DLNA.md)) the path becomes *File → Wi-Fi (DLNA, original file, no transcoding) →
decoded by the receiver → its DAC*: Android's decoder, mixer and volume aren't involved, so lossless files
get a **Bit-perfect** verdict — the one case where Aura says so.

## What Aura doesn't claim

- No "bit-perfect" label for playback on the phone: Android's shared mixer always applies volume
  (DLNA casting is the exception — the phone doesn't touch the audio).
- The Bluetooth codec in use isn't available to apps, so it's described, not named.
- No spectral analysis ("is this FLAC really an upscaled MP3?") — badges describe the container.

## Tests

`mobile/src/lib/quality.test.ts` (tiers, path verdicts for wired / Bluetooth / USB / unknown output) and
`mobile/src/local/tags/tags.test.ts` (bit depth / rate / encoder from 24/96 FLAC, 24/96 ALAC, 24/48 WAV,
CBR 320 MP3 fixtures). Run `cd mobile && npm test`.
