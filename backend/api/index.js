// Vercel serverless entry. `npm run build` compiles src/ to dist/ first
// (see vercel.json). Loading is wrapped so that even a module that fails to
// load (e.g. a native dependency) produces a readable error instead of a
// bare FUNCTION_INVOCATION_FAILED.
let loaded;

export default async function handler(req, res) {
  try {
    loaded ??= import('../dist/vercel.js');
    const mod = await loaded;
    return mod.default(req, res);
  } catch (e) {
    loaded = undefined;
    console.error('[aura] failed to load the API:', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'startup_failed', message: `API failed to start: ${e && e.message ? e.message : String(e)}` } }));
  }
}
