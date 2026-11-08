/**
 * Best-effort "Artist - Title" guess from a file name, for files with no tags.
 * Handles "01 - Artist - Title.mp3", "Artist_-_Title_(Official_Video).flac",
 * "03. Title.m4a" and similar. The backend refines this further (and with AI).
 */
export interface FilenameGuess {
  title: string;
  artist?: string;
  trackNo?: number;
}

const JUNK =
  /\s*[([{](?:official(?:\s+(?:music|lyric|audio|hd))?(?:\s+(?:video|audio|visuali[sz]er))?|lyrics?(?:\s+video)?|audio|video|visuali[sz]er|hd|hq|4k|explicit|clean|mp3|flac|\d{2,3}\s*kbps|www\.[^)\]}]+|[^)\]}]*\.(?:com|net|org|in|io)[^)\]}]*)[)\]}]/gi;

export function stripJunk(s: string): string {
  return s.replace(JUNK, '').replace(/\s{2,}/g, ' ').trim();
}

export function parseFilename(name: string): FilenameGuess {
  let base = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  base = base.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
  base = stripJunk(base);

  let trackNo: number | undefined;
  const num = /^(?:\d{1,2}-)?(\d{1,3})(?:\s*[.\-)]\s*|\s+)(?=\S)/.exec(base);
  if (num && !/^\d{4}\b/.test(base)) {
    trackNo = Number(num[1]);
    base = base.slice(num[0].length);
  }

  const parts = base
    .split(/\s+[-–—]\s+|\s*[–—]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { artist: parts[0], title: parts.slice(1).join(' - '), trackNo };
  }
  return { title: base || name, trackNo };
}
