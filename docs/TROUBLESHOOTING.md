# Troubleshooting

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
Real blur needs Android 12+. Older versions get a frosted tint. Also check **Settings → Reduce
transparency** is off.

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
