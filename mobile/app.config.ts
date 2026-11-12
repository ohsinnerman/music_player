import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration. Values come from environment variables so the
 * same code builds for local testing and for release:
 *
 *   EXPO_PUBLIC_API_URL   https URL of your backend (e.g. https://aura-api.onrender.com)
 *   AURA_ALLOW_CLEARTEXT  "true" only for LAN testing against http://192.168.x.x:4000
 *
 * The server URL can also be changed inside the app (Settings → Server).
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const allowCleartext = process.env.AURA_ALLOW_CLEARTEXT === 'true';
// CPU architectures to build. arm64-v8a covers practically every phone from the last 8+ years;
// add armeabi-v7a for very old devices or x86_64 for emulators, e.g. AURA_ABIS=arm64-v8a,armeabi-v7a
const abis = (process.env.AURA_ABIS ?? 'arm64-v8a').split(',').map((s: string) => s.trim()).filter(Boolean);

// Single source of truth for the app version (CI names the APK from it too).
const release = require('./version.json') as { version: string; label: string; build: number };

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Aura',
  slug: 'aura-music',
  scheme: 'aura',
  version: release.version,
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#08080B',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.ohsinnerman.aura',
    supportsTablet: false,
    buildNumber: String(release.build),
    infoPlist: { UIBackgroundModes: ['audio'] },
  },
  android: {
    package: 'com.ohsinnerman.aura',
    versionCode: release.build,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#08080B',
    },
    // Security: keep tokens out of cloud/adb backups.
    allowBackup: false,
    // We never record audio or need location/contacts; strip anything a library might add.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_CONTACTS',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    // Android 13+: lets the media notification (lock-screen controls) appear.
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    // Edge-to-edge: the window isn't resized; screens/sheets lift themselves above the IME.
    softwareKeyboardLayoutMode: 'resize',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#08080B',
      },
    ],
    'expo-font',
    'expo-image',
    'expo-secure-store',
    [
      'expo-audio',
      {
        enableBackgroundPlayback: true,
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // 2.3.20: the newest Kotlin Expo's compiler plugin (pika) is published for; known-good build.
          kotlinVersion: '2.3.20',
          usesCleartextTraffic: allowCleartext,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          buildArchs: abis,
        },
      },
    ],
    './plugins/withReleaseSigning',
    ['./plugins/withVersionLabel', { label: release.label }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    versionLabel: release.label,
    apiUrl,
    allowCleartext,
  },
});
