import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { PickerField } from '@/src/components/PickerField';
import { lightHaptic } from '@/src/services/feedback';
import { farmPlan, type FarmPlan } from '@/src/services/planning-api';
import { dispatchTargets } from '@/src/services/operations-api';
import { userMessage } from '@/src/services/user-message';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const HORIZONS = [
  { label: '3 months', weeks: 13 },
  { label: '6 months', weeks: 26 },
  { label: 'A year', weeks: 52 },
];

/**
 * What a farm is expecting, and who is raising it.
 *
 * The unit's screens answer "what do we owe". This answers the farm's own
 * question, which is shorter and differently shaped: what lands this week, how
 * many, and from whom. The source split is the point -- a week that is nine
 * tenths bought in is a conversation with a propagator, not with our own
 * bench, and the farm manager is the person who has to have it.
 *
 * The split is the season's allocation applied to each week. That is an
 * approximation and the screen says so, because an allocation is agreed for a
 * season and lorries arrive on Tuesdays.
 */
export default function FarmPlanScreen() {
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');

  const [farm, setFarm] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(26);
  const [data, setData] = useState<FarmPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (nextFarm?: string | null, nextWeeks?: number) =>
      (async () => {
        const f = nextFarm === undefined ? farm : nextFarm;
        if (!f) return;
        setRefreshing(true);
        setError(null);
        try {
          setData(await farmPlan({ farm: f, weeks: nextWeeks ?? weeks, include_past: true }));
        } catch (e) {
          setError(userMessage(e, 'Could not load the farm plan.'));
        } finally {
          setRefreshing(false);
        }
      })(),
    [farm, weeks],
  );

  useEffect(() => {
    // Open on the first farm the unit can send to, so the screen is never blank.
    (async () => {
      try {
        const t = await dispatchTargets();
        const first = t.farms?.[0]?.name ?? null;
        if (first) {
          setFarm(first);
          void load(first);
        }
      } catch {
        /* the picker still works; it just does not pre-fill */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const own = data?.totals?.from_own_units ?? 0;
  const all = data?.totals?.plants ?? 0;
  const bought = Math.max(0, all - own);

  return (
    <Screen
      title="Farm plan"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={data === null && !error && !!farm}
      error={error}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => void load()}
    >
      <PickerField
        label="Farm"
        value={farm}
        placeholder="Choose a farm"
        load={async () => {
          const t = await dispatchTargets();
          return (t.farms ?? []).map((f) => ({
            value: f.name,
            label: f.farm_name ?? f.name,
            hint: f.company,
          }));
        }}
        onChange={(v) => {
          setFarm(v);
          void load(v);
        }}
      />

      <View style={s.chips}>
        {HORIZONS.map((h) => (
          <TouchableOpacity
            key={h.weeks}
            style={[s.chip, weeks === h.weeks ? s.chipOn : null]}
            activeOpacity={0.7}
            onPress={() => {
              lightHaptic();
              setWeeks(h.weeks);
              void load(undefined, h.weeks);
            }}
          >
            <Text style={[s.chipText, weeks === h.weeks ? s.chipTextOn : null]}>{h.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {data?.reason ? (
        <Card title="Nothing planned">
          <Text style={s.reason}>{data.reason}</Text>
        </Card>
      ) : null}

      {all > 0 ? (
        <Card title="Coming to this farm">
          <View style={s.bigRow}>
            <Text style={s.big}>{num(all)}</Text>
            <Text style={s.bigUnit}>plants over {data?.totals.weeks ?? 0} week(s)</Text>
          </View>
          <View style={s.splitBar}>
            <View style={[s.splitOwn, { flex: own || 0.0001 }]} />
            <View style={[s.splitBought, { flex: bought || 0.0001 }]} />
          </View>
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: colors.leaf }]} />
              <Text style={s.legendText}>{num(own)} raised by us</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: colors.mist }]} />
              <Text style={s.legendText}>{num(bought)} bought in</Text>
            </View>
          </View>
          {data?.own_units?.length ? (
            <Text style={s.sub}>Our units: {data.own_units.join(', ')}</Text>
          ) : (
            <Text style={s.sub}>No unit is allocated to this farm&rsquo;s plan yet.</Text>
          )}
          {/* A trough is planted full or not at all, so the farm receives more
              than the plan asked for. Those are real plants that need real
              ground, which is why this is stated rather than rounded away. */}
          {(data?.totals?.surplus ?? 0) > 0 ? (
            <Text style={s.sub}>
              The plan asks for {num(data?.totals?.demand ?? 0)}. Troughs plant full, so{' '}
              {num(data?.totals?.surplus ?? 0)} more arrive than were asked for &mdash;
              find ground for them.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {(data?.weeks ?? []).map((w) => (
        <Card key={w.week} title={w.week}>
          <View style={s.weekHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.weekDate}>{whenReadable(w.deliver_on)}</Text>
              <Text style={s.weekVar} numberOfLines={1}>
                {w.varieties.join(', ') || '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.weekQty}>{num(w.plants)}</Text>
              <Text style={s.weekQtyUnit}>plants</Text>
            </View>
          </View>
          {w.sources.map((src) => (
            <View key={src.name} style={s.srcRow}>
              <View
                style={[
                  s.dot,
                  {
                    backgroundColor: (data?.own_units ?? []).includes(src.name)
                      ? colors.leaf
                      : colors.mist,
                  },
                ]}
              />
              <Text style={s.srcName} numberOfLines={1}>
                {src.name}
              </Text>
              <Text style={s.srcQty}>{num(src.plants)}</Text>
            </View>
          ))}
          {/* Which troughs this week actually comes off. A delivery of 7,000
              that is one trough's second lift is a different thing to plan
              around from 7,000 off seven troughs. */}
          {(data?.lots ?? [])
            .filter((L) => L.ready_on === w.deliver_on)
            .map((L, i) => (
              <Text key={`${L.trough}-${L.lift_no}-${i}`} style={s.lotRow}>
                {L.trough} &middot; lift {L.lift_no} of a {num(L.trough_lot)} trough
                planted {whenReadable(L.planted_on)} &rarr; {num(L.plants)}
              </Text>
            ))}
          {!w.from_calendar ? (
            <Text style={s.lotRow}>
              An even share of the season, not a trough date &mdash; no troughs are
              set up for this plan yet.
            </Text>
          ) : null}
        </Card>
      ))}

      {all > 0 ? (
        <Text style={s.footnote}>
          The split per week applies the season&rsquo;s allocation. An allocation is agreed for a
          season; lorries arrive on a Tuesday.
        </Text>
      ) : null}
    </Screen>
  );
}

const num = (n: number | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

function whenReadable(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
  reason: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  big: { fontFamily: fontFamily.semiBold, fontSize: 34, color: colors.text },
  bigUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  splitOwn: { backgroundColor: colors.leaf },
  splitBought: { backgroundColor: colors.mist },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  weekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  weekDate: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  weekVar: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  weekQty: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  weekQtyUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  srcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  srcName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  srcQty: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  lotRow: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    marginLeft: 16,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
});
