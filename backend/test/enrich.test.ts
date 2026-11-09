import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { baseTitle, pickWiki, shorten } from '../src/services/enrich.js';
import { type Handler, makeTestApp } from './helpers.js';

const wiki = (title: string, description: string, extract: string) => ({ type: 'standard', title, description, extract, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}` } } });

const DISCOVERY = wiki('Discovery (Daft Punk album)', '2001 studio album by Daft Punk', 'Discovery is the second studio album by French electronic music duo Daft Punk, released on 26 February 2001 by Virgin Records. It marked a shift from the Chicago house of their first album.');
const DAFT = wiki('Daft Punk', 'French electronic music duo', 'Daft Punk were a French electronic music duo formed in 1993 in Paris by Thomas Bangalter and Guy-Manuel de Homem-Christo.');
const DISCOVERY_SHIP = wiki('Discovery (ship)', 'Ship', 'Discovery was a ship of the British Royal Navy.');

const upstream: Handler = (u) => {
  if (u.hostname === 'api.deezer.com' && u.pathname === '/search/album') return { body: { data: [{ id: 302127, title: 'Discovery', cover_xl: 'https://cdn.example/discovery-xl.jpg', nb_tracks: 14, artist: { name: 'Daft Punk' } }] } };
  if (u.hostname === 'api.deezer.com' && u.pathname === '/album/302127') return { body: { id: 302127, title: 'Discovery', release_date: '2001-03-07', label: 'Parlophone (France)', genres: { data: [{ name: 'Electro' }] } } };
  if (u.hostname === 'api.deezer.com' && u.pathname === '/search/artist') {
    return { body: { data: [{ id: 27, name: 'Daft Punk', picture_xl: 'https://cdn.example/dp-xl.jpg', nb_fan: 4_000_000 }] } };
  }
  if (u.hostname === 'musicbrainz.org') {
    return { body: { 'release-groups': [{ id: 'rg-1', title: 'Obscure Tape', score: 100, 'first-release-date': '1998-05-01' }] } };
  }
  if (u.hostname === 'en.wikipedia.org' && u.pathname === '/w/api.php') {
    const q = u.searchParams.get('srsearch') ?? '';
    if (q.includes('Discovery')) return { body: { query: { search: [{ title: 'Discovery (Daft Punk album)' }, { title: 'Discovery (ship)' }] } } };
    if (q.startsWith('Daft Punk')) return { body: { query: { search: [{ title: 'Daft Punk' }] } } };
    return { body: { query: { search: [] } } };
  }
  if (u.hostname === 'en.wikipedia.org' && u.pathname.startsWith('/api/rest_v1/page/summary/')) {
    const t = decodeURIComponent(u.pathname.split('/').pop()!).replace(/_/g, ' ');
    const page = [DISCOVERY, DAFT, DISCOVERY_SHIP].find((p) => p.title === t);
    return page ? { body: page } : { status: 404, body: {} };
  }
  return undefined;
};

describe('enrichment helpers', () => {
  it('cleans titles and shortens text', () => {
    expect(baseTitle('Discovery (Deluxe Edition)')).toBe('Discovery');
    expect(baseTitle('Random Access Memories [10th Anniversary Edition]')).toBe('Random Access Memories');
    expect(shorten('One. Two. Three.', 10)).toBe('One. Two.');
  });

  it('picks the article about the album, not a namesake', () => {
    expect(pickWiki([DISCOVERY_SHIP, DISCOVERY], 'album', 'Discovery', 'Daft Punk')?.title).toBe('Discovery (Daft Punk album)');
    expect(pickWiki([DISCOVERY_SHIP], 'album', 'Discovery', 'Daft Punk')).toBeNull();
    expect(pickWiki([DAFT], 'artist', 'Daft Punk')?.title).toBe('Daft Punk');
  });
});

describe('GET /v1/enrich/*', () => {
  it('album: cover, year, label, genres and a Wikipedia summary', async () => {
    const { app } = makeTestApp({}, [upstream]);
    const r = await request(app).get('/v1/enrich/album').query({ artist: 'Daft Punk', album: 'Discovery' }).expect(200);
    expect(r.body.data).toMatchObject({
      cover: 'https://cdn.example/discovery-xl.jpg',
      year: '2001',
      label: 'Parlophone (France)',
      genres: ['Electro'],
      trackCount: 14,
      summarySource: { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Discovery_(Daft_Punk_album)' },
      sources: ['Deezer', 'Wikipedia'],
    });
    expect(r.body.data.summary).toMatch(/^Discovery is the second studio album/);
  });

  it('album unknown to Deezer falls back to MusicBrainz + Cover Art Archive', async () => {
    const { app } = makeTestApp({}, [(u) => (u.hostname === 'api.deezer.com' && u.pathname === '/search/album' ? { body: { data: [] } } : upstream(u))]);
    const r = await request(app).get('/v1/enrich/album').query({ artist: 'Somebody', album: 'Obscure Tape' }).expect(200);
    expect(r.body.data).toMatchObject({ year: '1998', cover: 'https://coverartarchive.org/release-group/rg-1/front-500', sources: ['MusicBrainz'] });
    expect(r.body.data.summary).toBeUndefined();
  });

  it('artist: photo, fans, summary', async () => {
    const { app } = makeTestApp({}, [upstream]);
    const r = await request(app).get('/v1/enrich/artist').query({ name: 'Daft Punk' }).expect(200);
    expect(r.body.data).toMatchObject({ image: 'https://cdn.example/dp-xl.jpg', fans: 4_000_000, sources: ['Deezer', 'Wikipedia'] });
    expect(r.body.data.summary).toMatch(/French electronic music duo/);
  });

  it('validates input', async () => {
    const { app } = makeTestApp({}, [upstream]);
    await request(app).get('/v1/enrich/album').query({ artist: 'x' }).expect(400);
  });
});
