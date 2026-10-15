import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { PickerField } from '@/src/components/PickerField';
import { lightHaptic } from '@/src/services/feedback';
import { reports, varieties, type Reports } from '@/src/services/operations-api';
import { userMessage } from '@/src/services/user-message';
import { accentFor, borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const WINDOWS = [
  { label: '4 weeks', days: 28 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 182 },
  { label: 'A year', days: 365 },
];

/**
 * The three questions a unit manager is asked every week.
 *
 * What came in, what is standing, what went out. Off the same documents the
 * screens read -- the arrivals are Plant Consignments, the stock is the batch
 * rollup, the dispatches are Seedling Dispatches -- so a figure here and a
 * figure on a batch card cannot disagree.
 *
 * Stock at hand counts logs, not typed totals. A batch nobody has logged
 * against contributes nothing, deliberately: that is a batch nobody has
 * counted, and showing its planned figure as if it were real is how a nursery
 * reports plants it does not have.
 */
export default function ReportsScreen() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');

  const [data, setData] = useState<Reports | null>(null);
  const [days, setDays] = useState(90);
  const [variety, setVariety] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (nextDays?: number, nextVariety?: string | null) =>
      (async () => {
        try {
          const d = nextDays ?? days;
          const v = nextVariety === undefined ? variety : nextVariety;
          setError(null);
          setData(await reports({ from: daysAgo(d), variety: v ?? undefined }));
        } catch (e) {
          setError(userMessage(e, 'Could not build the report.'));
        }
      })(),
    [days, variety],
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

  const a = data?.arrivals;
  const st = data?.stock;
  const d = data?.dispatches;

  return (
    <Screen
      title="Reports"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={data === null && !error}
      error={error}
      onRetry={() => load()}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {WINDOWS.map((w) => (
          <TouchableOpacity
            key={w.label}
            style={[s.chip, days === w.days ? s.chipOn : null]}
            activeOpacity={0.7}
            onPress={() => {
              lightHaptic();
              setDays(w.days);
              load(w.days);
            }}
          >
            <Text style={[s.chipText, days === w.days ? s.chipTextOn : null]}>{w.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <PickerField
        label="Variety"
        value={variety}
        placeholder="Every variety"
        load={async () => [
          { value: '', label: 'Every variety' },
          ...(await varieties()).map((v) => ({
            value: v.name,
            label: v.item_name ?? v.name,
            hint: v.item_group,
          })),
        ]}
        onChange={(v) => {
          setVariety(v || null);
          load(undefined, v || null);
        }}
      />

      {data ? (
        <Text style={s.window}>
          {data.window.from_date} to {data.window.to_date}
        </Text>
      ) : null}

      {/* ---------------------------------------------------------- what came in */}
      {a ? (
        <Card title="Consignments received">
          <View style={s.headline}>
            <Big value={num(a.received)} label="plants arrived" />
            <Big value={String(a.consignments)} label="deliveries" />
          </View>
          <Split
            left={{ label: 'Accepted', value: num(a.accepted), colour: colors.leaf }}
            right={{ label: 'Turned away', value: num(a.rejected), colour: colors.error }}
            leftShare={a.received ? (a.accepted / a.received) * 100 : 0}
          />
          <Text style={s.note}>
            {a.reject_pct ? `${a.reject_pct}% turned away` : 'Nothing turned away'} over the window.
          </Text>

          {a.by_supplier.map((r) => (
            <View key={r.supplier ?? 'none'} style={s.row}>
              <Text style={s.rowName} numberOfLines={1}>
                {r.supplier_name ?? r.supplier ?? '—'}
              </Text>
              <Text style={s.rowValue}>{num(r.received)}</Text>
              <Text
                style={[s.rowPct, r.reject_pct > 5 ? { color: colors.error } : null]}
              >
                {r.reject_pct ? `${r.reject_pct}%` : '—'}
              </Text>
            </View>
          ))}
          {a.by_supplier.length ? (
            <Text style={s.note}>Plants received, and the share of each that was turned away.</Text>
          ) : null}
        </Card>
      ) : null}

      {/* ----------------------------------------------------- what is standing */}
      {st ? (
        <Card title="Stock at hand">
          <View style={s.headline}>
            <Big value={num(st.on_hand)} label="plants standing" />
            <Big value={num(st.ready_to_dispatch)} label="ready to leave" />
          </View>
          <Text style={s.note}>
            Across {st.batches} batch{st.batches === 1 ? '' : 'es'}. Counted from the logs, so a
            batch nobody has logged against counts as nothing.
          </Text>

          {st.by_stage.map((r) => {
            const tone = accentFor(r.stage);
            const share = st.on_hand ? (r.plants / st.on_hand) * 100 : 0;
            return (
              <View key={r.stage} style={s.stageRow}>
                <Text style={s.stageName} numberOfLines={1}>
                  {r.stage}
                </Text>
                <View style={s.barWrap}>
                  <View style={[s.bar, { width: `${share}%`, backgroundColor: tone.fg }]} />
                </View>
                <Text style={s.rowValue}>{num(r.plants)}</Text>
              </View>
            );
          })}

          {st.by_variety.length ? (
            <>
              <Text style={s.subhead}>By variety</Text>
              {st.by_variety.slice(0, 8).map((r) => (
                <TouchableOpacity
                  key={r.variety}
                  style={s.row}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push({ pathname: '/batches', params: { variety: r.variety } })
                  }
                >
                  <Text style={s.rowName} numberOfLines={1}>
                    {r.variety_name ?? r.variety}
                  </Text>
                  <Text style={s.rowValue}>{num(r.plants)}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          {st.by_unit.length > 1 ? (
            <>
              <Text style={s.subhead}>By unit</Text>
              {st.by_unit.map((r) => (
                <View key={r.unit} style={s.row}>
                  <Text style={s.rowName} numberOfLines={1}>
                    {r.unit}
                  </Text>
                  <Text style={s.rowValue}>{num(r.plants)}</Text>
                </View>
              ))}
            </>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------- what went out */}
      {d ? (
        <Card title="Dispatches">
          <View style={s.headline}>
            <Big value={num(d.plants)} label="plants to the farms" />
            <Big value={String(d.count)} label="dispatches" />
          </View>
          {d.by_farm.map((r) => (
            <View key={r.farm} style={s.row}>
              <Text style={s.rowName} numberOfLines={1}>
                {r.farm}
              </Text>
              <Text style={s.rowValue}>{num(r.plants)}</Text>
            </View>
          ))}
          {d.rows.length === 0 ? (
            <Text style={s.note}>Nothing has left the unit over this window.</Text>
          ) : null}
        </Card>
      ) : null}

      {data?.losses ? (
        <Card title="Losses">
          <View style={s.headline}>
            <Big value={num(data.losses.plants)} label="plants lost" tone={colors.error} />
            <Big value={String(data.losses.logs)} label="logs written" />
          </View>
          <Text style={s.note}>
            Counted off the daily logs over the window, not off the batch totals, so an old batch
            does not keep reporting a loss that happened last season.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function Big({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.big, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={s.bigLabel}>{label}</Text>
    </View>
  );
}

/** One bar with two shares of it, which reads faster than two numbers. */
function Split({
  left,
  right,
  leftShare,
}: {
  left: { label: string; value: string; colour: string };
  right: { label: string; value: string; colour: string };
  leftShare: number;
}) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={s.splitBar}>
        <View style={{ width: `${Math.max(0, Math.min(100, leftShare))}%`, backgroundColor: left.colour }} />
        <View style={{ flex: 1, backgroundColor: right.colour }} />
      </View>
      <View style={s.splitLabels}>
        <Text style={[s.splitText, { color: left.colour }]}>
          {left.value} {left.label.toLowerCase()}
        </Text>
        <Text style={[s.splitText, { color: right.colour }]}>
          {right.value} {right.label.toLowerCase()}
        </Text>
      </View>
    </View>
  );
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const num = (n: number | null | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

const s = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
  window: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  headline: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  big: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  bigLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  splitBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  splitLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  splitText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },
  note: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  subhead: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  rowValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  rowPct: { width: 44, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  stageName: { width: 104, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  barWrap: { flex: 1, height: 6, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  bar: { height: 6, borderRadius: borderRadius.full },
});
