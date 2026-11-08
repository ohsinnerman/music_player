import { router } from 'expo-router';
import { CloudOff, type LucideIcon, ServerCog } from 'lucide-react-native';
import { memo } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { GUTTER, makeStyles, useColors } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export const EmptyState = memo(function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Icon size={28} color={colors.textSecondary} strokeWidth={1.8} />
      </View>
      <Text variant="title3" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="callout" tone="secondary" align="center" style={{ maxWidth: 300 }}>
          {body}
        </Text>
      ) : null}
      {action ? <Button title={action.label} variant="secondary" onPress={action.onPress} style={{ marginTop: 8 }} /> : null}
    </View>
  );
});

/** Friendly error with the right next step (retry, or go set the server up). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const e = error instanceof ApiError ? error : null;
  const serverProblem = e?.code === 'no_server' || e?.code === 'bad_server' || e?.code === 'insecure_server';
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>{serverProblem ? <ServerCog size={28} color={colors.textSecondary} /> : <CloudOff size={28} color={colors.textSecondary} />}</View>
      <Text variant="title3" align="center">
        {serverProblem ? 'Connect your server' : e?.status === 502 ? 'Music service is taking a break' : 'Something went wrong'}
      </Text>
      <Text variant="callout" tone="secondary" align="center" style={{ maxWidth: 300 }}>
        {e?.message ?? 'Please try again in a moment.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        {serverProblem ? <Button title="Open settings" onPress={() => router.push('/settings')} /> : null}
        {onRetry && !serverProblem ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER * 2, paddingVertical: 60, gap: 10 },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
}));
