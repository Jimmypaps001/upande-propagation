import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Button } from '@/src/components/Button';
import { productionPlans, type ProductionPlan } from '@/src/services/planning-api';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * One production plan: what it promised, and what it covers.
 *
 * Plans used to open the protocol directly, which answered a question nobody
 * had asked yet -- and worse, the protocol shown was the one in force for the
 * variety rather than the one the plan was built on. The plan comes first, and
 * the protocol is a step you take from it.
 */
export default function Plan() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();

  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      (async () => {
        try {
          const res = await productionPlans();
          const found = res.plans.find((p) => p.name === name) ?? null;
          setError(found ? null : `No plan called ${name}.`);
          setPlan(found);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the plan.');
        }
      })(),
    [name],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const coverage = Math.round(plan?.coverage_pct ?? 0);

  return (
    <Screen
      title={String(name)}
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      loading={plan === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {plan ? (
        <>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.variety}>{plan.variety ?? '—'}</Text>
              <Text style={s.sub}>
                {plan.farm ?? '—'} · {plan.season ?? 'no season'}
              </Text>
            </View>
            <Pill value={plan.workflow_state ?? plan.status ?? '—'} tone={tone(plan)} />
          </View>

          <Card title="Against demand">
            <View style={s.bigRow}>
              <Text style={[s.big, { color: coverageColour(coverage) }]}>{coverage}%</Text>
              <Text style={s.bigUnit}>of what the market asked for</Text>
            </View>
            <View style={s.bar}>
              <View
                style={[
                  s.barFill,
                  { width: `${Math.min(100, coverage)}%`, backgroundColor: coverageColour(coverage) },
                ]}
              />
            </View>
            <Row label="Demand" value={`${num(plan.total_demand_stems)} stems`} />
            <Row label="Planned production" value={`${num(plan.total_production_stems)} stems`} />
            <Row label="Weeks covered" value={String(plan.weeks_covered ?? 0)} />
            {plan.weeks_in_deficit ? (
              <Row label="Weeks short" value={String(plan.weeks_in_deficit)} warn />
            ) : null}
            {plan.new_beds_required ? (
              <Row label="New beds needed" value={String(plan.new_beds_required)} />
            ) : null}
          </Card>

          <Card title="The record">
            <Row label="Plan" value={plan.name} />
            <Row label="State" value={plan.workflow_state ?? plan.status ?? '—'} />
            <Row
              label="Authoritative"
              value={plan.is_authoritative ? 'submitted' : 'still a draft'}
            />
            <Row label="Budget" value={plan.budget ?? 'none yet'} />
          </Card>

          <Button
            label="The protocol it was built on"
            variant="outline"
            iconLeft="document-text-outline"
            onPress={() => router.push({ pathname: '/protocol', params: { plan: plan.name } })}
            style={{ marginTop: spacing.md }}
          />
          <Button
            label="Motherstock behind it"
            variant="outline"
            iconLeft="git-branch-outline"
            onPress={() => router.push({ pathname: '/motherstock', params: { plan: plan.name } })}
            style={{ marginTop: spacing.sm }}
          />
        </>
      ) : null}
    </Screen>
  );
}

function tone(p: ProductionPlan): 'neutral' | 'success' | 'warn' | 'danger' {
  const state = (p.workflow_state ?? p.status ?? '').toLowerCase();
  if (state === 'approved') return 'success';
  if (state === 'rejected') return 'danger';
  if (state.includes('pending')) return 'warn';
  return 'neutral';
}

/** Short of demand is the thing worth seeing, so it is the thing that colours. */
function coverageColour(pct: number): string {
  if (pct >= 100) return colors.leaf;
  if (pct >= 85) return colors.warning;
  return colors.error;
}

const num = (n: number | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, warn ? { color: colors.warning } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  big: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl },
  bigUnit: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  bar: {
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  barFill: { height: 6, borderRadius: borderRadius.full },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 3 },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
});
