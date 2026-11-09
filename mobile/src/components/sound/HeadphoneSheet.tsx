import { useQuery } from '@tanstack/react-query';
import { Check, Headphones } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, useWindowDimensions, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import type { HeadphoneProfile } from '@/audio/eq';
import { useSound } from '@/audio/sound';
import { haptic } from '@/lib/haptics';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { PressableScale } from '../ui/PressableScale';
import { openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

type Entry = Omit<HeadphoneProfile, 'preampDb' | 'filters'>;

export function openHeadphoneSheet() {
  haptic.soft();
  openSheet((close) => <HeadphoneSheet close={close} />);
}

function useDebounced(v: string, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/** Search AutoEq's ~8 800 measured headphones and apply a correction. */
function HeadphoneSheet({ close }: { close: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const current = useSound((s) => s.headphone);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [loading, setLoading] = useState<string | null>(null);
  const results = useQuery({
    queryKey: ['eq-search', query],
    queryFn: ({ signal }) => endpoints.eqSearch(query, signal),
    enabled: query.length >= 2,
    staleTime: 3600_000,
  });

  const pick = async (e: Entry) => {
    setLoading(e.path);
    try {
      const p = await endpoints.eqProfile(e.path);
      useSound.getState().set({ headphone: p, eqEnabled: true });
      haptic.success();
      toast(`${p.name} correction on`, 'success');
      close();
    } catch {
      toast('Couldn’t load that preset', 'error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={{ paddingHorizontal: GUTTER, maxHeight: height * 0.8 }}>
      <Text variant="title2">Headphone correction</Text>
      <Text variant="callout" tone="secondary" style={{ marginTop: 4, marginBottom: 14 }}>
        Measured EQ that makes your headphones sound neutral (AutoEq, ~8 800 models). Works on top of your own bands.
      </Text>
      <TextField label="Your headphones or earbuds" placeholder="e.g. Sony WH-1000XM5, AirPods Pro 2" value={q} onChangeText={setQ} autoFocus autoCorrect={false} returnKeyType="search" />
      <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12, gap: 6 }}>
        {current ? (
          <PressableScale onPress={() => useSound.getState().set({ headphone: null })} style={[styles.item, { borderColor: colors.accent }]} dim>
            <Headphones size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="headline">{current.name}</Text>
              <Text variant="footnote" tone="tertiary">
                On · measured by {current.source}
                {current.rig ? ` on ${current.rig}` : ''} · tap to turn off
              </Text>
            </View>
            <Check size={18} color={colors.accent} />
          </PressableScale>
        ) : null}
        {results.isFetching ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.textSecondary} /> : null}
        {results.isError ? (
          <Text variant="callout" tone="secondary" style={{ marginTop: 12 }}>
            Couldn’t search right now — check your server connection.
          </Text>
        ) : null}
        {query.length >= 2 && results.data?.length === 0 ? (
          <Text variant="callout" tone="secondary" style={{ marginTop: 12 }}>
            No measurements for “{query}”. Try just the model name.
          </Text>
        ) : null}
        {(results.data ?? []).map((e) => (
          <PressableScale key={e.path} onPress={() => pick(e)} style={styles.item} dim>
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {e.name}
              </Text>
              <Text variant="footnote" tone="tertiary" numberOfLines={1}>
                {e.source}
                {e.rig ? ` · ${e.rig}` : ''}
              </Text>
            </View>
            {loading === e.path ? <ActivityIndicator color={colors.textSecondary} /> : current?.path === e.path ? <Check size={18} color={colors.accent} /> : null}
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.fill, borderWidth: 1, borderColor: 'transparent' },
}));
