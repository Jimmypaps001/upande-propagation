import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import {
  EVENTS,
  listPlans,
  planDetail,
  type PlanDetail,
  type PlanSummary,
} from '@/src/services/propagation-api';
import { useAuthStore } from '@/src/stores/authStore';
import { useUnitStore } from '@/src/stores/unitStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Everywhere the app can go, on the screen it opens on.
 *
 * The sidebar has all of this too, but a menu nobody opens is a menu nobody
 * knows about -- and the two halves of this app answer to different server
 * apps, so what is in it is not guessable from the recording screen alone.
 */
const SECTIONS: {
  href: Href;
  label: string;
  blurb: string;
  icon: IconName;
  fg: string;
  bg: string;
}[] = [
  { href: '/unit', label: 'Unit', blurb: 'Space and what is on it',
    icon: 'business-outline', fg: colors.leaf, bg: colors.leafSoft },
  { href: '/batches', label: 'Batches', blurb: 'By stage or variety',
    icon: 'layers-outline', fg: colors.mist, bg: colors.mistSoft },
  { href: '/arrival', label: 'Arrivals', blurb: 'What turned up',
    icon: 'cube-outline', fg: colors.root, bg: colors.rootSoft },
  { href: '/plans', label: 'Plans', blurb: 'Varieties and seasons',
    icon: 'calendar-outline', fg: colors.bloom, bg: colors.bloomSoft },
  { href: '/protocol', label: 'Protocol', blurb: 'What to do, and revise it',
    icon: 'document-text-outline', fg: colors.mist, bg: colors.mistSoft },
  { href: '/motherstock', label: 'Motherstock', blurb: 'The line behind the plan',
    icon: 'git-branch-outline', fg: colors.leaf, bg: colors.leafSoft },
];

export default function Home() {
  const router = useRouter();
  // The drawer lives one layout up; this is how a tab screen reaches it.
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const unit = useUnitStore((s) => s.unit);
  const plan = useUnitStore((s) => s.plan);
  const setPlan = useUnitStore((s) => s.setPlan);
  const fullName = useAuthStore((s) => s.fullName);

  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Starts the load and returns; every setState lands in a promise
   * continuation. Nothing is set while the effect body is still running,
   * which is what cascades a second render before the first has painted.
   */
  const load = useCallback(
    () =>
      (async () => {
        try {
          const rows = await listPlans();
          setError(null);
          setPlans(rows);
          // Open on the plan last worked to, or the newest one there is.
          const chosen = (plan && rows.find((r) => r.name === plan)?.name) || rows[0]?.name || null;
          if (chosen && chosen !== plan) await setPlan(chosen);
          setDetail(chosen ? await planDetail(chosen) : null);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the plan.');
        }
      })(),
    [plan, setPlan],
  );

  // Once on mount; pull down to see it again. load() is deliberately left out
  // of the deps: it closes over the stored plan, and re-running on every change
  // to that would reload the screen each time somebody picked one.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const a = detail?.actuals;
  // What the unit has not reported on yet: a consignment whose week has been
  // and gone with nothing against it. This is the list somebody works from.
  const due = (detail?.consignments ?? []).filter(
    (c) => c.state === 'Missed' || c.state === 'Not Reported',
  );

  return (
    <Screen
      title={unit ?? 'Propagation'}
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      rightIcon="settings-outline"
      onPressRight={() => router.push('/settings')}
      loading={plans === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <Text style={s.greeting}>{greeting()}{fullName ? `, ${firstName(fullName)}` : ''}</Text>
      <Text style={s.today}>{longDate()}</Text>

      {detail?.propagation_plan ? (
        <TouchableOpacity
          style={s.plan}
          onPress={() => router.push('/plans')}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.planLabel}>Working to</Text>
            <Text style={s.planName} numberOfLines={1}>{detail.variety}</Text>
            <Text style={s.planSub} numberOfLines={1}>
              {detail.farm} · {detail.propagation_plan}
            </Text>
          </View>
          {detail.status ? <Pill value={detail.status} /> : null}
        </TouchableOpacity>
      ) : (
        <Text style={s.none}>No propagation plan on this server yet.</Text>
      )}

      <Text style={s.sectionLabel}>Record something</Text>
      <View style={s.grid}>
        {EVENTS.map((e) => (
          <TouchableOpacity
            key={e.key}
            style={s.tile}
            activeOpacity={0.7}
            disabled={!detail?.propagation_plan}
            onPress={() => router.push({ pathname: '/record/[event]', params: { event: e.key } })}
          >
            <Ionicons
              name={iconFor(e.key)}
              size={22}
              color={detail?.propagation_plan ? colors.text : colors.textMuted}
            />
            <Text style={[s.tileTitle, !detail?.propagation_plan ? { color: colors.textMuted } : null]}>
              {e.title}
            </Text>
            <Text style={s.tileBlurb}>{e.blurb}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionLabel}>Everything else</Text>
      <View style={s.list}>
        {SECTIONS.map((x) => (
          <TouchableOpacity
            key={String(x.href)}
            style={s.navRow}
            activeOpacity={0.7}
            onPress={() => router.push(x.href)}
          >
            <View style={[s.navIcon, { backgroundColor: x.bg }]}>
              <Ionicons name={x.icon} size={19} color={x.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.navLabel}>{x.label}</Text>
              <Text style={s.navBlurb}>{x.blurb}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      {a ? (
        <Card title="Recorded so far">
          <Stat label="Reported up to" value={a.reported_to ?? 'nothing yet'} />
          <Stat label="Tissue culture in" value={num(a.tc_received)} />
          <Stat label="Roots drawn" value={num(a.roots_withdrawn)} />
          <Stat label="Plants to the farm" value={num(a.plants_to_farm)} />
          {a.plants_lost ? <Stat label="Lost" value={num(a.plants_lost)} /> : null}
          {a.carried_short ? <Stat label="Carried short" value={num(a.carried_short)} warn /> : null}
          <Text style={s.basis}>{a.survival_basis ?? ''}</Text>
        </Card>
      ) : null}

      {due.length ? (
        <Card title={`Not reported (${due.length})`}>
          {due.slice(0, 12).map((c, i) => (
            <View key={`${c.week}-${c.form}-${i}`} style={s.dueRow}>
              <Text style={s.dueWeek}>{c.week_iso || c.week}</Text>
              <Text style={s.dueForm} numberOfLines={1}>
                {c.form} · {c.source ?? '—'}
              </Text>
              <Text style={s.dueQty}>{num(c.units)}</Text>
            </View>
          ))}
          {due.length > 12 ? <Text style={s.more}>…and {due.length - 12} more</Text> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const firstName = (full: string): string => full.trim().split(/\s+/)[0];

function longDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function iconFor(key: string): IconName {
  if (key === 'TC Received') return 'cube-outline';
  if (key === 'Roots Withdrawn') return 'snow-outline';
  if (key === 'Plants To Farm') return 'leaf-outline';
  return 'alert-circle-outline';
}

const num = (n: number | undefined): string => (n ? n.toLocaleString() : '0');

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={s.statRow}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, warn ? { color: colors.error } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  greeting: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  today: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.lg,
  },

  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  planLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  planName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  planSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  none: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  tileTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  tileBlurb: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },

  list: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  navBlurb: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: spacing.md },
  statLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  statValue: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  basis: { marginTop: spacing.sm, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  dueWeek: { width: 76, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  dueForm: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  dueQty: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  more: { marginTop: spacing.xs, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
