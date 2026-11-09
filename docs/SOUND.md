# Sound: EQ, ReplayGain, 24-bit output, downmix, bit-perfect USB

**Where:** Settings → **Sound & equalizer** (Android). The Audio quality sheet shows what's applied
to the song that's playing.

## The output stage

Stock expo-audio (Media3 ExoPlayer) decodes to 16-bit and, when asked for float output, skips audio
processors entirely. Aura replaces the player's audio renderers with its own output stage
(`mobile/modules/aura-audio-route/android/…/AuraDsp.kt`):

```
decoder ──► AuraAudioSink ─────────────────────────────► DefaultAudioSink ──► AuraOutputProvider ──► AudioTrack
(float,     convert to float → channel map → downmix      (float output)       bit-perfect USB:
 every      → ReplayGain → EQ (biquads, 64-bit state)                           preferred mixer attributes,
 channel)   → clamp                                                              float → int32 if needed
```

- The sink tells the decoder it takes float directly, so MediaCodec decodes FLAC/ALAC/WAV straight to
  32-bit float: **24-bit files keep all 24 bits** (float has a 24-bit mantissa). Unity gain with no EQ
  is bit-exact (tested).
- Everything is applied per buffer with the settings read live, so EQ / ReplayGain changes are heard
  immediately; changing the downmix setting applies from the next song (it changes the channel count).
- Hooking in: expo-audio has no RenderersFactory option, so `mobile/scripts/patch-expo-audio.js`
  (run on `npm install`) adds `.setRenderersFactory(auraRenderersFactory(context))` to its two
  `ExoPlayer.Builder` calls and a helper that finds `AuraDsp` by reflection — falling back to the
  stock factory if the module is missing. The script fails the install if expo-audio changes shape.

## Equalizer

- **10 bands** (31 Hz – 16 kHz, one-octave peaking filters, ±12 dB) and **presets** (Bass boost,
  Vocal, Loudness, …). Drag a band, double-tap to reset.
- **Headphone correction (AutoEq):** search ~8 800 measured headphones and IEMs; the parametric EQ
  that makes them neutral (oratory1990 measurements preferred) is applied under your bands. The server
  reads AutoEq's published `results/INDEX.md` and `ParametricEQ.txt` from GitHub (`GET /v1/eq/search`,
  `GET /v1/eq/profile` — only paths listed in the index are fetched).
- **No clipping:** the combined curve's biggest boost is offset with a negative pre-amp (computed from
  the same filter maths the native side uses — `src/audio/eq.ts` ↔ `Dsp.kt`, both RBJ cookbook
  biquads), and the output is clamped as a last resort.
- The curve on screen is the exact magnitude response of the active filters.

## ReplayGain

- **Off / Track / Album** (album falls back to track gain). Tags are read by the player from the
  stream's metadata at each song change, so the gain is sample-accurate even with gapless playback:
  Vorbis comments (FLAC, Ogg, Opus), ID3 `TXXX` (MP3), MP4 `----:com.apple.iTunes:replaygain_*`
  (M4A), and Opus `R128_*_GAIN` (converted to the ReplayGain reference).
- **Pre-amp** (added to the tag value), **Songs without tags** (fallback gain — also used for
  streams) and **Prevent clipping** (never boost past the song's peak).
- The tag reader in the app (`src/local/tags`) reads the same tags for display.

## Surround → stereo

5.1 / 7.1 files are mixed down with the ITU-R BS.775 coefficients (centre and surrounds −3 dB, LFE
dropped), normalised so a full-scale mix can't clip. Turn it off for multichannel USB/HDMI DACs.

## Bit-perfect USB DAC (Android 14+)

With the toggle on and a USB DAC as the output, each time the player opens the audio track Aura asks
Android (`AudioManager.setPreferredMixerAttributes`) to open the DAC:

1. **Bit-perfect** at the song's own sample rate, if the DAC offers it — float, or 32-bit integer
   (the track is then opened as 32-bit and samples converted exactly; a 24-bit sample becomes the same
   value shifted left by 8). EQ and ReplayGain pause automatically so the samples are untouched.
2. Otherwise **at the song's own rate** (no resampling), with Android's mixer and volume still in place.

The Sound screen and the Audio quality sheet say which one is active. In bit-perfect mode Android's
volume may be fixed at full — use the DAC's own volume. Turning the toggle off releases the DAC.

## What isn't claimed

- On the built-in speaker, wired headphones or Bluetooth, Android's mixer still runs at its own rate
  (usually 48 kHz) and applies volume; Aura keeps 24-bit precision into that mixer.
- Bluetooth re-compresses audio whatever the app does.

## Tests

- `modules/aura-audio-route/test/DspTest.kt` (desktop JVM, no Android): 24-bit/16-bit/big-endian
  reads, 24-bit → float → int32 exactness, downmix normalisation, biquad targets, EQ gain on a sine,
  clamping, ReplayGain parsing / modes / clipping prevention.
- `src/audio/eq.test.ts` (curve maths, auto pre-amp), `src/local/tags/tags.test.ts` (ReplayGain tags),
  `src/lib/quality.test.ts` (signal path with the float stage and bit-perfect), backend
  `test/autoeq.test.ts`.
