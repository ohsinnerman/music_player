import { LinearGradient } from 'expo-linear-gradient';
import { AudioLines, AudioWaveform } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Track } from '@/api/types';
import { assess, specOf, type Tier } from '@/lib/quality';
import { fonts, makeStyles, useColors } from '@/theme';
import { Text } from '../ui/Text';

export const HIRES_GOLD = ['#F6D68A', '#D9A441'] as const;

export function tierColor(tier: Tier, colors: ReturnType<typeof useColors>): string {
  if (tier === 'hires') return colors.scheme === 'dark' ? HIRES_GOLD[0] : '#A8741A';
  if (tier === 'lossless') return colors.text;
  return colors.textSecondary;
}

/**
 * Quality badge: "Hi-Res 24/96", "Lossless 16/44.1", "MP3 320".
 * `size="sm"` is the tiny tag used in track rows; `md` is the player chip.
 */
export const QualityBadge = memo(function QualityBadge({ track, size = 'md' }: { track: Track; size?: 'sm' | 'md' }) {
  const colors = useColors();
  const styles = useStyles();
  const a = assess(specOf(track));

  if (size === 'sm') {
    if (a.tier !== 'hires' && a.tier !== 'lossless') return null; // rows only call out lossless
    const hires = a.tier === 'hires';
    return (
      <View style={[styles.sm, hires ? styles.smHires : null]} accessibilityLabel={a.label}>
        <Text variant="label" style={styles.smText} color={hires ? tierColor('hires', colors) : colors.textSecondary}>
          {hires ? 'Hi-Res' : 'Lossless'}
        </Text>
      </View>
    );
  }

  const Icon = a.tier === 'hires' || a.tier === 'lossless' ? AudioWaveform : AudioLines;
  const c = tierColor(a.tier, colors);
  const label = a.tier === 'hires' ? 'Hi-Res' : a.tier === 'lossless' ? 'Lossless' : null;
  return (
    <View style={styles.md} accessibilityLabel={`${a.label}, ${a.spec}`}>
      {a.tier === 'hires' ? (
        <LinearGradient colors={[`${HIRES_GOLD[0]}33`, `${HIRES_GOLD[1]}14`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      <Icon size={13} color={c} strokeWidth={2.4} />
      {label ? (
        <Text variant="label" style={styles.mdLabel} color={c}>
          {label}
        </Text>
      ) : null}
      <Text variant="footnote" style={styles.mdSpec} color={label ? colors.textSecondary : c} numberOfLines={1}>
        {a.short}
        {!label && specOf(track).kind === 'preview' ? ' · preview' : ''}
      </Text>
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  sm: { paddingHorizontal: 5, height: 15, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong, justifyContent: 'center' },
  smHires: { borderColor: colors.scheme === 'dark' ? 'rgba(246,214,138,0.55)' : 'rgba(168,116,26,0.5)' },
  smText: { fontSize: 8.5, lineHeight: 11, letterSpacing: 0.6 },
  md: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.strokeStrong,
  },
  mdLabel: { fontSize: 10.5, letterSpacing: 0.9 },
  mdSpec: { fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] },
}));
