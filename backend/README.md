# Aura API (backend)

Express 5 + TypeScript service that powers the Aura app: catalogue (Audius, Deezer, Jamendo),
streaming URLs, synced lyrics (LRCLIB), accounts and the user library.

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:4000/v1/health
npm run demo       # offline demo with fictional data
npm test           # API test suite
npm run build && npm start
```

Docs: [API](../docs/API.md) · [Security](../docs/SECURITY.md) · [Deployment](../docs/DEPLOYMENT.md) ·
[Providers](../docs/PROVIDERS.md)
