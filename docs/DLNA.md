# Play on TVs, speakers & receivers (DLNA, Google Cast, MusicCast)

The **Play on** picker (full player → cast button, or Settings → Play on Wi-Fi speakers) lists, like
Spotify Connect: the device that's playing (with what's on, its volume and controls), **This phone**,
**Google Cast** devices (Chromecast, Google TV, Nest speakers, Cast-enabled TVs and receivers, speaker
groups) and **DLNA** speakers & receivers. Each shows an icon for what it is (TV, speaker, receiver,
group).

## DLNA

Send songs from Aura to a network receiver or speaker — e.g. a **Yamaha RX-V485** — as the **original
file**. The receiver downloads it from the phone over Wi-Fi and decodes it itself, so Android's decoder,
mixer, resampler and volume are bypassed: bit-perfect up to the receiver's DAC. It's what BubbleUPnP's
"local media server + renderer, transcoding off" does, built into the player.

**Where:** full player → the **cast** button (bottom bar, next to Queue), or **Settings → Play on Wi-Fi
speakers**. Pick the receiver; pick **This phone** to come back.

## What it does

```
Aura (phone)                                         Receiver (DLNA MediaRenderer)
 ├─ SSDP M-SEARCH (UDP multicast 239.255.255.250) ─▶ "I'm RX-V485, description at http://…/desc.xml"
 ├─ GET description → AVTransport + RenderingControl control URLs
 ├─ tiny HTTP media server on the Wi-Fi address  ◀── GET /m/<128-bit token>.flac  (Range: bytes=…)
 └─ SOAP: SetAVTransportURI(url, DIDL-Lite) → Play / Pause / Seek / GetPositionInfo / SetVolume
```

- **No transcoding, ever.** FLAC goes as FLAC (24/192 included), WAV as WAV, MP3 as MP3. The
  DIDL-Lite metadata tells the receiver the format, sample rate, bit depth, channels, title, artist,
  album and cover art.
- **Seeking** works through HTTP Range requests; the server is byte-exact (tested against real files).
- **Queue, next/previous, repeat** keep working: Aura watches the receiver's transport state and sends
  the next song when one ends.
- **Volume** in the Play-on sheet controls the receiver (RenderingControl), not the phone.
- **Catalog songs** (Audius / Jamendo streams, Deezer previews) can be sent too: the phone relays the
  stream unchanged, so receivers without HTTPS support still play them.
- **Screen off:** a foreground service ("Playing on …") keeps the phone's server running and holds a
  Wi-Fi lock, so playback doesn't stop when the phone sleeps.
- The Audio quality sheet switches to the DLNA path: *File → Wi-Fi (DLNA, original file) → decoded by
  the receiver → its DAC*, with a "Bit-perfect" verdict for lossless files.

## Google Cast

- Uses Google's **Default Media Receiver** (no custom receiver app needed). Discovery runs only while
  the picker is open (MediaRouter active scan).
- The Cast device fetches the **original file** from the phone's media server (the same one DLNA
  uses) — FLAC stays FLAC. Cast devices play FLAC up to 24-bit / 96 kHz, WAV, MP3, AAC, Opus, Vorbis.
  Catalog songs are relayed by the phone.
- Play / pause / seek / next / volume work from Aura; when a song finishes the next one is loaded.
- Needs Google Play services. Code: `modules/aura-cast/…/GoogleCast.kt` (Cast framework 22.x),
  `src/cast/session.ts` (`kind: 'gcast'`).
- Every Google Cast device decodes **up to 96 kHz**. A 176.4 / 192 kHz file is skipped with a message
  ("play it on a DLNA receiver instead") rather than failing silently.

### Aura on the TV (custom Cast screen)

Instead of Google's plain player, the Chromecast can show **Aura's own screen**, like Apple Music's:
the cover on a background made from its colours, the title and artist, a quality badge
(`HI-RES 24/96`, `LOSSLESS 16/44.1`), a progress bar with elapsed / remaining time, *Up next* near the
end of a song, and — when the song has synced lyrics — the cover moves left and the lyrics scroll on the
right, the current line in white.

- It's a Cast *Custom Web Receiver*: a web page the Chromecast loads, served by the Aura server at
  **`/cast/receiver`** (`backend/src/cast/receiver.ts`). Preview it in any browser at
  `/cast/receiver?demo=1` (add `&lyrics=1` for the lyrics layout).
- Built for the slowest device: the 1st-gen Chromecast (2013, model H2G2-2A) — plain ES2015, no blur
  or backdrop filters, only opacity / transform animations, no extra players downloaded.
- The phone sends the extras in the load request's `customData` (`src/cast/tvScreen.ts`); lyrics that
  arrive later (network / AI identification) follow as a message on `urn:x-cast:app.aura`.

**Set-up (once):** Settings → Play on TVs & speakers → **TV screen** walks through it:

1. In the [Google Cast SDK Developer Console](https://cast.google.com/publish) (one-time US$5), add a
   **Custom Receiver** named Aura with the Receiver URL `https://<your server>/cast/receiver`.
2. While it's unpublished, add your Chromecast's serial number as a test device and restart the
   Chromecast (~15 min to apply). Publishing it later makes it work on any Chromecast.
3. Paste the 8-character App ID into Aura. Leave it empty to go back to Google's screen.

## Yamaha MusicCast remote

MusicCast receivers (RX-V485 and friends) also expose the *Yamaha Extended Control* API. Aura finds
it in the receiver's DLNA description (`yamaha:X_yxcControlURL`) and shows a **sliders** button next to
the receiver (and a **Receiver** button while playing on it):

- **Power** (and standby), **volume in dB** with mute, **zones** (Main / Zone 2) when present
- **Input** (HDMI, AV, Server, Net Radio, Bluetooth, AirPlay… with the names you gave them)
- **Pure Direct** — the shortest analogue path, recommended for lossless; **sound programs** (Straight,
  2ch Stereo, DSP halls…), **Compressed Music Enhancer**, **sleep** timer

All calls are plain HTTP GETs on the LAN (`system/getFeatures`, `getNameText`, `<zone>/getStatus`,
`setPower`, `setVolume`, `setInput`, `setPureDirect`, `setSoundProgram`…). Code: `src/cast/yxc.ts`
(parsing, unit-tested), `src/cast/musiccast.ts`, `src/components/cast/ReceiverSheet.tsx`.

## Receiver setup (Yamaha RX-V485)

1. Same Wi-Fi as the phone (2.4 or 5 GHz on the same router is fine; guest networks usually block it).
2. *Setup → Network → Network Standby: On* so it can be woken from Aura.
3. Nothing else: MusicCast receivers are DLNA renderers out of the box. Aura shows it by its
   room name (e.g. "Living Room") with "Yamaha RX-V485" underneath.

The RX-V485 plays FLAC/WAV/AIFF up to 192 kHz / 24-bit, ALAC up to 96 kHz / 24-bit, MP3, AAC.
Multichannel FLAC over the network depends on the receiver; if it refuses a file Aura says
"… can't play this file type" and moves to the next song.

## Code

| Piece | Where |
|---|---|
| SSDP discovery (multicast lock), LAN HTTP client for SOAP, media server (Range, DLNA headers, https relay), foreground service | `mobile/modules/aura-cast` (Kotlin) |
| Description / SOAP / DIDL-Lite / time parsing (unit-tested) | `mobile/src/cast/upnp.ts`, `upnp.test.ts` |
| Session: connect, load, play/pause/seek, volume, 1 s polling, end-of-song, connection loss | `mobile/src/cast/session.ts` |
| Engine routing (transport controls go to the receiver while casting; the phone's player stays parked) | `mobile/src/player/engine.ts` |
| Play-on sheet, cast button, receiver volume slider | `mobile/src/components/cast/CastSheet.tsx` |

## Security

- The media server listens on the **Wi-Fi address only** (never cellular), serves **only songs Aura
  registered** for the receiver, each behind an unguessable 128-bit token, and is shut down when you
  switch back to the phone.
- The SOAP client only talks to **local-network addresses** (10/8, 172.16/12, 192.168/16,
  link-local); the app's normal network stack still refuses cleartext HTTP.
- Permissions are all "normal" (no prompts): Wi-Fi state, multicast, foreground media service.

## Troubleshooting

- **Nothing found:** receiver on / network standby on; same network (not guest); some routers block
  multicast between Wi-Fi bands ("AP isolation", "IGMP snooping" misconfigured) — try putting the phone
  on the same band. Tap the refresh button to search again.
- **Found but won't play:** the receiver couldn't fetch from the phone — a VPN or "private DNS"
  profile on the phone can block local connections; turn it off and retry.
- **Stops when the screen is off:** some phones (Xiaomi, Oppo, Vivo…) kill background apps
  aggressively. Allow Aura to "run in background" / disable battery optimisation for it.
