import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { logEvent } from '@/lib/diagnostics';
import { haptic } from '@/lib/haptics';
import { useColors } from '@/theme';
import { alpha } from '@/lib/palette';
import { Surface } from './Surface';
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
  // Every error the user sees is also kept in Settings → Diagnostics.
  if (kind === 'error') logEvent('error', 'ui', message);
  if (kind === 'error') haptic.error();
  useToasts.setState((s) => ({ items: [...s.items.filter((t) => t.message !== message), { id, message, kind }].slice(-2) }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === 'error' ? 3600 : 2400);
}

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8, alignItems: 'center' }]}>
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <Animated.View key={t.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp.duration(180)} layout={LinearTransition} style={{ marginBottom: 8 }}>
            <Surface radius={22} style={styles.toast} tint={t.kind === 'error' ? alpha(colors.danger, 0.12) : t.kind === 'success' ? alpha(colors.success, 0.1) : undefined}>
              <View style={styles.row} accessibilityLiveRegion="polite">
                <Icon size={18} color={t.kind === 'info' ? colors.text : t.kind === 'success' ? colors.success : colors.danger} strokeWidth={2.4} />
                <Text variant="callout" numberOfLines={2} style={{ flexShrink: 1 }}>
                  {t.message}
                </Text>
              </View>
            </Surface>
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
