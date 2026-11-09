import { describe, expect, it } from 'vitest';
import type { Track } from '@/api/types';
import { groupAlbums, groupArtists } from './group';

const t = (id: string, title: string, artist: string, album?: string, trackNo?: number, extra: Partial<Track> = {}): Track => ({
  kind: 'track',
  id,
  title,
  artists: [{ id: `local-artist:${artist.toLowerCase()}`, name: artist }],
  album: album ? { id: `local-album:${album.toLowerCase()}`, title: album } : undefined,
  durationMs: 200_000,
  artwork: {},
  explicit: false,
  streamKind: 'full',
  provider: 'local',
  local: { uri: `file:///${id}`, fileName: `${id}.flac`, sizeBytes: 1, format: 'flac', codec: 'FLAC', lossless: true, bitsPerSample: 24, sampleRate: 96000, tags: { trackNo }, addedAt: '2026-01-01' },
  ...extra,
});

describe('local library grouping', () => {
  const tracks = [
    t('1', 'Aerodynamic', 'Daft Punk', 'Discovery', 2),
    t('2', 'One More Time', 'Daft Punk', 'Discovery', 1, { artwork: { large: 'file:///cover.jpg' }, releaseDate: '2001' }),
    t('3', 'Song A', 'Artist A', 'Hits'),
    t('4', 'Song B', 'Artist B', 'Hits'),
    t('5', 'Loose', 'Daft Punk'),
  ];

  it('builds albums in track order with art, year, quality and album artist', () => {
    const albums = groupAlbums(tracks);
    const d = albums.find((a) => a.title === 'Discovery')!;
    expect(d.tracks.map((x) => x.title)).toEqual(['One More Time', 'Aerodynamic']);
    expect(d.artist.name).toBe('Daft Punk');
    expect(d.artwork.large).toBe('file:///cover.jpg');
    expect(d.year).toBe('2001');
    expect(d.durationMs).toBe(400_000);
    expect(d.quality).toBe('Hi-Res Lossless 24/96');
    expect(albums.find((a) => a.title === 'Hits')!.artist.name).toBe('Various Artists');
  });

  it('builds artists with their albums', () => {
    const albums = groupAlbums(tracks);
    const artists = groupArtists(tracks, albums);
    const dp = artists.find((a) => a.name === 'Daft Punk')!;
    expect(dp.tracks).toHaveLength(3);
    expect(dp.albums.map((a) => a.title)).toEqual(['Discovery']);
    expect(dp.artwork.large).toBe('file:///cover.jpg');
    expect(artists.find((a) => a.name === 'Artist A')!.albums.map((a) => a.title)).toEqual(['Hits']);
  });
});
