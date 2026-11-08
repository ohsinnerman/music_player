import type {
  Album,
  Artist,
  ArtistDetail,
  Playlist,
  ProviderId,
  Section,
  StreamInfo,
  Track,
} from '../domain/types.js';

export interface ProviderSearch {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

/**
 * A music source. To plug in your own catalogue later (self-hosted files,
 * a licensed partner, etc.), implement this interface and register it in
 * providers/registry.ts. Nothing else in the app has to change.
 */
export interface CatalogProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** True when streams are full-length. */
  readonly fullTracks: boolean;

  homeSections(): Promise<import('../domain/types.js').Section[]>;
  search(query: string, limit: number): Promise<ProviderSearch>;
  track(rawId: string): Promise<Track>;
  album(rawId: string): Promise<Album>;
  artist(rawId: string): Promise<ArtistDetail>;
  playlist(rawId: string): Promise<Playlist>;
  stream(rawId: string): Promise<StreamInfo>;
  /** Optional: tracks for a genre name like "Electronic". */
  genreTracks?(genre: string, limit: number): Promise<Track[]>;
}

export type { Section };
