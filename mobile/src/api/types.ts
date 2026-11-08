/**
 * API contract — mirror of backend/src/domain/types.ts. Keep the two in sync.
 * Every provider is normalised into these shapes, so the app never knows or cares
 * where a song came from.
 */

/** 'local' = a file the user imported from their phone (never sent to the server's catalog). */
export type ProviderId = 'audius' | 'deezer' | 'jamendo' | 'local';

/** Image URLs at three sizes (~150px, ~500px, ~1000px). Any may be missing. */
export interface Artwork {
  small?: string;
  medium?: string;
  large?: string;
}

export interface ArtistRef {
  id: string;
  name: string;
}

export interface AlbumRef {
  id: string;
  title: string;
}

/** 'full' = whole track, 'preview' = ~30s clip (licensing-limited providers). */
export type StreamKind = 'full' | 'preview';

export interface Track {
  kind: 'track';
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  durationMs: number;
  artwork: Artwork;
  explicit: boolean;
  streamKind: StreamKind;
  provider: ProviderId;
  genre?: string;
  playCount?: number;
  releaseDate?: string;
  /** Present only for songs imported from the device. */
  local?: LocalFileInfo;
}

export interface LocalFileInfo {
  /** file:// or content:// URI the player streams from. */
  uri: string;
  fileName: string;
  sizeBytes: number;
  format: string;
  codec?: string;
  bitrateKbps?: number;
  sampleRate?: number;
  /** Raw tags as read from the file (before any identification). */
  tags: { title?: string; artist?: string; album?: string; year?: string; genre?: string; trackNo?: number };
  addedAt: string;
}

export interface Album {
  kind: 'album';
  id: string;
  title: string;
  artists: ArtistRef[];
  artwork: Artwork;
  releaseDate?: string;
  trackCount?: number;
  albumType: 'album' | 'single' | 'ep' | 'compilation';
  provider: ProviderId;
  tracks?: Track[];
  description?: string;
}

export interface Artist {
  kind: 'artist';
  id: string;
  name: string;
  image: Artwork;
  followers?: number;
  verified?: boolean;
  provider: ProviderId;
}

export interface ArtistDetail extends Artist {
  bio?: string;
  cover?: string;
  topTracks: Track[];
  albums: Album[];
}

export interface Playlist {
  kind: 'playlist';
  id: string;
  title: string;
  description?: string;
  artwork: Artwork;
  owner?: { id: string; name: string };
  trackCount?: number;
  provider: ProviderId | 'user';
  tracks?: Track[];
}

export interface Genre {
  kind: 'genre';
  id: string;
  name: string;
  /** Two hex colors for the gradient tile. */
  colors: [string, string];
  image?: string;
}

export type CatalogItem = Track | Album | Artist | Playlist | Genre;

export type SectionLayout = 'hero' | 'shelf' | 'grid' | 'chart' | 'artists' | 'genres' | 'quickpicks';

export interface Section {
  id: string;
  title: string;
  subtitle?: string;
  layout: SectionLayout;
  items: CatalogItem[];
}

export interface SearchResults {
  query: string;
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  top?: CatalogItem;
}

export interface StreamInfo {
  url: string;
  kind: StreamKind;
  /** ISO timestamp after which the URL may stop working; fetch a new one. */
  expiresAt: string;
  mimeType?: string;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  trackId?: string;
  synced: LyricLine[] | null;
  plain: string | null;
  instrumental: boolean;
  source: 'lrclib' | 'embedded';
}

export interface SongMatch {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'tags' | 'filename' | 'search' | 'ai' | 'audio';
}

export interface Identification {
  match: SongMatch | null;
  lyrics: Lyrics | null;
  ai: { used: boolean; available: boolean };
  canListen: boolean;
  transcript?: string;
}

/* ─────────── App-side additions ─────────── */

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthPayload {
  user: User;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface UserPlaylist extends Playlist {
  provider: 'user';
  createdAt: string;
  updatedAt: string;
}

export interface ServerConfig {
  providers: { id: ProviderId; label: string; fullTracks: boolean }[];
  registration: boolean;
  version: number;
  features?: { identify: boolean; ai: boolean; listen: boolean };
}

/** Where the current queue came from ("Playing from …"). */
export interface PlayContext {
  type: 'album' | 'playlist' | 'artist' | 'genre' | 'liked' | 'search' | 'home' | 'history' | 'radio' | 'queue' | 'local';
  id?: string;
  title: string;
}
