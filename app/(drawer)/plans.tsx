import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Pill } from '@/src/components/Pill';
import { productionPlans, type ProductionPlan } from '@/src/services/planning-api';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * The production plans, grouped by the variety they are for.
 *
 * A unit propagates a handful of varieties and each carries several seasons of
 * plan, so a flat list reads as one thing repeated. The variety is the heading
 * because that is what somebody is looking for.
 */
export default function Plans() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');

  const [plans, setPlans] = useState<ProductionPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      (async () => {
        try {
          const res = await productionPlans();
          setError(null);
          setPlans(res.plans);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the plans.');
        }
      })(),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const groups = groupByVariety(plans ?? []);

  return (
    <Screen
      title="Plans"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={plans === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {plans && plans.length === 0 ? (
        <Text style={s.none}>No production plan on this server yet.</Text>
      ) : null}

      {groups.map(([variety, rows]) => (
        <View key={variety} style={s.group}>
          <View style={s.groupHead}>
            <Ionicons name="flower-outline" size={16} color={colors.textSecondary} />
            <Text style={s.variety}>{variety}</Text>
            <Text style={s.count}>{rows.length}</Text>
          </View>

          {rows.map((p) => (
            <TouchableOpacity
              key={p.name}
              style={s.row}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/plan/[name]', params: { name: p.name } })}
            >
              <View style={s.rowTop}>
                <Text style={s.season}>{p.season ?? 'no season'}</Text>
                <Pill value={p.workflow_state ?? p.status ?? '—'} tone={toneFor(p)} />
              </View>
              <Text style={s.farm} numberOfLines={1}>
                {p.farm ?? '—'} · {p.name}
              </Text>

              <View style={s.bar}>
                <View style={[s.barFill, { width: `${clamp(p.coverage_pct)}%` }]} />
              </View>
              <View style={s.figures}>
                <Text style={s.fig}>{Math.round(p.coverage_pct)}% of demand</Text>
                <Text style={s.figMuted}>
                  {num(p.total_production_stems)} of {num(p.total_demand_stems)} stems
                </Text>
              </View>
              {p.weeks_in_deficit ? (
                <Text style={s.deficit}>{p.weeks_in_deficit} week(s) short</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </Screen>
  );
}

/** Varieties in alphabetical order; a plan with no variety still has to appear. */
function groupByVariety(rows: ProductionPlan[]): [string, ProductionPlan[]][] {
  const by = new Map<string, ProductionPlan[]>();
  for (const r of rows) {
    const k = r.variety ?? 'Unnamed variety';
    const list = by.get(k);
    if (list) list.push(r);
    else by.set(k, [r]);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function toneFor(p: ProductionPlan): 'neutral' | 'success' | 'warn' | 'danger' {
  const state = (p.workflow_state ?? p.status ?? '').toLowerCase();
  if (state === 'approved') return 'success';
  if (state === 'rejected') return 'danger';
  if (state.includes('pending')) return 'warn';
  return 'neutral';
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n || 0)));
const num = (n: number | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

const s = StyleSheet.create({
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  group: { marginBottom: spacing.xl },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  variety: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  count: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  row: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  season: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  farm: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  bar: {
    height: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barFill: { height: 5, borderRadius: borderRadius.full, backgroundColor: colors.text },
  figures: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  fig: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  figMuted: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  deficit: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.warning },
});
