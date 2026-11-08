import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { Glass } from './Glass';
import { Text } from './Text';

type Kind = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: Kind;
}

const useToasts = create<{ items: ToastItem[] }>()(() => ({ items: [] }));
let seq = 0;

/** Show a short message at the top of the screen. Safe to call from anywhere. */
export function toast(message: string, kind: Kind = 'info') {
  const id = ++seq;
  if (kind === 'error') haptic.error();
  useToasts.setState((s) => ({ items: [...s.items.filter((t) => t.message !== message), { id, message, kind }].slice(-2) }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === 'error' ? 3600 : 2400);
}

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;
const TINT = { info: colors.text, success: colors.success, error: colors.danger } as const;

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const insets = useSafeAreaInsets();
  useEffect(() => undefined, []);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8, alignItems: 'center' }]}>
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <Animated.View key={t.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp.duration(180)} layout={LinearTransition} style={{ marginBottom: 8 }}>
            <Glass radius={22} intensity={60} style={styles.toast}>
              <View style={styles.row} accessibilityLiveRegion="polite">
                <Icon size={18} color={TINT[t.kind]} strokeWidth={2.4} />
                <Text variant="callout" numberOfLines={2} style={{ flexShrink: 1 }}>
                  {t.message}
                </Text>
              </View>
            </Glass>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { maxWidth: 360, minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
});
