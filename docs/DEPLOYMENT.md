# Deploying the backend

The app needs your backend reachable over **https**. Pick one option.

## 0. Database (recommended for every option): MongoDB Atlas free tier

1. Create a free M0 cluster at <https://www.mongodb.com/atlas>.
2. **Database Access** → add a user with a strong generated password, role "Read and write to any database".
3. **Network Access** → allow your host's IPs (Render/Vercel use dynamic IPs; `0.0.0.0/0` works but
   then rely on the strong password).
4. **Connect → Drivers** → copy `mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net`.

Indexes (unique emails, TTL on refresh tokens, etc.) are created automatically on boot.

## Required environment

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 48 random bytes, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `MONGODB_URI` | from Atlas |
| `TRUST_PROXY` | `1` on Render/Vercel/behind Nginx |
| `CATALOG_PROVIDERS` | `audius,deezer` (default) — add `jamendo` with `JAMENDO_CLIENT_ID` |
| `AUDIUS_API_KEY` | optional |
| `ALLOW_REGISTRATION` | `false` if the server is only for you (after creating your account) |
| `GROQ_API_KEY` | optional — AI identification + lyrics for songs imported from the phone ([LOCAL_MUSIC.md](LOCAL_MUSIC.md)) |

See `backend/.env.example` for everything.

## Option A — Render (simplest, free)

The repo includes `render.yaml`.

1. <https://dashboard.render.com> → **New → Blueprint** → pick this repository.
2. Fill in `MONGODB_URI` when asked (a `JWT_SECRET` is generated for you).
3. Deploy. Your URL looks like `https://aura-api.onrender.com`.

Free instances sleep after ~15 min idle; the first request then takes ~30–50 s. A paid instance or a
5-minute uptime ping avoids that.

## Option B — Vercel (you already use it)

`backend/vercel.json` + `backend/api/index.js` run the API as a serverless function.

1. Vercel → **Add New Project** → import the repo, **Root Directory = `backend`**.
2. Framework preset: *Other*. Build command and output come from `vercel.json`.
3. Add the environment variables above (use MongoDB — the memory store doesn't survive serverless).
4. Deploy → `https://<project>.vercel.app`.

Note: in-memory rate limits and caches are per function instance on serverless; that's acceptable
for personal use. For stricter limits use a long-running host (A or C).

## Option C — Docker anywhere (VPS, Railway, Fly.io…)

```bash
cd backend
docker build -t aura-api .
docker run -d --name aura-api -p 4000:4000 \
  -e NODE_ENV=production -e TRUST_PROXY=1 \
  -e JWT_SECRET=... -e MONGODB_URI=... \
  aura-api
```

The image runs as the unprivileged `node` user, includes a health check, and only ships compiled
code + production dependencies. Put it behind Caddy/Nginx for TLS:

```
# Caddyfile
api.example.com {
  reverse_proxy localhost:4000
}
```

## After deploying

```bash
curl https://<your-host>/v1/health      # {"data":{"status":"ok"}}
curl https://<your-host>/v1/config      # enabled providers
```

Then either bake the URL into the APK (`API_URL` repository variable, see
[BUILD_APK.md](BUILD_APK.md)) or enter it in the app under **Settings → Server**.
