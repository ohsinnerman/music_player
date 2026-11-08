import type { Album, Artwork, Track } from '@/api/types';

export function formatTime(totalSeconds: number): string {
  'worklet';
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} hr ${min % 60} min`;
}

export function compactNumber(n?: number): string {
  if (n === undefined || n === null) return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export const artistNames = (t: { artists: { name: string }[] }) => t.artists.map((a) => a.name).join(', ');

export const art = (a: Artwork | undefined, size: 'small' | 'medium' | 'large' = 'medium'): string | undefined => {
  if (!a) return undefined;
  if (size === 'small') return a.small ?? a.medium ?? a.large;
  if (size === 'large') return a.large ?? a.medium ?? a.small;
  return a.medium ?? a.large ?? a.small;
};

export const year = (d?: string) => (d ? d.slice(0, 4) : undefined);

export function albumMeta(a: Album): string {
  const parts = [a.albumType === 'album' ? 'Album' : a.albumType === 'ep' ? 'EP' : a.albumType === 'single' ? 'Single' : 'Compilation'];
  const y = year(a.releaseDate);
  if (y) parts.push(y);
  return parts.join(' · ');
}

export function tracksMeta(tracks: Track[]): string {
  const total = tracks.reduce((n, t) => n + t.durationMs, 0);
  return `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}${total ? ` · ${formatDuration(total)}` : ''}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Tonight';
}
