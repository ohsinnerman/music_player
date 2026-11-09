/**
 * UPnP AV / DLNA protocol helpers (pure, unit-tested): device descriptions,
 * SOAP envelopes and responses, DIDL-Lite metadata, time formats, MIME types.
 */

export const AVT = 'urn:schemas-upnp-org:service:AVTransport:1';
export const RC = 'urn:schemas-upnp-org:service:RenderingControl:1';
export const MEDIA_RENDERER = 'urn:schemas-upnp-org:device:MediaRenderer:1';

export interface Renderer {
  udn: string;
  name: string;
  manufacturer?: string;
  model?: string;
  modelNumber?: string;
  iconUrl?: string;
  location: string;
  avTransport: string;
  renderingControl?: string;
  avServiceType: string;
  rcServiceType?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? _;
  });
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Text content of the first <name> element (any namespace prefix). */
export function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(xml);
  return m ? unescapeXml(m[1]!.trim()) : undefined;
}

function blocks(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]!);
  return out;
}

/** Resolve a (possibly relative) URL from a description against its base. */
export function resolveUrl(rel: string, base: string): string {
  if (/^https?:\/\//i.test(rel)) return rel;
  const m = /^(https?:\/\/[^/]+)(\/[^?#]*)?/i.exec(base);
  if (!m) return rel;
  const origin = m[1]!;
  if (rel.startsWith('/')) return origin + rel;
  const dir = (m[2] ?? '/').replace(/[^/]*$/, '');
  return origin + dir + rel;
}

function lastTag(xml: string, name: string): string | undefined {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'gi');
  let m: RegExpExecArray | null;
  let last: string | undefined;
  while ((m = re.exec(xml))) last = m[1];
  return last === undefined ? undefined : unescapeXml(last.trim());
}

/**
 * Parse a device description. Receivers often nest the renderer inside a root
 * device (with a MediaServer next to it), so we find the AVTransport service and
 * read the identity of the device that declares it: the last friendlyName / UDN
 * / iconList that appear before its serviceList.
 */
export function parseDescription(xml: string, location: string): Renderer | null {
  const base = tag(xml, 'URLBase') || location;
  const services: { type: string; url: string; at: number }[] = [];
  const re = /<(?:[\w-]+:)?service(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?service>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const type = tag(m[1]!, 'serviceType') ?? '';
    const url = tag(m[1]!, 'controlURL');
    if (url) services.push({ type, url: resolveUrl(url, base), at: m.index });
  }
  const av = services.find((x) => /:service:AVTransport:\d/.test(x.type));
  if (!av) return null;
  const head = xml.slice(0, av.at);
  const deviceStart = Math.max(head.lastIndexOf('<device>'), head.lastIndexOf('<device '));
  const own = deviceStart >= 0 ? head.slice(deviceStart) : head;
  // The renderer's RenderingControl lives in the same device block.
  const rc = services.find((x) => /:service:RenderingControl:\d/.test(x.type) && x.at > deviceStart);
  const iconList = lastTag(own, 'iconList') ?? '';
  const icons = blocks(iconList, 'icon')
    .map((ic) => ({ url: tag(ic, 'url'), mime: tag(ic, 'mimetype') ?? '', w: Number(tag(ic, 'width') ?? 0) }))
    .filter((ic) => ic.url && /png|jpe?g/.test(ic.mime))
    .sort((a, b) => b.w - a.w);
  const pick = (n: string) => lastTag(own, n) ?? lastTag(head, n);
  return {
    udn: pick('UDN') ?? location,
    name: pick('friendlyName') ?? pick('modelName') ?? 'Speaker',
    manufacturer: pick('manufacturer'),
    model: pick('modelName'),
    modelNumber: pick('modelNumber'),
    iconUrl: icons[0]?.url ? resolveUrl(icons[0].url, base) : undefined,
    location,
    avTransport: av.url,
    renderingControl: rc?.url,
    avServiceType: av.type,
    rcServiceType: rc?.type,
  };
}

export function soapEnvelope(serviceType: string, action: string, args: Record<string, string | number>): string {
  const body = Object.entries(args)
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="${serviceType}">${body}</u:${action}></s:Body></s:Envelope>`
  );
}

export function soapHeaders(serviceType: string, action: string): Record<string, string> {
  return { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${serviceType}#${action}"` };
}

export class UpnpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'UpnpError';
  }
}

/** Parse a SOAP response into its out-arguments, or throw the UPnP fault. */
export function parseSoapResponse(status: number, xml: string, action: string): Record<string, string> {
  if (status >= 400 || /<(?:[\w-]+:)?Fault[\s>]/i.test(xml)) {
    const code = Number(tag(xml, 'errorCode') ?? status);
    const desc = tag(xml, 'errorDescription') ?? tag(xml, 'faultstring') ?? `HTTP ${status}`;
    throw new UpnpError(code, desc);
  }
  const resp = new RegExp(`<(?:[\\w-]+:)?${action}Response[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${action}Response>`, 'i').exec(xml);
  const out: Record<string, string> = {};
  if (!resp) return out;
  const re = /<([\w-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<([\w-]+)(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(resp[1]!))) {
    if (m[1]) out[m[1]] = unescapeXml(m[2]!);
    else if (m[3]) out[m[3]] = '';
  }
  return out;
}

/** "H:MM:SS(.mmm)" ↔ seconds. NOT_IMPLEMENTED / empty → 0. */
export function parseTime(s: string | undefined): number {
  if (!s) return 0;
  const m = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?/.exec(s.trim());
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(`0.${m[4]}`) : 0);
}

export function formatTime(sec: number, millis = false): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const base = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return millis ? `${base}.${String(Math.round((t % 1) * 1000)).padStart(3, '0')}` : base;
}

/** MIME type a renderer expects for each container (receivers are picky about FLAC). */
export function mimeFor(format: string | undefined): { mime: string; ext: string } {
  switch (format) {
    case 'flac':
      return { mime: 'audio/flac', ext: 'flac' };
    case 'mp3':
      return { mime: 'audio/mpeg', ext: 'mp3' };
    case 'm4a':
      return { mime: 'audio/mp4', ext: 'm4a' };
    case 'aac':
      return { mime: 'audio/aac', ext: 'aac' };
    case 'wav':
      return { mime: 'audio/wav', ext: 'wav' };
    case 'aiff':
      return { mime: 'audio/aiff', ext: 'aif' };
    case 'ogg':
      return { mime: 'audio/ogg', ext: 'ogg' };
    case 'opus':
      return { mime: 'audio/ogg', ext: 'opus' };
    default:
      return { mime: 'audio/mpeg', ext: 'mp3' };
  }
}

export function protocolInfo(mime: string): string {
  const pn = mime === 'audio/mpeg' ? 'DLNA.ORG_PN=MP3;' : '';
  return `http-get:*:${mime}:${pn}DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000`;
}

export interface DidlItem {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  artUrl?: string;
  url: string;
  mime: string;
  durationSec?: number;
  sizeBytes?: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}

/** DIDL-Lite for SetAVTransportURI (receivers show title / artist / cover from this). */
export function didl(i: DidlItem): string {
  const attrs = [
    `protocolInfo="${escapeXml(protocolInfo(i.mime))}"`,
    i.durationSec ? `duration="${formatTime(i.durationSec, true)}"` : '',
    i.sizeBytes ? `size="${i.sizeBytes}"` : '',
    i.sampleRate ? `sampleFrequency="${i.sampleRate}"` : '',
    i.channels ? `nrAudioChannels="${i.channels}"` : '',
    i.bitsPerSample ? `bitsPerSample="${i.bitsPerSample}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
    `<item id="${escapeXml(i.id)}" parentID="0" restricted="1">` +
    `<dc:title>${escapeXml(i.title)}</dc:title>` +
    (i.artist ? `<dc:creator>${escapeXml(i.artist)}</dc:creator><upnp:artist>${escapeXml(i.artist)}</upnp:artist>` : '') +
    (i.album ? `<upnp:album>${escapeXml(i.album)}</upnp:album>` : '') +
    (i.artUrl ? `<upnp:albumArtURI>${escapeXml(i.artUrl)}</upnp:albumArtURI>` : '') +
    '<upnp:class>object.item.audioItem.musicTrack</upnp:class>' +
    `<res ${attrs}>${escapeXml(i.url)}</res>` +
    '</item></DIDL-Lite>'
  );
}

/** Friendly message for common AVTransport faults. */
export function describeFault(e: unknown, device: string): string {
  if (e instanceof UpnpError) {
    if (e.code === 714 || e.code === 715) return `${device} can’t play this file type`;
    if (e.code === 716) return `${device} couldn’t reach the song on your phone`;
    if (e.code === 701) return `${device} isn’t ready (try again)`;
    return `${device}: ${e.message}`;
  }
  return e instanceof Error ? `${device}: ${e.message}` : `${device} didn’t respond`;
}
