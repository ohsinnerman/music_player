import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

/** Settings-style grouped list primitives (shared by Settings and Sound). */
export function Group({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  const styles = useRowStyles();
  return (
    <View style={{ marginTop: 28 }}>
      <Text variant="label" tone="tertiary" style={{ marginLeft: GUTTER + 4, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={styles.group}>{children}</View>
      {footer ? (
        <Text variant="footnote" tone="tertiary" style={{ marginHorizontal: GUTTER + 4, marginTop: 8 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({ icon: Icon, label, hint, onPress, color: colorProp, right }: { icon?: LucideIcon; label: string; hint?: string; onPress?: () => void; color?: string; right?: ReactNode }) {
  const colors = useColors();
  const color = colorProp ?? colors.text;
  const styles = useRowStyles();
  return (
    <PressableScale onPress={onPress} disabled={!onPress} dim scaleTo={0.99} style={styles.row}>
      {Icon ? <Icon size={20} color={color} strokeWidth={2} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" color={color}>
          {label}
        </Text>
        {hint ? (
          <Text variant="footnote" tone="tertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
    </PressableScale>
  );
}

export function Toggle({ label, value, onChange, hint, disabled }: { label: string; value: boolean; onChange: () => void; hint?: string; disabled?: boolean }) {
  const colors = useColors();
  const styles = useRowStyles();
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="footnote" tone="tertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.fillStrong }} thumbColor="#fff" accessibilityLabel={label} />
    </View>
  );
}

export function Separator() {
  const styles = useRowStyles();
  return <View style={styles.sep} />;
}

export const useRowStyles = makeStyles((colors) => ({
  group: { marginHorizontal: GUTTER, borderRadius: radius.lg, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 54, paddingVertical: 10 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.stroke, marginLeft: 16 },
}));
