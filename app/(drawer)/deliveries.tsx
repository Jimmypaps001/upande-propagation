import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { lightHaptic } from '@/src/services/feedback';
import {
  deliverySchedule,
  type DeliverySchedule,
  type DeliveryWeek,
} from '@/src/services/planning-api';
import { userMessage } from '@/src/services/user-message';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const HORIZONS = [
  { label: '4 weeks', weeks: 4 },
  { label: '3 months', weeks: 13 },
  { label: '6 months', weeks: 26 },
  { label: 'A year', weeks: 52 },
];

/**
 * What the unit owes the farms, and when.
 *
 * This is the unit's own question. It is not "did we cover the market" -- that
 * argument finished before the plan was approved and the unit has no standing
 * in it. It is: which lorry, which week, which farm, how many plants, and has
 * it gone yet.
 *
 * Grouped by week rather than by plan because that is how the work lands: a
 * lorry carries whatever is ready that week, regardless of which plan each
 * tray belongs to. Each row still names its plan, so a disagreement about a
 * number has somewhere to go.
 *
 * Only approved plans. Loading a lorry against a draft is how a farm ends up
 * with plants nobody agreed to.
 */
export default function DeliveriesScreen() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');

  const [data, setData] = useState<DeliverySchedule | null>(null);
  const [weeks, setWeeks] = useState(13);
  const [farm, setFarm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (nextWeeks?: number, nextFarm?: string | null) =>
      (async () => {
        setRefreshing(true);
        setError(null);
        try {
          const res = await deliverySchedule({
            weeks: nextWeeks ?? weeks,
            farm: (nextFarm === undefined ? farm : nextFarm) ?? undefined,
          });
          setData(res);
        } catch (e) {
          setError(userMessage(e, 'Could not load the delivery schedule.'));
        } finally {
          setRefreshing(false);
        }
      })(),
    [weeks, farm],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The farm filter offers only farms that actually have something coming, so
  // choosing one can never produce an empty screen.
  const farms = data?.farms ?? [];

  const outstanding = data?.totals?.outstanding ?? 0;
  const planned = data?.totals?.plants ?? 0;

  const shown: DeliveryWeek[] = useMemo(() => data?.weeks ?? [], [data]);

  return (
    <Screen
      title="To the farms"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={data === null && !error}
      error={error}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => void load()}
    >
      <View style={s.chips}>
        {HORIZONS.map((h) => (
          <TouchableOpacity
            key={h.weeks}
            style={[s.chip, weeks === h.weeks ? s.chipOn : null]}
            activeOpacity={0.7}
            onPress={() => {
              lightHaptic();
              setWeeks(h.weeks);
              void load(h.weeks);
            }}
          >
            <Text style={[s.chipText, weeks === h.weeks ? s.chipTextOn : null]}>{h.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {farms.length > 1 ? (
        <View style={s.chips}>
          <TouchableOpacity
            style={[s.chip, !farm ? s.chipOn : null]}
            activeOpacity={0.7}
            onPress={() => {
              lightHaptic();
              setFarm(null);
              void load(undefined, null);
            }}
          >
            <Text style={[s.chipText, !farm ? s.chipTextOn : null]}>Every farm</Text>
          </TouchableOpacity>
          {farms.map((f) => (
            <TouchableOpacity
              key={f}
              style={[s.chip, farm === f ? s.chipOn : null]}
              activeOpacity={0.7}
              onPress={() => {
                lightHaptic();
                setFarm(f);
                void load(undefined, f);
              }}
            >
              <Text style={[s.chipText, farm === f ? s.chipTextOn : null]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {data?.reason ? (
        <Card title="Nothing to load">
          <Text style={s.reason}>{data.reason}</Text>
        </Card>
      ) : null}

      {planned ? (
        <Card title="Over this window">
          <View style={s.bigRow}>
            <Text style={s.big}>{num(outstanding)}</Text>
            <Text style={s.bigUnit}>plants still to go</Text>
          </View>
          <Text style={s.sub}>
            {num(planned)} planned across {data?.totals.weeks ?? 0} week(s)
            {data?.totals.delivered ? ` · ${num(data.totals.delivered)} already delivered` : ''}
          </Text>
        </Card>
      ) : null}

      {shown.map((w) => (
        <Card key={w.week} title={w.week}>
          <View style={s.weekHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.weekDate}>{whenReadable(w.deliver_on)}</Text>
              <Text style={s.weekFarms} numberOfLines={1}>
                {w.farms.join(', ') || '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.weekQty}>{num(w.plants)}</Text>
              <Text style={s.weekQtyUnit}>plants</Text>
            </View>
          </View>

          {w.rows.map((r) => (
            <TouchableOpacity
              key={`${r.plan}-${r.deliver_on}`}
              style={s.row}
              activeOpacity={0.7}
              onPress={() => {
                lightHaptic();
                router.push(`/plan/${encodeURIComponent(r.plan)}`);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowVariety} numberOfLines={1}>
                  {r.variety ?? '—'}
                </Text>
                <Text style={s.rowFarm} numberOfLines={1}>
                  to {r.farm ?? '—'} · {howRaised(r.source)}
                </Text>
                {r.plant_week ? (
                  <Text style={s.rowNote} numberOfLines={1}>
                    planting {r.plant_week}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.rowQty}>{num(r.plants)}</Text>
                {r.delivered ? (
                  <Text style={[s.rowState, { color: colors.leaf }]}>
                    {num(r.delivered)} gone
                  </Text>
                ) : (
                  <Text style={s.rowState}>{r.state}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

/** Where the week's plants come from -- which is how the unit has to raise them. */
function howRaised(src: {
  existing_motherstock: number;
  new_motherstock: number;
  bought: number;
}): string {
  const parts: string[] = [];
  if (src.existing_motherstock) parts.push(`${num(src.existing_motherstock)} off standing MS`);
  if (src.new_motherstock) parts.push(`${num(src.new_motherstock)} off new MS`);
  if (src.bought) parts.push(`${num(src.bought)} bought in`);
  return parts.join(' · ') || 'source not set';
}

function whenReadable(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const num = (n: number | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

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
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
  weekFarms: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  weekQty: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  weekQtyUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowVariety: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  rowFarm: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  rowNote: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  rowQty: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  rowState: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
