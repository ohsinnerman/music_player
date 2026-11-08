# Music providers

Aura's backend normalises every source into the same `Track/Album/Artist/Playlist` model, so the app
doesn't care where music comes from. Enable sources with `CATALOG_PROVIDERS` (comma-separated, in
priority order).

| Provider | Streams | Key needed | Notes |
|---|---|---|---|
| `audius` | **Full tracks** | No (optional `AUDIUS_API_KEY`) | Artist-owned catalogue, strong in electronic, hip-hop, lo-fi. With a key, stream URLs are resolved server-side so the key never reaches the app. |
| `deezer` | 30-second previews | No | Mainstream catalogue and charts. Badged "Preview" in the app. |
| `jamendo` | **Full tracks** | `JAMENDO_CLIENT_ID` (free) | Creative-Commons independent music. |
| `lrclib` | Lyrics | No | Synced (LRC) and plain lyrics. |

Default: `CATALOG_PROVIDERS=audius,deezer`.

## How a provider works

`backend/src/providers/types.ts`:

```ts
interface CatalogProvider {
  id: ProviderId; label: string; fullTracks: boolean;
  homeSections(): Promise<Section[]>;
  search(query: string, limit: number): Promise<{ tracks; albums; artists; playlists }>;
  track(rawId): Promise<Track>;
  album(rawId): Promise<Album>;
  artist(rawId): Promise<ArtistDetail>;
  playlist(rawId): Promise<Playlist>;
  stream(rawId): Promise<StreamInfo>;      // { url, kind: 'full'|'preview', expiresAt }
  genreTracks?(genre, limit): Promise<Track[]>;
}
```

The catalog service calls every enabled provider in parallel (`Promise.allSettled`), interleaves
results, caches them, and skips any provider that fails.

## Plugging in your own music

You mentioned getting music "from somewhere else" later. Here's the path, e.g. for a folder of MP3s
on a server or S3 bucket you have rights to:

1. **Add the id.** In `backend/src/domain/types.ts` add `'mine'` to `ProviderId`, and in
   `backend/src/lib/ids.ts` add `mine` to `ID_PATTERN`. Mirror the type in `mobile/src/api/types.ts`.
2. **Write the provider** — `backend/src/providers/mine.ts` implementing `CatalogProvider`. Read your
   catalogue (a JSON index, a database, ID3 tags…), map entries to `Track` with ids like
   `mine:<slug>`, artwork URLs, `streamKind: 'full'`.
3. **Streams.** Return a **short-lived signed https URL** from `stream()` (e.g. an S3 pre-signed URL,
   5–60 min). The app plays `/v1/tracks/:id/play`, which redirects to whatever `stream()` returns, so
   nothing else changes.
4. **Allow the host.** Add your storage/API hostname to `allowedHosts` in
   `providers/registry.ts` (the SSRF guard blocks anything not listed).
5. **Register** it in `createProviders` and add env config to `config/env.ts`.
6. **Test** with a fake fetch like `backend/test/helpers.ts`.

The demo server (`backend/scripts/demo.ts`) is a complete example of feeding the app with your own
data — it fakes all three upstreams in ~150 lines.

## Licensing reminder

Only stream what you're allowed to. Audius artists publish for free streaming; Deezer previews are
offered publicly for preview use; Jamendo tracks are CC-licensed (check each licence for commercial
use); LRCLIB lyrics are community-contributed.
