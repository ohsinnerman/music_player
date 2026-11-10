# Troubleshooting

**First stop for any bug:** Settings → **Diagnostics** lists recent errors and playback failures
(with the player's error code and the file's format). **Share diagnostics** sends them as text — no
tokens or account data are included.

### "Connect your server" / "Add your server address in Settings"
The build has no backend URL. Open **Settings → Server**, paste `https://…`, tap **Test & save**.
To bake it in, set the `API_URL` repository variable and rebuild ([BUILD_APK.md](BUILD_APK.md)).

### "This build only connects to https servers"
Release builds refuse `http://`. Deploy the backend with https ([DEPLOYMENT.md](DEPLOYMENT.md)), or
build with `AURA_ALLOW_CLEARTEXT=true` for LAN testing.

### "Can't reach the server"
- Free Render instances sleep — the first request can take ~40 s; try again.
- Phone on mobile data but server on your LAN? It must be publicly reachable.
- Check `https://<host>/v1/health` in the phone's browser.

### Songs stop after 30 seconds
Those are Deezer previews (marked **Preview**). Full tracks come from Audius (and Jamendo if
enabled). See [PROVIDERS.md](PROVIDERS.md).

### "Music service is taking a break" (502)
An upstream API (Audius/Deezer) is down or rate-limiting. The home feed still shows other sources.
Retry in a minute.

### No lock-screen / notification controls
Allow notifications for Aura (Android 13+: Settings → Apps → Aura → Notifications). Battery savers
on some phones (Xiaomi/Poco, Oppo, Vivo…) kill background apps — set Aura's battery usage to
"No restrictions".

### Glass looks flat / no blur
Real blur needs Android 12+; the refracting Liquid Glass lens needs Android 13+. Older versions get a
frosted tint. Also check **Settings → Glass** isn't
set to *Opaque* (the slider's right end). Glass over the open full player is always frosted (Android can
only blur content inside the app's blur target).

### Signed out unexpectedly
Refresh tokens rotate; if an old token is replayed (e.g. restored from another device) the server
revokes the session as a safety measure. Sign in again. Changing your password signs out every
other device on purpose.

### `npm install` peer-dependency errors (mobile)
Use `npm ci` with the committed lockfile. Install new native packages with `npx expo install <pkg>`.

### Backend refuses to start in production
It's protecting you: set `JWT_SECRET` (32+ chars) and `MONGODB_URI`, and don't set
`ALLOW_INSECURE_STREAMS`.

### APK workflow failed
Open the failed step's log in **Actions**. Common causes: a typo in secrets (keystore password/alias),
or a dependency that needs `npm ci` to be re-run after editing `package.json` without updating
`package-lock.json`.

### Adding songs: "No audio files found there" / folder looks empty
Pick the folder that actually contains the music (Android's picker can't select the root of internal
storage or the Downloads root on some phones — choose a subfolder). Supported: FLAC, WAV, MP3, M4A
(AAC/ALAC), OGG, Opus, AIFF. Up to 3000 files per folder, 8 levels deep.

### Imported songs don't play (fixed in builds after Nov 9 2026)
Older builds stopped playing *everything* after a single song failed (the player stayed idle).
Update to the latest APK: the player now recovers and skips, and songs the phone's media player can't
open directly are played from a cached copy automatically. If a song says "This phone can’t play
6-channel 24-bit 192 kHz FLAC", your phone's audio hardware can't output that format; a stereo
version of the file will play.

### An imported song says "Couldn’t open this file"
The file was moved, renamed or deleted, or the SD card was removed. Add it again from its new place
(⋯ → Remove from Aura, then add it).

### Imported song shows the wrong title, or no lyrics
Open lyrics and use **Search again**, or **Listen & identify** to let the server hear a 20-second clip.
Lyrics need your server to be reachable. AI identification needs `GROQ_API_KEY` on the server
(`GET /v1/config` should show `"ai": true`). Some songs simply aren't in LRCLIB yet.

### "AI identification is not configured correctly on this server"
The Groq key is wrong or revoked. Update `GROQ_API_KEY` in your host's environment and redeploy.
"The AI service is busy" means Groq rate-limited the key; try again in a minute.

### Quality sheet says "Unknown output"
That APK was built before the audio-route module existed (or you're on the web preview). Install the
latest APK. The badge and file details still work.

### Hi-Res file shows "24-bit → 16-bit" and "96 → 48 kHz"
That's accurate: Android's shared mixer runs at 48 kHz and the player decodes to 16-bit PCM. It's
inaudible in practice; a USB DAC gets closest to the original. See [AUDIO_QUALITY.md](AUDIO_QUALITY.md).

### Reading a diagnostics report
Settings → Diagnostics → Share starts with the app version and a summary for that version. Repeats
are folded into one line (`×12 (first …)`), and lines written by an older version are marked
`[from 1.2.3-beta]` — so errors that were fixed by an update are easy to tell apart. The *Casting*
section lists Cast / DLNA devices, their IPs and which TV screen they run.

### "Play on" doesn't find my receiver
See [DLNA.md → Troubleshooting](DLNA.md#troubleshooting): same Wi-Fi (not a guest network), receiver on
or in network standby, no VPN on the phone. Builds before Nov 9 2026 don't have DLNA at all.

### Imported songs show names like "primary%3AMusic…" or "audio%3A1234"
Versions before 1.1.0-beta saved Android's document id instead of the file name. 1.1.0-beta reads
the real names and repairs existing songs a moment after launch (titles that came from the file name
are fixed too, unless identification already replaced them).
