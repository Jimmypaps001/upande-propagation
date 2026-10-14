import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import {
  EVENTS,
  planDetail,
  recordActual,
  type Consignment,
  type EventKey,
  type PlanDetail,
} from '@/src/services/propagation-api';
import { useUnitStore } from '@/src/stores/unitStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/** Today, as the server wants it. */
const todayISO = (): string => new Date().toISOString().slice(0, 10);

export default function RecordEvent() {
  const router = useRouter();
  const toast = useToast();
  const { event } = useLocalSearchParams<{ event: EventKey }>();
  const plan = useUnitStore((s) => s.plan);
  const unit = useUnitStore((s) => s.unit);

  const spec = useMemo(() => EVENTS.find((e) => e.key === event) ?? EVENTS[0], [event]);

  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [qty, setQty] = useState('');
  const [on, setOn] = useState(todayISO());
  const [against, setAgainst] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!plan) return;
    planDetail(plan)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the plan.'));
  }, [plan]);

  // Only the weeks this event could be answering. A consignment of roots is
  // not an answer to a week of tissue culture.
  const choices: Consignment[] = useMemo(() => {
    const rows = detail?.consignments ?? [];
    if (spec.key === 'TC Received') return rows.filter((c) => c.form === 'Tissue Culture');
    if (spec.key === 'Roots Withdrawn') return rows.filter((c) => c.form === 'Roots');
    return [];
  }, [detail, spec.key]);

  const weeks = detail?.weeks ?? [];
  const n = parseInt(qty.replace(/[^0-9]/g, ''), 10) || 0;
  const needsReason = spec.key === 'Loss';
  const canSave = !!plan && n > 0 && !!on && (!needsReason || !!reason.trim()) && !busy;

  const save = async () => {
    if (!plan || !canSave) return;
    setBusy(true);
    try {
      const res = await recordActual({
        plan,
        event: spec.key,
        on,
        againstWeek: against,
        units: spec.counts === 'units' ? n : 0,
        plants: spec.counts === 'plants' ? n : 0,
        reference: reference.trim() || null,
        reason: reason.trim() || null,
        warehouse: unit,
      });
      toast.showSuccess(`Recorded ${res.name}.`);
      router.back();
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : 'Could not record it.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={spec.title} leftIcon="arrow-back" onPressLeft={() => router.back()} error={error}>
      <Text style={s.blurb}>{spec.blurb}.</Text>

      <LabeledInput
        label={spec.counts === 'units' ? 'How many units' : 'How many plants'}
        value={qty}
        onChangeText={setQty}
        keyboardType="number-pad"
        placeholder="0"
      />
      <LabeledInput label="On" value={on} onChangeText={setOn} placeholder="YYYY-MM-DD" />

      {choices.length ? (
        <View style={s.block}>
          <Text style={s.label}>Against which consignment</Text>
          <Text style={s.hint}>Leave it unpicked and the server matches it by date.</Text>
          <View style={s.chips}>
            {choices.slice(0, 16).map((c, i) => {
              const on_ = against === c.week;
              return (
                <TouchableOpacity
                  key={`${c.week}-${i}`}
                  style={[s.chip, on_ && s.chipOn]}
                  onPress={() => setAgainst(on_ ? null : c.week)}
                >
                  <Text style={[s.chipText, on_ && s.chipTextOn]}>
                    {c.week_iso || c.week} · {c.units.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {spec.key === 'Plants To Farm' && weeks.length ? (
        <View style={s.block}>
          <Text style={s.label}>For which planting week</Text>
          <View style={s.chips}>
            {weeks.slice(0, 16).map((w) => {
              const on_ = against === w.deliver_on;
              return (
                <TouchableOpacity
                  key={w.deliver_on}
                  style={[s.chip, on_ && s.chipOn]}
                  onPress={() => setAgainst(on_ ? null : w.deliver_on)}
                >
                  <Text style={[s.chipText, on_ && s.chipTextOn]}>
                    {w.label} · {w.promised.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {needsReason ? (
        <LabeledInput
          label="What was it lost to"
          value={reason}
          onChangeText={setReason}
          placeholder="Hardening mortality"
        />
      ) : (
        <LabeledInput
          label="Consignment or note"
          value={reference}
          onChangeText={setReference}
          placeholder="batch, lift, delivery note"
        />
      )}

      <Button
        label={busy ? 'Recording…' : 'Record it'}
        onPress={save}
        disabled={!canSave}
        loading={busy}
        style={{ marginTop: spacing.lg }}
      />
      <Text style={s.foot}>
        This is written down as a submitted record. To correct it, cancel that record rather than
        typing a different number here.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  blurb: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  block: { marginTop: spacing.md },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  chipTextOn: { color: colors.textOnPrimary },
  foot: {
    marginTop: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
