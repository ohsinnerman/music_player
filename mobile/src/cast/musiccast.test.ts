import { describe, expect, it } from 'vitest';
import { label, parseFeatures, parseStatus } from './yxc';

// Trimmed from an RX-V485's system/getFeatures + getNameText.
const FEATURES = {
  response_code: 0,
  zone: [
    {
      id: 'main',
      func_list: ['power', 'sleep', 'volume', 'mute', 'sound_program', 'pure_direct', 'enhancer', 'tone_control', 'actual_volume'],
      input_list: ['hdmi1', 'hdmi2', 'av1', 'audio1', 'tuner', 'server', 'net_radio', 'bluetooth', 'spotify', 'airplay', 'usb'],
      sound_program_list: ['straight', '2ch_stereo', 'hall_in_vienna', 'surr_decoder'],
      range_step: [
        { id: 'volume', min: 0, max: 161, step: 1 },
        { id: 'actual_volume_db', min: -80.5, max: 16.5, step: 0.5 },
      ],
    },
    { id: 'zone2', func_list: ['power', 'volume', 'mute'], input_list: ['server', 'bluetooth'], range_step: [{ id: 'volume', min: 0, max: 161, step: 1 }] },
  ],
};
const NAMES = { response_code: 0, input_list: [{ id: 'hdmi1', text: 'Apple TV' }, { id: 'server', text: 'Server' }], sound_program_list: [{ id: 'hall_in_vienna', text: 'Hall in Vienna' }] };

describe('MusicCast', () => {
  it('reads zones, inputs, programs and ranges', () => {
    const info = parseFeatures(FEATURES, NAMES, 'http://192.168.1.23/YamahaExtendedControl/v1/', 'RX-V485');
    expect(info.zones.map((z) => z.name)).toEqual(['Main', 'Zone 2']);
    const main = info.zones[0]!;
    expect(main.inputs.slice(0, 3)).toEqual([{ id: 'hdmi1', name: 'Apple TV' }, { id: 'hdmi2', name: 'HDMI 2' }, { id: 'av1', name: 'AV 1' }]);
    expect(main.programs.map((p) => p.name)).toEqual(['Straight', '2ch Stereo', 'Hall in Vienna', 'Surround Decoder']);
    expect(main.volume).toEqual({ min: 0, max: 161, step: 1 });
    expect(main.db).toEqual({ min: -80.5, max: 16.5, step: 0.5 });
    expect(main.funcs).toContain('pure_direct');
  });

  it('reads status', () => {
    const s = parseStatus({ response_code: 0, power: 'on', sleep: 0, volume: 75, mute: false, max_volume: 161, input: 'server', sound_program: 'straight', pure_direct: true, enhancer: false, actual_volume: { mode: 'db', value: -43, unit: 'dB' } });
    expect(s).toMatchObject({ power: 'on', volume: 75, input: 'server', pureDirect: true, enhancer: false, db: -43, mute: false });
    expect(parseStatus({ power: 'standby' }).power).toBe('standby');
  });

  it('labels unknown ids readably', () => {
    expect(label('net_radio')).toBe('Net Radio');
    expect(label('phono2')).toBe('PHONO 2');
    expect(label('some_new_input')).toBe('Some New Input');
  });
});
