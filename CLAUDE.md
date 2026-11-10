# Aura — notes for Claude

## Versioning (owner's rule)

Every commit bumps the version by one step, in `mobile/version.json` (the single source; app.config,
the APK name and the `v<label>` pre-release read it), mirrored in `mobile/package.json` and
`backend/package.json`:

- `version` goes up one patch per commit; after `.9` it rolls to the next minor
  (1.2.8 → 1.2.9 → 1.3.0).
- `label` is `<version>-beta` while on the beta line.
- `build` (Android versionCode / iOS build number) goes up by 1 every commit.
- Add the commit's changes under a `## <label>` heading in `CHANGELOG.md`.

Commits: author "Akul Shrivastava <dupal137@gmail.com>", pushed straight to `main`.
Never commit secrets (Groq key, MongoDB URI) — they live only in Vercel env vars.
