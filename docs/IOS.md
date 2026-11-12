# iOS

Aura builds for iOS from the same code, with the same solid chrome as Android (`Surface`: layered dark
colours, a hairline edge, soft shadows). Apple's Liquid Glass (`expo-glass-effect`) was used up to
1.2.5-beta and removed in 1.2.6 along with the Android glass.

## Building

The **iOS build** workflow (Actions → *iOS build* → *Run workflow*) builds an **unsigned** Release IPA
on a macOS 26 runner with Xcode 26 and attaches it to the `v<version>` pre-release
(`aura-<version>-<sha>-unsigned.ipa`). It is manual because macOS runners use 10× the Actions
minutes of Linux on private repositories (~25–35 min per build).

### Installing the unsigned IPA

iOS only runs signed apps, so the IPA has to be signed for your device:

- **Sideloadly** or **AltStore** (Windows / macOS) — sign with your Apple ID and install over USB.
  With a free Apple ID the app expires after 7 days and has to be re-signed.
- **Xcode** — or build locally: `cd mobile && npx expo prebuild -p ios && open ios/*.xcworkspace`,
  pick your team under *Signing & Capabilities*, and run on your iPhone.

### TestFlight / App Store

Needs an Apple Developer account ($99/year) and your signing credentials, which only you can
provide: `npx eas-cli build -p ios` (EAS manages certificates), or archive in Xcode and upload with
Transporter. Bundle id: `com.ohsinnerman.aura` (`mobile/app.config.ts`).

## What's Android-only for now

These use Android APIs and are hidden or explained on iOS:

| Feature | Why |
|---|---|
| Sound settings (EQ, ReplayGain, 24-bit float output, downmix, bit-perfect USB) | Built into Android's ExoPlayer output stage ([SOUND.md](SOUND.md)) |
| Play on Google Cast / DLNA / MusicCast remote | Android discovery & media server; on iOS use AirPlay from Control Center |
| "Is it really lossless?" check | Uses Android's MediaCodec decoders |
| Output-device details in the Audio quality sheet | Android `AudioManager` |

Everything else — streaming, library, lyrics, audio quality badges, album / artist pages with web
details, themes — is shared code. Adding songs from the Files app uses the same pickers; it hasn't been
tried on a real iPhone yet, so treat it as beta.
