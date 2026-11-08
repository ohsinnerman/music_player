# Getting started

## Prerequisites

| Tool | Version | For |
|---|---|---|
| Node.js | 22 LTS | backend + mobile tooling |
| JDK | 17 | building the Android app locally |
| Android Studio / SDK | latest, API 36 | local Android builds & emulator (optional if you use GitHub Actions) |
| A phone | Android 8+ | USB debugging on, or just install the APK |

## 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # defaults work for local dev
npm run dev                 # http://localhost:4000  (hot reload)
```

Check it: `curl http://localhost:4000/v1/health` → `{"data":{"status":"ok",…}}`

With no `MONGODB_URI` the server uses an in-memory store (accounts vanish on restart) and an
ephemeral JWT secret. That's fine for development; production refuses to start like that.

### Offline demo mode

```bash
npm run demo
```

Runs the real API against a fake upstream with fictional artists, generated SVG artwork, synced
lyrics and a 20-second test tone, so you can work on the UI with no internet. Never deploy it.

### Tests

```bash
npm test          # 30+ API tests: auth, rotation & reuse detection, isolation, validation, SSRF…
npm run typecheck
```

## 2. Mobile app

The app uses native modules (audio, Skia, blur, secure storage), so it runs in a **development build**,
not Expo Go.

```bash
cd mobile
npm install
```

### On your phone over Wi-Fi (fastest loop)

1. Find your computer's LAN IP (e.g. `192.168.1.20`). Phone and computer on the same Wi-Fi.
2. Start the backend (`npm run dev` or `npm run demo`).
3. Build & install a dev build with USB debugging on:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 AURA_ALLOW_CLEARTEXT=true npx expo run:android
```

`AURA_ALLOW_CLEARTEXT=true` permits plain-http servers — only for LAN testing. Release builds
default to https-only.

After the first install, `npx expo start` gives you fast refresh.

### Web preview (UI only)

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000 AURA_ALLOW_CLEARTEXT=true npx expo start --web
```

Handy for layout work; the native-only parts (Skia background, lock-screen controls) use web fallbacks.

## 3. Using the app

- First launch shows onboarding → **Continue as guest** or create an account.
- If the build has no server baked in, go to **Settings → Server**, paste your backend URL, tap
  **Test & save**.
- Long-press any song for actions (play next, add to playlist, radio, go to artist…).
- Swipe the mini player left/right to skip, up to open. Drag the full player down to close.
- In the player: 🎤 lyrics, ☰ queue.

## 4. Get an APK

See [BUILD_APK.md](BUILD_APK.md) — the GitHub Actions workflow does it for you.
