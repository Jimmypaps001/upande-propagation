import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { listBatches, type BatchRow } from '@/src/services/batches-api';
import { accentFor, borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const STAGES = [
  'Cutting', 'Sticking', 'Callusing', 'Rooting',
  'Nursery', 'Hardening', 'Ready for Dispatch',
];

/** Batches, filtered by stage or by the variety a scan landed on. */
export default function Batches() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const { variety } = useLocalSearchParams<{ variety?: string }>();

  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (nextStage?: string | null) =>
      (async () => {
        try {
          const use = nextStage === undefined ? stage : nextStage;
          setError(null);
          setStage(use ?? null);
          setRows(await listBatches({ variety, stage: use ?? undefined }));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the batches.');
        }
      })(),
    [variety, stage],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variety]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <Screen
      title={variety ? String(variety) : 'Batches'}
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      rightIcon="qr-code-outline"
      onPressRight={() => router.push('/scan')}
      loading={rows === null && !error}
      error={error}
      onRetry={() => load()}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <View style={s.filters}>
        <Chip label="All" on={!stage} onPress={() => load(null)} />
        {STAGES.map((st) => (
          <Chip key={st} label={st} on={stage === st} onPress={() => load(st)} />
        ))}
      </View>

      {rows && rows.length === 0 ? (
        <Text style={s.none}>
          Nothing here{stage ? ` at ${stage}` : ''}
          {variety ? ` for ${variety}` : ''}.
        </Text>
      ) : null}

      {(rows ?? []).map((b) => (
        <TouchableOpacity
          key={b.name}
          style={s.card}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/batch/[name]', params: { name: b.name } })}
        >
          <View style={s.cardTop}>
            <Text style={s.variety} numberOfLines={1}>
              {b.variety_name ?? b.variety ?? '—'}
            </Text>
            <StageBadge stage={b.current_stage} />
          </View>
          <Text style={s.name}>{b.name}</Text>
          <View style={s.figures}>
            <Figure label="Surviving" value={num(b.total_survived)} />
            <Figure label="Ready" value={num(b.available_to_dispatch)} />
            {b.success_rate ? <Figure label="Success" value={`${Math.round(b.success_rate)}%`} /> : null}
          </View>
        </TouchableOpacity>
      ))}
    </Screen>
  );
}

/** Each rung of the ladder has its own colour; an unknown stage stays neutral. */
function StageBadge({ stage }: { stage: string | null }) {
  const a = accentFor(stage);
  return (
    <View style={[s.stage, { backgroundColor: a.bg }]}>
      <Text style={[s.stageText, { color: a.fg }]} numberOfLines={1}>
        {stage ?? '—'}
      </Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, on ? s.chipOn : null]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, on ? s.chipTextOn : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={s.figValue}>{value}</Text>
      <Text style={s.figLabel}>{label}</Text>
    </View>
  );
}

const num = (n: number | undefined | null): string => (n ? Math.round(n).toLocaleString() : '0');

const s = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  stage: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    maxWidth: 150,
  },
  stageText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  variety: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  name: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  figures: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  figValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  figLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
