# Aura (mobile)

Expo SDK 58 / React Native 0.88 app. Native modules (audio, Skia, blur) mean it runs in a
development build, not Expo Go.

```bash
npm install
EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000 AURA_ALLOW_CLEARTEXT=true npx expo run:android
npm run typecheck && npm run lint
EXPO_PUBLIC_API_URL=https://your-api npm run build:apk   # local release APK
```

Docs: [Mobile internals](../docs/MOBILE.md) · [Design system](../docs/DESIGN.md) ·
[Building the APK](../docs/BUILD_APK.md)
