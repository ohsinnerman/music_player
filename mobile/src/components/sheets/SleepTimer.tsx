import { Check, MoonStar } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { setSleepTimer } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { colors, GUTTER } from '@/theme';
import { PressableScale } from '../ui/PressableScale';
import { openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const OPTIONS: { label: string; value: number | 'track' }[] = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '1 hour', value: 60 },
  { label: 'End of this song', value: 'track' },
];

function SleepTimerBody({ close }: { close: () => void }) {
  const sleepAt = usePlayer((s) => s.sleepAt);
  const [openedAt] = useState(() => Date.now());
  const remaining = sleepAt && sleepAt > 0 ? Math.max(1, Math.round((sleepAt - openedAt) / 60_000)) : null;
  return (
    <View>
      <View style={styles.head}>
        <MoonStar size={22} color={colors.text} />
        <Text variant="title2">Sleep timer</Text>
      </View>
      {sleepAt !== null ? (
        <Text variant="callout" tone="secondary" style={{ paddingHorizontal: GUTTER, marginBottom: 6 }}>
          {sleepAt === -1 ? 'Pausing at the end of this song' : `Pausing in about ${remaining} min`}
        </Text>
      ) : null}
      {OPTIONS.map((o) => (
        <PressableScale
          key={o.label}
          dim
          scaleTo={0.98}
          style={styles.row}
          onPress={() => {
            setSleepTimer(o.value);
            close();
            toast(o.value === 'track' ? 'Will pause after this song' : `Will pause in ${o.label}`, 'success');
          }}
        >
          <Text variant="body" style={{ flex: 1 }}>
            {o.label}
          </Text>
          {sleepAt === -1 && o.value === 'track' ? <Check size={18} color={colors.accent} /> : null}
        </PressableScale>
      ))}
      {sleepAt !== null ? (
        <PressableScale
          dim
          scaleTo={0.98}
          style={styles.row}
          onPress={() => {
            setSleepTimer(null);
            close();
            toast('Sleep timer off');
          }}
        >
          <Text variant="body" color={colors.danger}>
            Turn off timer
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export function openSleepTimer() {
  openSheet((close) => <SleepTimerBody close={close} />);
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: GUTTER, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: GUTTER + 2 },
});
