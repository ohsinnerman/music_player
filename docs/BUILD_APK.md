# Building the APK

## Option 1 — GitHub Actions (no Android SDK needed)

The workflow `.github/workflows/android-apk.yml` builds a release APK on every push to `main` that
touches `mobile/`, and whenever you click **Run workflow**.

1. **Set your backend URL** (optional but recommended):
   GitHub → repo **Settings → Secrets and variables → Actions → Variables → New variable**
   `API_URL` = `https://your-backend.example.com` (no trailing slash).
2. **Run it:** **Actions → Android APK → Run workflow**. You can also type a one-off URL there, and
   tick "Allow http://" if you want to test against a LAN server (not for daily use).
3. **Download:** when the run is green, get the APK from
   - the **latest** release: `https://github.com/ohsinnerman/music_player/releases/tag/latest`, or
   - the run page → **Artifacts → aura-apk**.
4. **Install** (below).

Builds take ~15–25 minutes (Gradle is cached after the first run).

### Your own signing key (recommended)

Without secrets, the APK is signed with the template's debug key — fine for your phone, but anyone
with the public debug key could sign an "update". To use your own key:

```bash
keytool -genkeypair -v -storetype JKS -keystore aura-release.jks \
  -alias aura -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 aura-release.jks > aura-release.jks.b64     # macOS: base64 -i aura-release.jks
```

Add repository **secrets**: `ANDROID_KEYSTORE_BASE64` (contents of the .b64 file),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`aura`), `ANDROID_KEY_PASSWORD`.
Back up the `.jks` somewhere safe — you need the same key for every future update.

> Switching from the debug key to your key changes the signature: uninstall the old app once before
> installing the new one.

## Option 2 — Build locally

Requirements: Node 22, JDK 17, Android SDK (Android Studio installs it; set `ANDROID_HOME`).

```bash
cd mobile
npm ci
EXPO_PUBLIC_API_URL=https://your-backend.example.com npm run build:apk
# → mobile/android/app/build/outputs/apk/release/app-release.apk
```

For your own key locally, export `AURA_UPLOAD_STORE_FILE`, `AURA_UPLOAD_STORE_PASSWORD`,
`AURA_UPLOAD_KEY_ALIAS`, `AURA_UPLOAD_KEY_PASSWORD` before building
(`mobile/plugins/withReleaseSigning.js` reads them).

Only `arm64-v8a` is built by default (practically every phone from the last 8+ years — keeps the APK
small). Set `AURA_ABIS=arm64-v8a,armeabi-v7a` for very old phones, or add `x86_64` for an emulator.

## Option 3 — EAS Build (Expo's cloud)

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

`eas.json` has a `preview` profile that outputs an APK. Set `EXPO_PUBLIC_API_URL` in the EAS
environment variables first.

## Installing on your phone

1. Copy/download the `.apk` to the phone.
2. Open it; allow "Install unknown apps" for your browser/file manager when prompted.
3. Launch **Aura** → onboarding → if no server was baked in, **Settings → Server** → paste your
   backend URL → **Test & save**.
4. First play asks for notification permission — allow it to get lock-screen controls.

Updates: install a newer APK over the old one (same signing key).
