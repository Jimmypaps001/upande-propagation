import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import { successHaptic } from '@/src/services/feedback';
import {
  protocolDetail,
  saveProtocol,
  submitProtocolForApproval,
  type ProtocolDetail,
} from '@/src/services/planning-api';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * The protocol sheet, in the order somebody reads it.
 *
 * It used to be two flat lists -- thirty editable fields and twenty-seven
 * derived ones, alphabetical by accident of the server's dict order. Nothing
 * told you that weeks_on_tray and hardening_weeks were the same question asked
 * twice, or which of the figures were consequences rather than choices. These
 * are the same fields, grouped the way the sheet is actually argued about.
 */

/** Editable fields, by what they decide. Anything unlisted still shows, last. */
const GROUPS: { title: string; blurb: string; icon: IconName; fields: string[] }[] = [
  {
    title: 'Density and space',
    blurb: 'How much ground a plant gets',
    icon: 'grid-outline',
    fields: ['plants_per_sqm_net', 'plants_per_bed', 'beds_per_block', 'min_planting_area_sqm',
             'plants_per_pot', 'pots_per_sqm', 'plants_per_sqm_bench'],
  },
  {
    title: 'Timing',
    blurb: 'How long each wait is',
    icon: 'time-outline',
    fields: ['sticking_to_planting_weeks', 'weeks_on_tray', 'weeks_on_pot', 'weeks_to_pinch',
             'flush_interval_weeks', 'hardening_weeks', 'ramp_weeks', 'weeks_to_max_pc',
             'weeks_to_max_production', 'supplier_lead_weeks', 'cycle_time_weeks',
             'motherstock_life_weeks'],
  },
  {
    title: 'Multiplication',
    blurb: 'What one mother plant gives',
    icon: 'git-branch-outline',
    fields: ['cuttings_per_plant_per_week', 'max_multiplication_cycles',
             'multiplication_factor_per_cycle'],
  },
  {
    title: 'Losses',
    blurb: 'What does not make it, at each step',
    icon: 'trending-down-outline',
    fields: ['rooting_success_pct', 'field_establishment_pct', 'cutting_reject_pct'],
  },
  {
    title: 'Yield and price',
    blurb: 'What it is expected to return',
    icon: 'cash-outline',
    fields: ['stated_yield_stems_per_ha', 'ready_cutting_price'],
  },
  {
    title: 'How establishment is counted',
    blurb: 'Which waits count as establishment, and so how long a round is',
    icon: 'options-outline',
    fields: ['establishment_includes_hardening', 'establishment_includes_ramp', 'ramp_profile',
             'climate_note'],
  },
];

/** The handful worth seeing before anything else. */
const HEADLINE: { key: string; label: string; suffix?: string }[] = [
  { key: 'total_weeks_in_ground', label: 'Weeks in ground' },
  { key: 'plants_per_ha', label: 'Plants per ha' },
  { key: 'total_stems_per_plant_life', label: 'Stems per plant' },
  { key: 'order_to_first_harvest_weeks', label: 'Order to harvest', suffix: 'wk' },
];

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function Protocol() {
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const toast = useToast();
  const { plan } = useLocalSearchParams<{ plan?: string }>();

  const [detail, setDetail] = useState<ProtocolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  const load = useCallback(
    () =>
      (async () => {
        try {
          const d = await protocolDetail(plan ? { plan } : {});
          setError(null);
          setDetail(d);
          setEdits({});
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the protocol.');
        }
      })(),
    [plan],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // An Active version is never edited in place, so changing one needs a reason:
  // the server amends it into a fresh Draft and records why.
  const needsReason = !!detail && !detail.editable;
  const changed = useMemo(() => {
    if (!detail) return {} as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, typed] of Object.entries(edits)) {
      const was = detail.fields[k];
      if (typed === '') continue;
      const next = typeof was === 'number' ? Number(typed) : typed;
      if (typeof next === 'number' && Number.isNaN(next)) continue;
      if (String(next) !== String(was ?? '')) out[k] = next;
    }
    return out;
  }, [edits, detail]);

  const changeCount = Object.keys(changed).length;
  const canSave = changeCount > 0 && (!needsReason || !!reason.trim()) && !busy;

  const groups = useMemo(() => {
    if (!detail) return [];
    const known = new Set(GROUPS.flatMap((g) => g.fields));
    const rest = Object.keys(detail.fields).filter((k) => !known.has(k));
    const built = GROUPS.map((g) => ({
      ...g,
      fields: g.fields.filter((f) => f in detail.fields),
    })).filter((g) => g.fields.length);
    // Nothing the server sends is hidden just because this file has not heard
    // of it: a field added upstream lands here rather than vanishing.
    if (rest.length) {
      built.push({ title: 'Everything else', blurb: 'Not yet grouped',
                   icon: 'ellipsis-horizontal-outline' as IconName, fields: rest });
    }
    return built;
  }, [detail]);

  const save = async () => {
    if (!detail || !canSave) return;
    setBusy(true);
    try {
      const res = await saveProtocol({
        version: detail.version,
        changes: changed,
        changeReason: reason.trim() || null,
      });
      setDetail(res.detail);
      setEdits({});
      setReason('');
      setEditing(false);
      successHaptic();
      toast.showSuccess(
        res.amended
          ? `Amended into ${res.version} — a new draft, so existing cycles keep their figures.`
          : `Saved ${res.version}.`,
      );
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : 'Could not save it.');
    } finally {
      setBusy(false);
    }
  };

  const sendForApproval = async () => {
    if (!detail?.crop_protocol) return;
    setBusy(true);
    try {
      const state = await submitProtocolForApproval(detail.crop_protocol);
      successHaptic();
      toast.showSuccess(`Sent for approval — now ${state}.`);
      await load();
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : 'Could not send it.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Protocol"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={detail === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {detail ? (
        <>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.variety} numberOfLines={2}>{detail.variety ?? '—'}</Text>
              <Text style={s.sub} numberOfLines={1}>
                {detail.farm ?? '—'} · v{detail.version_no ?? '?'}
              </Text>
            </View>
            <Pill
              value={detail.status ?? '—'}
              tone={detail.is_current ? 'success' : detail.status === 'Draft' ? 'warn' : 'neutral'}
            />
          </View>
          <View style={s.sourceRow}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
            <Text style={s.source}>{sourceLine(detail)}</Text>
          </View>

          <View style={s.stats}>
            {HEADLINE.filter((h) => detail.derived[h.key] !== undefined).map((h) => (
              <View key={h.key} style={s.stat}>
                <Text style={s.statValue}>
                  {fmt(detail.derived[h.key])}
                  {h.suffix ? <Text style={s.statSuffix}> {h.suffix}</Text> : null}
                </Text>
                <Text style={s.statLabel}>{h.label}</Text>
              </View>
            ))}
          </View>

          {detail.route_summary ? (
            <Card title="The route">
              <View style={s.chain}>
                {detail.route_summary.split('→').map((step, i, all) => (
                  <View key={`${step}-${i}`} style={s.chainItem}>
                    <View style={[s.chainDot, { backgroundColor: chainColour(i, all.length) }]} />
                    <Text style={s.chainText}>{step.trim()}</Text>
                    {i < all.length - 1 ? (
                      <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                    ) : null}
                  </View>
                ))}
              </View>
              <Text style={s.note}>
                {detail.has_motherstock
                  ? 'Raised from motherstock on this farm.'
                  : 'Raised from a bought-in pool, with no motherstock.'}
                {detail.bought_at ? ` Bought in at ${detail.bought_at}.` : ''}
              </Text>
            </Card>
          ) : null}

          {detail.grades.length ? (
            <Card title="Grades">
              <View style={s.gradeBar}>
                {detail.grades.map((g, i) => (
                  <View
                    key={g.grade}
                    style={{
                      width: `${g.pct}%`,
                      height: 10,
                      backgroundColor: gradeColour(i),
                    }}
                  />
                ))}
              </View>
              {detail.grades.map((g, i) => (
                <View key={g.grade} style={s.gradeRow}>
                  <View style={[s.swatch, { backgroundColor: gradeColour(i) }]} />
                  <Text style={s.gradeName}>{g.grade}</Text>
                  <Text style={s.gradePct}>{g.pct}%</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {groups.map((g) => {
            const isOpen = open === g.title;
            return (
              <View key={g.title} style={s.group}>
                <TouchableOpacity
                  style={s.groupHead}
                  activeOpacity={0.7}
                  onPress={() => setOpen(isOpen ? null : g.title)}
                >
                  <View style={s.groupIcon}>
                    <Ionicons name={g.icon} size={17} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.groupTitle}>{g.title}</Text>
                    <Text style={s.groupBlurb}>{g.blurb}</Text>
                  </View>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={17}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>

                {isOpen ? (
                  <View style={s.groupBody}>
                    {g.fields.map((f) =>
                      editing ? (
                        <LabeledInput
                          key={f}
                          label={humanise(f)}
                          value={edits[f] ?? String(detail.fields[f] ?? '')}
                          onChangeText={(t) => setEdits((e) => ({ ...e, [f]: t }))}
                          keyboardType={typeof detail.fields[f] === 'number' ? 'numeric' : 'default'}
                          helperText={
                            edits[f] !== undefined &&
                            String(edits[f]) !== String(detail.fields[f] ?? '')
                              ? `was ${String(detail.fields[f] ?? '—')}`
                              : undefined
                          }
                        />
                      ) : (
                        <View key={f} style={s.row}>
                          <Text style={s.rowLabel}>{humanise(f)}</Text>
                          <Text style={s.rowValue}>{fmt(detail.fields[f])}</Text>
                        </View>
                      ),
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}

          <Card title="What it works out to" collapsible defaultOpen={false}>
            {Object.entries(detail.derived).map(([k, v]) => (
              <View key={k} style={s.row}>
                <Text style={s.rowLabel}>{humanise(k)}</Text>
                <Text style={s.rowValue}>{fmt(v)}</Text>
              </View>
            ))}
          </Card>

          {editing ? (
            <Card title={changeCount ? `${changeCount} change${changeCount === 1 ? '' : 's'}` : 'No changes yet'}>
              {needsReason ? (
                <Text style={s.warn}>
                  {detail.version} is {detail.status}. Editing it would rewrite the figures
                  existing cycles ran under, so saving creates a new draft — which needs a reason.
                </Text>
              ) : null}
              <LabeledInput
                label={needsReason ? 'Reason for the change (required)' : 'Reason for the change'}
                value={reason}
                onChangeText={setReason}
                placeholder="What changed, and why"
                multiline
              />
              <Button
                label={busy ? 'Saving…' : 'Save'}
                onPress={save}
                disabled={!canSave}
                loading={busy}
                style={{ marginTop: spacing.md }}
              />
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => {
                  setEditing(false);
                  setEdits({});
                  setReason('');
                }}
                style={{ marginTop: spacing.sm }}
              />
            </Card>
          ) : (
            <Button
              label="Revise this protocol"
              variant="outline"
              iconLeft="create-outline"
              onPress={() => {
                setEditing(true);
                if (!open) setOpen(groups[0]?.title ?? null);
              }}
              style={{ marginTop: spacing.md }}
            />
          )}

          <Button
            label={busy ? 'Sending…' : 'Send for approval'}
            onPress={sendForApproval}
            disabled={busy || !detail.crop_protocol}
            style={{ marginTop: spacing.md }}
          />
          <Text style={s.foot}>
            An Agriculture Manager approves it in the desk. Approving is what writes a new
            version, and plans already built keep the version they were built on.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

/** Which of the three routes chose this version — they differ routinely. */
function sourceLine(d: ProtocolDetail): string {
  if (d.source === 'plan' && d.for_plan) return `The version ${d.for_plan} was built on.`;
  if (d.source === 'picked') return 'The version you asked for.';
  return 'The version in force for this variety.';
}

/** The chain walks from raw material to plants, so it walks the stage palette. */
function chainColour(i: number, total: number): string {
  const ramp = [colors.root, colors.mist, colors.leaf, colors.bloom];
  if (total <= 1) return ramp[2];
  return ramp[Math.min(ramp.length - 1, Math.round((i / (total - 1)) * (ramp.length - 1)))];
}

const GRADE_RAMP = [colors.leaf, colors.mist, colors.bloom, colors.root];
const gradeColour = (i: number): string => GRADE_RAMP[i % GRADE_RAMP.length];

function humanise(k: string): string {
  const t = k.replace(/_pct$/, ' %').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fmt(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  variety: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.lg },
  source: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  statValue: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  statSuffix: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  statLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  chain: { gap: 2 },
  chainItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  chainDot: { width: 9, height: 9, borderRadius: borderRadius.full },
  chainText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.md, lineHeight: 16 },

  gradeBar: { flexDirection: 'row', height: 10, borderRadius: borderRadius.full, overflow: 'hidden', marginBottom: spacing.md },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  swatch: { width: 10, height: 10, borderRadius: borderRadius.full },
  gradeName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  gradePct: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },

  group: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  groupIcon: {
    width: 34, height: 34, borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  groupTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  groupBlurb: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  groupBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },

  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  rowLabel: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  rowValue: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  warn: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.warning, marginBottom: spacing.md, lineHeight: 17 },
  foot: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },
});
