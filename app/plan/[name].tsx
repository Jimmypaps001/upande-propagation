import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Button } from '@/src/components/Button';
import {
  productionPlans,
  propagationSchedule,
  type ProductionPlan,
  type PropagationSchedule,
  type ScheduleEvent,
  type ScheduleKind,
} from '@/src/services/planning-api';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * The icon and colour for each kind of thing the unit has to do.
 *
 * Ordering a flask and hardening off a tray are different jobs weeks apart, and
 * a list where they look the same is a list nobody reads twice. The colours are
 * the theme's crop accents -- root brown for handwork, mist for what happens
 * under mist, leaf for growing on -- so a stage on this screen matches the same
 * stage on a batch card.
 */
const KIND: Record<ScheduleKind, { icon: React.ComponentProps<typeof Ionicons>['name']; fg: string; bg: string }> = {
  tc_order: { icon: 'cart-outline', fg: colors.mist, bg: colors.mistSoft },
  tc_arrive: { icon: 'cube-outline', fg: colors.mist, bg: colors.mistSoft },
  consignment: { icon: 'cube-outline', fg: colors.mist, bg: colors.mistSoft },
  consignment_ready: { icon: 'checkmark-done-outline', fg: colors.mist, bg: colors.mistSoft },
  stick: { icon: 'hand-left-outline', fg: colors.root, bg: colors.rootSoft },
  root: { icon: 'git-branch-outline', fg: colors.root, bg: colors.rootSoft },
  nursery: { icon: 'leaf-outline', fg: colors.leaf, bg: colors.leafSoft },
  harden: { icon: 'sunny-outline', fg: colors.leaf, bg: colors.leafSoft },
  to_farm: { icon: 'paper-plane-outline', fg: colors.bloom, bg: colors.bloomSoft },

  // Motherstock work. Deliberately one family of colour away from the raising
  // chain above: building the line that supplies cuttings is a different job
  // from raising the crop off it, and a week can be both.
  ms_tc_order: { icon: 'cart-outline', fg: colors.mist, bg: colors.mistSoft },
  ms_tc_arrive: { icon: 'cube-outline', fg: colors.mist, bg: colors.mistSoft },
  ms_cuttable: { icon: 'cut-outline', fg: colors.root, bg: colors.rootSoft },
  ms_multiply: { icon: 'copy-outline', fg: colors.root, bg: colors.rootSoft },
  ms_productive: { icon: 'leaf-outline', fg: colors.leaf, bg: colors.leafSoft },
  ms_first_cut: { icon: 'cut-outline', fg: colors.leaf, bg: colors.leafSoft },
  ms_full: { icon: 'trending-up-outline', fg: colors.leaf, bg: colors.leafSoft },
  ms_renew: { icon: 'refresh-outline', fg: colors.mist, bg: colors.mistSoft },
  ms_expire: { icon: 'hourglass-outline', fg: colors.textMuted, bg: colors.surfaceAlt },
};

/** The four things a unit filters this list down to. */
const LENSES: { label: string; kinds: ScheduleKind[] | null }[] = [
  { label: 'Everything', kinds: null },
  { label: 'Tissue culture', kinds: ['tc_order', 'tc_arrive', 'consignment', 'consignment_ready'] },
  { label: 'Sticking', kinds: ['stick'] },
  { label: 'Rooting on', kinds: ['root', 'nursery', 'harden'] },
  { label: 'To the farm', kinds: ['to_farm'] },
];

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
  const [schedule, setSchedule] = useState<PropagationSchedule | null>(null);
  const [lens, setLens] = useState(0);
  const [showPast, setShowPast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      (async () => {
        try {
          const [res, sched] = await Promise.all([
            productionPlans(),
            // A plan with no propagation plan behind it is a normal state, not
            // an error: it just has nothing to say about the unit's week.
            propagationSchedule({ plan: String(name) }).catch(() => null),
          ]);
          const found = res.plans.find((p) => p.name === name) ?? null;
          setError(found ? null : `No plan called ${name}.`);
          setPlan(found);
          setSchedule(sched);
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


  const today = new Date().toISOString().slice(0, 10);
  const events = useMemo(() => {
    const kinds = LENSES[lens].kinds;
    return (schedule?.events ?? []).filter(
      (e) => (!kinds || kinds.includes(e.kind)) && (showPast || e.date >= today),
    );
  }, [schedule, lens, showPast, today]);

  const weeks = useMemo(() => {
    const by = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const list = by.get(e.week_label);
      if (list) list.push(e);
      else by.set(e.week_label, [e]);
    }
    return [...by.entries()];
  }, [events]);

  const behind = (schedule?.events ?? []).filter((e) => e.date < today).length;

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

          {schedule?.events?.length ? (
            <>
              <Text style={s.section}>What the unit does, and when</Text>

              {schedule.phases?.length ? (
                <View style={s.phases}>
                  {schedule.phases.map((p) => (
                    <View key={p.phase} style={s.phase}>
                      <Text style={s.phaseWeeks}>{p.weeks}w</Text>
                      <Text style={s.phaseName} numberOfLines={1}>
                        {p.phase}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.lenses}>
                {LENSES.map((l, i) => (
                  <TouchableOpacity
                    key={l.label}
                    style={[s.lens, i === lens ? s.lensOn : null]}
                    activeOpacity={0.7}
                    onPress={() => setLens(i)}
                  >
                    <Text style={[s.lensText, i === lens ? s.lensTextOn : null]}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {behind ? (
                <TouchableOpacity
                  style={s.pastToggle}
                  activeOpacity={0.7}
                  onPress={() => setShowPast((v) => !v)}
                >
                  <Ionicons
                    name={showPast ? 'eye-off-outline' : 'time-outline'}
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text style={s.pastText}>
                    {showPast ? 'Hide' : 'Show'} the {behind} already past
                  </Text>
                </TouchableOpacity>
              ) : null}

              {weeks.length === 0 ? (
                <Text style={s.none}>Nothing of that kind left on this plan.</Text>
              ) : null}

              {weeks.map(([week, rows]) => (
                <View key={week} style={s.week}>
                  <Text style={s.weekLabel}>{week}</Text>
                  {rows.map((e, i) => {
                    const k = KIND[e.kind];
                    const past = e.date < today;
                    return (
                      <View key={`${e.kind}-${e.date}-${i}`} style={[s.event, past ? s.eventPast : null]}>
                        <View style={[s.eventIcon, { backgroundColor: k.bg }]}>
                          <Ionicons name={k.icon} size={16} color={k.fg} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.eventTitle}>{e.title}</Text>
                          <Text style={s.eventMeta}>
                            {e.date}
                            {e.source === 'derived' ? ' · from the protocol' : ''}
                            {e.note ? ` · ${e.note}` : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </>
          ) : schedule && !schedule.propagation_plan ? (
            <Text style={s.none}>
              No propagation plan has been built for this one yet, so there is nothing dated for the
              unit to work to.
            </Text>
          ) : null}

          <Card title="What this plan asks for">
            <View style={s.bigRow}>
              <Text style={s.big}>{num(Number(schedule?.totals?.plants_to_stick ?? 0))}</Text>
              <Text style={s.bigUnit}>plants to raise</Text>
            </View>
            <Row label="Weeks of planting" value={String(plan.weeks_covered ?? 0)} />
            {plan.new_beds_required ? (
              <Row label="New beds needed" value={String(plan.new_beds_required)} />
            ) : null}
          </Card>

          {schedule?.motherstock?.length ? (
            schedule.motherstock.map((b) => (
              <Card key={b.name} title="Motherstock">
                <View style={s.bigRow}>
                  <Text style={s.big}>{num(b.cuttings_per_week)}</Text>
                  <Text style={s.bigUnit}>cuttings a week at full capacity</Text>
                </View>
                <Row label="Line" value={`${b.name} · ${b.batch_status ?? '—'}`} />
                <Row label="Mother plants" value={num(b.mother_plants)} />
                {b.build_up_cycles ? (
                  <Row
                    label="Multiplication"
                    value={`${b.build_up_cycles} cycle(s) × ${b.multiplication_factor || 1}`}
                  />
                ) : null}
                {b.cutting_from ? <Row label="Cutting from" value={b.cutting_from} /> : null}
                {b.productive_weeks ? (
                  <Row label="Cutting weeks left" value={String(b.productive_weeks)} />
                ) : null}
                {b.renewal_tc_order_date ? (
                  <Row label="Order renewal TC by" value={b.renewal_tc_order_date} />
                ) : null}
                {b.expiry_date ? <Row label="Line expires" value={b.expiry_date} /> : null}
                {b.schedule_warning ? (
                  <Text style={s.warn}>{b.schedule_warning}</Text>
                ) : null}
              </Card>
            ))
          ) : schedule?.motherstock_reason ? (
            <Card title="Motherstock">
              {/* Bought-in is a legitimate answer, not a missing record. */}
              <Text style={s.none}>
                No motherstock line for this variety — its plants are bought in rather than cut
                here.
              </Text>
            </Card>
          ) : null}

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
  warn: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  section: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.md,
  },
  phases: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  phase: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
  },
  phaseWeeks: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  phaseName: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, maxWidth: 140 },
  lenses: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  lens: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  lensOn: { backgroundColor: colors.primary },
  lensText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  lensTextOn: { color: colors.textOnPrimary },
  pastToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  pastText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  week: { marginBottom: spacing.lg },
  weekLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  eventPast: { opacity: 0.55 },
  eventIcon: { width: 32, height: 32, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  eventMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
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
