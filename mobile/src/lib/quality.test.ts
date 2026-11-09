import { describe, expect, it } from 'vitest';
import { assess, khz, signalPath, specOf } from './quality';

const file = (local: object) => specOf({ provider: 'local', streamKind: 'full', local: { format: 'flac', ...local } });
const out = (type: string, extra: object = {}) => ({ available: true, mixerSampleRate: 48000, device: { type, name: 'X', sampleRates: [], encodings: [] }, ...extra });

describe('assess', () => {
  it('ranks lossless and hi-res', () => {
    expect(assess(file({ codec: 'FLAC', lossless: true, bitsPerSample: 24, sampleRate: 96000 }))).toMatchObject({ tier: 'hires', short: '24/96', bars: 5 });
    expect(assess(file({ codec: 'FLAC', lossless: true, bitsPerSample: 16, sampleRate: 44100 }))).toMatchObject({ tier: 'lossless', short: '16/44.1', spec: '16-bit / 44.1 kHz' });
    expect(assess(file({ codec: 'ALAC', lossless: true, bitsPerSample: 16, sampleRate: 88200 })).tier).toBe('hires');
  });
  it('ranks lossy by codec-aware bitrate', () => {
    expect(assess(file({ format: 'mp3', codec: 'MP3', lossless: false, bitrateKbps: 320 })).tier).toBe('high');
    expect(assess(file({ format: 'mp3', codec: 'MP3', lossless: false, bitrateKbps: 192 })).tier).toBe('standard');
    expect(assess(file({ format: 'opus', codec: 'Opus', lossless: false, bitrateKbps: 128 })).tier).toBe('high');
    expect(assess(file({ format: 'mp3', codec: 'MP3', lossless: false, bitrateKbps: 96 })).tier).toBe('low');
  });
  it('describes catalog streams honestly', () => {
    expect(specOf({ provider: 'deezer', streamKind: 'preview' })).toMatchObject({ kind: 'preview', bitrateKbps: 128 });
    expect(specOf({ provider: 'audius', streamKind: 'full' })).toMatchObject({ approximate: true });
    expect(khz(44100)).toBe('44.1');
    expect(khz(192000)).toBe('192');
  });
});

describe('signalPath', () => {
  const hires = file({ codec: 'FLAC', lossless: true, bitsPerSample: 24, sampleRate: 96000 });
  const cd = file({ codec: 'FLAC', lossless: true, bitsPerSample: 16, sampleRate: 44100 });

  it('flags bit-depth reduction and resampling on wired', () => {
    const p = signalPath(hires, out('wired'));
    expect(p.steps.map((s) => s.state)).toEqual(['good', 'warn', 'warn', 'good']);
    expect(p.steps[2]!.value).toBe('96 → 48 kHz');
    expect(p.effective).toBe('16-bit / 48 kHz → Wired headphones');
    expect(p.state).toBe('warn');
  });

  it('calls Bluetooth lossy', () => {
    const p = signalPath(cd, out('bluetooth'));
    expect(p.steps[3]!.state).toBe('loss');
    expect(p.state).toBe('loss');
    expect(p.verdict).toMatch(/Bluetooth/);
    expect(p.tips.length).toBeGreaterThan(0);
  });

  it('USB DAC at the native rate is clean', () => {
    const p = signalPath(hires, out('usb', { device: { type: 'usb', name: 'DAC', sampleRates: [44100, 48000, 96000], encodings: [] } }));
    expect(p.steps[2]!.state).toBe('good');
    expect(p.effective).toContain('96 kHz');
  });

  it('works without native route info', () => {
    const p = signalPath(cd, null);
    expect(p.steps[3]!.state).toBe('info');
    expect(p.steps).toHaveLength(4);
  });

  it('DLNA receiver: bit-perfect, Android bypassed', () => {
    const p = signalPath(hires, out('bluetooth'), { name: 'Living Room', model: 'RX-V485' });
    expect(p.state).toBe('good');
    expect(p.steps.map((s) => s.title)).toEqual(['File', 'Wi-Fi (DLNA)', 'Decode', 'Output']);
    expect(p.effective).toBe('24-bit / 96 kHz → Living Room');
    expect(p.verdict).toMatch(/Bit-perfect/);
    expect(p.steps[3]!.value).toBe('Living Room · RX-V485');
  });

  it('48 kHz lossless needs no resampling', () => {
    const p = signalPath(file({ codec: 'PCM', lossless: true, bitsPerSample: 16, sampleRate: 48000 }), out('wired'));
    expect(p.state).toBe('good');
    expect(p.verdict).toMatch(/no resampling/);
  });
});
