# Play on Wi-Fi speakers & receivers (DLNA)

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
