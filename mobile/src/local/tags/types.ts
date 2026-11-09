/** Random-access byte source, so we only ever read the parts of a file we need. */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export interface Picture {
  mime: string;
  data: Uint8Array;
}

export interface SyncedLine {
  timeMs: number;
  text: string;
}

export type AudioFormat = 'mp3' | 'flac' | 'ogg' | 'opus' | 'm4a' | 'wav' | 'aiff' | 'aac' | 'unknown';

export interface TagResult {
  format: AudioFormat;
  codec?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: string;
  genre?: string;
  trackNo?: number;
  discNo?: number;
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  /** Bits per sample of the decoded PCM (lossless formats; undefined for lossy). */
  bitsPerSample?: number;
  bitrateKbps?: number;
  /** True for FLAC, ALAC, WAV/AIFF PCM. */
  lossless?: boolean;
  /** Encoder / writer, e.g. "LAME3.100", "reference libFLAC 1.4.3". */
  encoder?: string;
  /** Variable bitrate (lossy formats). */
  vbr?: boolean;
  /** Unsynced lyrics text; may itself be LRC (many taggers put LRC in USLT). */
  lyrics?: string;
  /** Time-stamped lyrics from SYLT / SYNCEDLYRICS. */
  syncedLyrics?: SyncedLine[];
  picture?: Picture;
  /** ReplayGain tags (dB / linear peak). Opus R128 gains are converted to the ReplayGain reference. */
  replayGain?: ReplayGainTags;
  /** Byte offset where audio frames begin (after a leading ID3v2 tag). */
  audioStart?: number;
}

export interface ReplayGainTags {
  trackGain?: number;
  trackPeak?: number;
  albumGain?: number;
  albumPeak?: number;
}

const num = (v: string) => {
  const m = /^\s*([+-]?\d+(?:[.,]\d+)?)/.exec(v);
  return m ? Number(m[1]!.replace(',', '.')) : undefined;
};

/** Record a ReplayGain-ish tag (any case) on `out`; returns true if the key was one. */
export function replayGainTag(out: Pick<Partial<TagResult>, 'replayGain'>, key: string, value: string): boolean {
  const k = key.trim().toUpperCase();
  const set = (field: keyof ReplayGainTags, v: number | undefined, ok: (n: number) => boolean) => {
    if (v === undefined || !Number.isFinite(v) || !ok(v)) return;
    const rg = (out.replayGain ??= {});
    rg[field] ??= v;
  };
  const gain = (n: number) => n > -60 && n < 30;
  const peak = (n: number) => n > 0 && n < 10;
  switch (k) {
    case 'REPLAYGAIN_TRACK_GAIN':
      set('trackGain', num(value), gain);
      return true;
    case 'REPLAYGAIN_ALBUM_GAIN':
      set('albumGain', num(value), gain);
      return true;
    case 'REPLAYGAIN_TRACK_PEAK':
      set('trackPeak', num(value), peak);
      return true;
    case 'REPLAYGAIN_ALBUM_PEAK':
      set('albumPeak', num(value), peak);
      return true;
    case 'R128_TRACK_GAIN': {
      const n = num(value);
      set('trackGain', n === undefined ? undefined : n / 256 + 5, gain);
      return true;
    }
    case 'R128_ALBUM_GAIN': {
      const n = num(value);
      set('albumGain', n === undefined ? undefined : n / 256 + 5, gain);
      return true;
    }
    default:
      return false;
  }
}

/** Fields a later source may fill in when an earlier one left them empty. */
export function merge(into: TagResult, from: Partial<TagResult>): TagResult {
  for (const [k, v] of Object.entries(from) as [keyof TagResult, unknown][]) {
    if (v === undefined || v === null || v === '') continue;
    if (into[k] === undefined || into[k] === '') (into as unknown as Record<string, unknown>)[k] = v;
  }
  return into;
}

export const ID3V1_GENRES = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap',
  'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal',
  'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise', 'Alternative Rock', 'Bass',
  'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial', 'Electronic',
  'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American',
  'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical',
  'Rock & Roll', 'Hard Rock',
];

export function genreName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // "(17)", "(17)Rock", "17"
  const m = /^\((\d+)\)(.*)$/.exec(raw) ?? /^(\d+)$/.exec(raw);
  if (m) return (m[2] && m[2].trim()) || ID3V1_GENRES[Number(m[1])] || undefined;
  return raw;
}

export const firstNumber = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const yearOf = (s: string | undefined): string | undefined => {
  const m = s ? /\b(\d{4})\b/.exec(s) : null;
  return m ? m[1] : undefined;
};
