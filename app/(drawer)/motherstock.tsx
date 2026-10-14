import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import {
  motherstockLine,
  productionPlans,
  type MotherstockLine,
} from '@/src/services/planning-api';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * The motherstock behind a plan: what was ordered to start the line, what it
 * yields at its peak, and the batches already bought.
 *
 * Not every protocol has one. A variety raised from a bought-in pool has no
 * mother plants at all, and the server says so rather than showing zeroes.
 */
export default function Motherstock() {
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const { plan: planParam } = useLocalSearchParams<{ plan?: string }>();

  const [plan, setPlan] = useState<string | null>(planParam ?? null);
  const [line, setLine] = useState<MotherstockLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      (async () => {
        try {
          // Without a plan named, fall back to the one the server would open on.
          let use = planParam ?? null;
          if (!use) {
            const res = await productionPlans();
            use = res.default ?? res.plans[0]?.name ?? null;
          }
          setPlan(use);
          setError(null);
          setLine(use ? await motherstockLine(use) : null);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the motherstock.');
        }
      })(),
    [planParam],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const chosen = line?.chosen;
  const saved = line?.saved ?? [];

  return (
    <Screen
      title="Motherstock"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={line === null && !error && !!plan}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {plan ? <Text style={s.plan}>{plan}</Text> : <Text style={s.none}>No plan to show.</Text>}

      {line && !chosen ? (
        <Text style={s.none}>
          {line.reason ??
            'This protocol raises its plants from a bought-in pool, so there is no motherstock line.'}
        </Text>
      ) : null}

      {chosen ? (
        <>
          <Card title="The decision">
            <Row label="Tissue culture ordered" value={num(chosen.tc)} />
            <Row label="Multiplication rounds" value={String(chosen.multiplications)} />
            <Row label="Order by" value={chosen.order_by ?? '—'} warn={chosen.order_late} />
            <Row label="First cut" value={chosen.first_cut_date ?? '—'} />
            <Row label="Line ends" value={chosen.line_end_date ?? '—'} />
            {chosen.order_late ? (
              <Text style={s.late}>The order-by date has passed.</Text>
            ) : null}
          </Card>

          <Card title="What it covers">
            <Row label="Peak pool" value={num(chosen.peak_pool)} />
            <Row label="Weeks met" value={String(chosen.weeks_met)} />
            <Row label="Covers" value={`${Math.round(chosen.covers ?? 0)}%`} />
            {chosen.shortfall ? (
              <Row label="Shortfall" value={num(chosen.shortfall)} warn />
            ) : null}
          </Card>

          {line?.peak ? (
            <Card title="At its peak">
              <Row label="Cuttings a week" value={num(line.peak.cuttings)} />
              <Row label="Peak week" value={line.peak.week_label ?? '—'} />
              <Row
                label="Per mother, per week"
                value={(line.peak.per_mother_per_week ?? 0).toFixed(2)}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {saved.length ? (
        <Card title={`Batches bought (${saved.length})`}>
          {saved.map((b) => (
            <View key={b.name} style={s.batch}>
              <View style={s.batchTop}>
                <Text style={s.batchName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Pill value={b.batch_status ?? '—'} />
              </View>
              <Text style={s.batchSub}>
                {num(b.tc_plants_required)} TC → {num(b.mother_plants)} mothers
                {b.bench_sqm ? ` · ${Math.round(b.bench_sqm)} m² bench` : ''}
              </Text>
              <Text style={s.batchDates}>
                ordered {b.tc_order_date ?? '—'} · on farm {b.tc_on_farm_date ?? '—'} · expires{' '}
                {b.expiry_date ?? '—'}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const num = (n: number | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, warn ? { color: colors.warning } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  plan: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 3 },
  rowLabel: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  rowValue: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  late: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.warning, marginTop: spacing.xs },
  batch: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 2 },
  batchTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  batchName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  batchSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  batchDates: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
