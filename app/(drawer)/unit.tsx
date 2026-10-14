import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import {
  propagationUnits,
  unitOverview,
  type PropUnit,
  type UnitOverview,
} from '@/src/services/batches-api';
import { accentFor, borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * The propagation unit at a glance: what it holds, how full it is, what is
 * due out and what is still owed.
 *
 * Utilisation needs a capacity, and a unit whose capacity nobody has set has no
 * utilisation -- not 0%. The server sends null for it and this says so, because
 * an empty-looking bar would be read as an empty unit.
 */
export default function Unit() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');

  const [units, setUnits] = useState<PropUnit[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [data, setData] = useState<UnitOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (unit?: string) =>
      (async () => {
        try {
          const list = units ?? (await propagationUnits());
          const use = unit ?? picked ?? list[0]?.name ?? null;
          setError(null);
          setUnits(list);
          setPicked(use);
          setData(await unitOverview(use ?? undefined));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the unit.');
        }
      })(),
    [units, picked],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const space = data?.space;

  return (
    <Screen
      title="Unit"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      rightIcon="qr-code-outline"
      onPressRight={() => router.push('/scan')}
      loading={data === null && !error}
      error={error}
      onRetry={() => load()}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {(units ?? []).length > 1 ? (
        <View style={s.picker}>
          {(units ?? []).map((u) => (
            <TouchableOpacity
              key={u.name}
              style={[s.chip, u.name === picked ? s.chipOn : null]}
              onPress={() => load(u.name)}
              activeOpacity={0.7}
            >
              <Text style={[s.chipText, u.name === picked ? s.chipTextOn : null]} numberOfLines={1}>
                {u.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {units && units.length === 0 ? (
        <Text style={s.none}>
          No warehouse is marked a propagation unit yet. Tick &ldquo;Propagation unit&rdquo; on the
          warehouse and set its capacity.
        </Text>
      ) : null}

      {space ? (
        <Card title="Space">
          <View style={s.bigRow}>
            <Text style={s.big}>{num(space.on_hand)}</Text>
            <Text style={s.bigUnit}>
              plants{space.capacity_plants ? ` of ${num(space.capacity_plants)}` : ''}
            </Text>
          </View>

          {space.utilisation_pct === null ? (
            <Text style={s.unknown}>
              No capacity set for this unit, so there is nothing to measure against.
            </Text>
          ) : (
            <>
              <View style={s.bar}>
                <View
                  style={[
                    s.barFill,
                    {
                      width: `${Math.min(100, space.utilisation_pct)}%`,
                      backgroundColor: fillColour(space.utilisation_pct),
                    },
                  ]}
                />
              </View>
              <View style={s.spread}>
                <Text style={s.fig}>{space.utilisation_pct}% full</Text>
                <Text style={s.figMuted}>{num(space.free ?? 0)} free</Text>
              </View>
            </>
          )}

          {space.bench_sqm ? (
            <Text style={s.note}>
              {Math.round(space.bench_sqm).toLocaleString()} m² of bench
              {space.plants_per_sqm !== null ? ` · ${space.plants_per_sqm} plants/m²` : ''}
            </Text>
          ) : null}
          {data?.unit?.spec ? <Text style={s.spec}>{data.unit.spec}</Text> : null}
        </Card>
      ) : null}

      {data?.varieties.length ? (
        <Card title={`Varieties here (${data.varieties.length})`}>
          {data.varieties.map((v) => (
            <TouchableOpacity
              key={v.variety}
              style={s.row}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/batches', params: { variety: v.variety } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {v.variety_name ?? v.variety}
                </Text>
                <Text style={s.rowSub}>
                  {v.batches} batch{v.batches === 1 ? '' : 'es'}
                  {v.ready ? ` · ${num(v.ready)} ready` : ''}
                </Text>
              </View>
              <Text style={s.rowValue}>{num(v.plants)}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      ) : null}

      {data?.by_stage.length ? (
        <Card title="By stage">
          {data.by_stage.map((r) => (
            <View key={r.stage} style={s.statRow}>
              <View style={[s.stageDot, { backgroundColor: accentFor(r.stage).fg }]} />
              <Text style={s.statLabel}>{r.stage}</Text>
              <Text style={s.statValue}>
                {r.batches} · {num(r.plants)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {data?.due_out.length ? (
        <Card title="Due out to the farm">
          {data.due_out.slice(0, 10).map((b) => (
            <TouchableOpacity
              key={b.name}
              style={s.row}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/batch/[name]', params: { name: b.name } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {b.variety_name ?? b.variety}
                </Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {b.name} · {b.current_stage}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.rowValue}>{b.expected_delivery?.date ?? '—'}</Text>
                {b.expected_delivery?.overdue_in_stage ? (
                  <Text style={s.late}>{b.expected_delivery.overdue_in_stage}d over</Text>
                ) : (
                  <Text style={s.rowSub}>{b.expected_delivery?.days_out ?? 0} days</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      ) : null}

      {data?.incoming.length ? (
        <Card title={`Still owed (${data.incoming.length})`}>
          <Text style={s.note}>
            A seedling request names a farm, not a unit, so this is what the nursery owes as a
            whole.
          </Text>
          {data.incoming.slice(0, 10).map((r) => (
            <View key={r.name} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {r.farm ?? r.name}
                </Text>
                <Text style={s.rowSub}>
                  {r.name} · by {r.required_by_date ?? '—'}
                </Text>
              </View>
              <Text style={s.rowValue}>{num(r.outstanding)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {data?.diseases.length ? (
        <Card title="Recent scouting">
          {data.diseases.map((d) => (
            <View key={d.name} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {d.disease ?? '—'}
                </Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {d.log_date} · {d.propagation_batch}
                </Text>
              </View>
              {d.severity ? <Pill value={d.severity} tone={severityTone(d.severity)} /> : null}
            </View>
          ))}
        </Card>
      ) : null}

      <TouchableOpacity
        style={s.scanBtn}
        activeOpacity={0.8}
        onPress={() => router.push('/scan')}
      >
        <Ionicons name="qr-code-outline" size={20} color={colors.textOnPrimary} />
        <Text style={s.scanText}>Scan a batch label</Text>
      </TouchableOpacity>
    </Screen>
  );
}

/** Nearly full is the thing worth noticing, so that is what changes colour. */
function fillColour(pct: number): string {
  if (pct >= 95) return colors.error;
  if (pct >= 80) return colors.warning;
  return colors.leaf;
}

function severityTone(s: string): 'neutral' | 'warn' | 'danger' {
  if (s === 'High') return 'danger';
  if (s === 'Medium') return 'warn';
  return 'neutral';
}

const num = (n: number | undefined | null): string =>
  n ? Math.round(n).toLocaleString() : '0';

const s = StyleSheet.create({
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary, maxWidth: 190 },
  chipTextOn: { color: colors.textOnPrimary },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  big: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text },
  bigUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  unknown: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.warning, marginTop: spacing.sm, lineHeight: 17 },
  bar: { height: 6, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginTop: spacing.md },
  barFill: { height: 6, borderRadius: borderRadius.full },
  spread: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  fig: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  figMuted: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  spec: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  rowSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  rowValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  late: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.warning },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  stageDot: { width: 9, height: 9, borderRadius: borderRadius.full },
  statLabel: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  statValue: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  scanText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.textOnPrimary },
});
