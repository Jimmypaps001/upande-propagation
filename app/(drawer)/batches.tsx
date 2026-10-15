import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { PickerField, type PickerOption } from '@/src/components/PickerField';
import { useToast } from '@/src/components/Toast';
import { lightHaptic, successHaptic } from '@/src/services/feedback';
import { listBatches, type BatchRow } from '@/src/services/batches-api';
import {
  consignments,
  moveBatches,
  recordMortality,
  warehouses,
} from '@/src/services/operations-api';
import { userMessage } from '@/src/services/user-message';
import { accentFor, borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const STAGES = [
  'Cutting',
  'Sticking',
  'Callusing',
  'Rooting',
  'Nursery',
  'Hardening',
  'Ready for Dispatch',
];

/**
 * What is on the bench, and the two things anyone does to it.
 *
 * A unit does not move one batch. Six trays that finished callusing together go
 * to rooting together, and the losses are counted tray by tray on the same walk
 * down the row. So the list selects, and the actions take the selection: that
 * is one trip to the server for the whole bench instead of six, and a partial
 * result comes back saying which ones would not go.
 *
 * Filtering happens here rather than on the server. The server caps the list at
 * a hundred, which is a bench, and a filter that costs a round trip over polytunnel
 * signal is a filter nobody uses twice.
 */
export default function Batches() {
  const router = useRouter();
  const toast = useToast();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const { variety: fromScan } = useLocalSearchParams<{ variety?: string }>();

  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [variety, setVariety] = useState<string | null>(fromScan ? String(fromScan) : null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'move' | 'losses' | 'bench' | null>(null);
  const [busy, setBusy] = useState(false);

  // move
  const [moveStage, setMoveStage] = useState<string | null>(null);
  const [moveUnit, setMoveUnit] = useState<string | null>(null);
  // losses
  const [dead, setDead] = useState('');
  const [note, setNote] = useState('');
  // bench
  const [consignment, setConsignment] = useState<string | null>(null);

  const load = useCallback(
    () =>
      (async () => {
        try {
          setError(null);
          setRows(await listBatches({}));
        } catch (e) {
          setError(userMessage(e, 'Could not load the batches.'));
        }
      })(),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const varietyOptions = useMemo(() => {
    const by = new Map<string, { label: string; count: number }>();
    for (const r of rows ?? []) {
      if (!r.variety) continue;
      const cur = by.get(r.variety);
      if (cur) cur.count += 1;
      else by.set(r.variety, { label: r.variety_name ?? r.variety, count: 1 });
    }
    return [...by.entries()]
      .map(([value, v]) => ({
        value,
        label: v.label,
        hint: `${v.count} batch${v.count === 1 ? '' : 'es'}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => (!stage || r.current_stage === stage) && (!variety || r.variety === variety),
      ),
    [rows, stage, variety],
  );

  const chosen = [...picked];
  const selecting = chosen.length > 0;

  const toggle = (name: string) => {
    lightHaptic();
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const closeSheet = () => {
    setSheet(null);
    setMoveStage(null);
    setDead('');
    setNote('');
  };

  const doMove = async () => {
    if (busy || (!moveStage && !moveUnit)) return;
    setBusy(true);
    try {
      const res = await moveBatches({
        batches: chosen,
        stage: moveStage ?? undefined,
        unit: moveUnit ?? undefined,
      });
      if (res.moved.length) successHaptic();
      const where = moveStage ?? moveUnit ?? '';
      if (res.refused.length === 0) {
        toast.showSuccess(`${res.moved.length} moved to ${where}.`);
      } else {
        toast.notify(
          `${res.moved.length} moved, ${res.refused.length} would not: ${res.refused[0].reason}`,
          res.moved.length ? 'info' : 'error',
          6000,
        );
      }
      setPicked(new Set());
      closeSheet();
      await load();
    } catch (e) {
      toast.showError(userMessage(e, 'Nothing was moved.'));
    } finally {
      setBusy(false);
    }
  };

  const doLosses = async () => {
    const n = Number(dead.replace(/[^0-9]/g, '')) || 0;
    if (busy || n <= 0) {
      toast.showError('How many were lost?');
      return;
    }
    setBusy(true);
    try {
      const res = await recordMortality({
        batches: chosen,
        qty: n,
        observations: note.trim() || undefined,
      });
      if (res.written.length) successHaptic();
      if (res.refused.length === 0) {
        toast.showSuccess(
          `${n} lost, recorded against ${res.written.length} batch${res.written.length === 1 ? '' : 'es'}.`,
        );
      } else {
        toast.notify(
          `${res.written.length} written, ${res.refused.length} would not: ${res.refused[0].reason}`,
          res.written.length ? 'info' : 'error',
          6000,
        );
      }
      setPicked(new Set());
      closeSheet();
      await load();
    } catch (e) {
      toast.showError(userMessage(e, 'Nothing was recorded.'));
    } finally {
      setBusy(false);
    }
  };

  const loadUnits = useCallback(
    async (): Promise<PickerOption[]> =>
      (await warehouses()).map((r) => ({
        value: r.name,
        label: r.name,
        hint: r.is_unit ? 'Propagation unit' : r.company,
        favourite: !!r.is_unit,
      })),
    [],
  );

  const loadBenchable = useCallback(
    async (): Promise<PickerOption[]> =>
      (await consignments({ status: 'Received' }))
        .filter((c) => c.qty_unbatched > 0)
        .map((c) => ({
          value: c.name,
          label: `${c.consignment} — ${c.variety_name ?? c.variety ?? ''}`,
          hint: `${c.qty_unbatched.toLocaleString()} still to bench · ${c.form ?? ''}`,
        })),
    [],
  );

  const totals = useMemo(
    () => ({
      plants: shown.reduce((n, b) => n + (b.total_survived || 0), 0),
      ready: shown.reduce((n, b) => n + (b.available_to_dispatch || 0), 0),
    }),
    [shown],
  );

  return (
    <Screen
      title={selecting ? `${chosen.length} selected` : 'Batches'}
      leftIcon={selecting ? 'close' : 'menu'}
      onPressLeft={() => (selecting ? setPicked(new Set()) : drawer.openDrawer())}
      rightIcon="qr-code-outline"
      onPressRight={() => router.push('/scan')}
      loading={rows === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <View style={s.summary}>
        <Text style={s.summaryBig}>{num(totals.plants)}</Text>
        <Text style={s.summaryLabel}>
          plants standing in {shown.length} batch{shown.length === 1 ? '' : 'es'}
          {totals.ready ? ` · ${num(totals.ready)} ready to leave` : ''}
        </Text>
      </View>

      <Button
        label="Bench a delivery"
        variant="outline"
        iconLeft="cube-outline"
        onPress={() => setSheet('bench')}
        style={{ marginBottom: spacing.lg }}
      />

      <PickerField
        label="Variety"
        value={variety}
        placeholder="Every variety"
        load={async () => [{ value: '', label: 'Every variety' }, ...varietyOptions]}
        onChange={(v) => setVariety(v || null)}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filters}
      >
        <Chip label="All stages" on={!stage} onPress={() => setStage(null)} />
        {STAGES.map((st) => {
          const n = (rows ?? []).filter(
            (r) => r.current_stage === st && (!variety || r.variety === variety),
          ).length;
          if (!n) return null;
          return (
            <Chip key={st} label={`${st} ${n}`} on={stage === st} onPress={() => setStage(st)} />
          );
        })}
      </ScrollView>

      {shown.length === 0 ? (
        <Text style={s.none}>
          Nothing on the bench{stage ? ` at ${stage}` : ''}
          {variety ? ' for that variety' : ''}.
        </Text>
      ) : null}

      {shown.map((b) => {
        const a = accentFor(b.current_stage);
        const on = picked.has(b.name);
        return (
          <TouchableOpacity
            key={b.name}
            style={[s.card, on ? s.cardOn : null]}
            activeOpacity={0.7}
            onLongPress={() => toggle(b.name)}
            onPress={() =>
              selecting
                ? toggle(b.name)
                : router.push({ pathname: '/batch/[name]', params: { name: b.name } })
            }
          >
            <View style={s.cardTop}>
              <TouchableOpacity
                onPress={() => toggle(b.name)}
                hitSlop={10}
                style={s.tick}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={on ? colors.leaf : colors.border}
                />
              </TouchableOpacity>
              <Text style={s.variety} numberOfLines={1}>
                {b.variety_name ?? b.variety ?? '—'}
              </Text>
              <View style={[s.stage, { backgroundColor: a.bg }]}>
                <Text style={[s.stageText, { color: a.fg }]} numberOfLines={1}>
                  {b.current_stage ?? '—'}
                </Text>
              </View>
            </View>

            <Text style={s.name}>{b.name}</Text>

            <View style={s.bar}>
              <View
                style={[
                  s.barFill,
                  {
                    width: `${pct(b)}%`,
                    backgroundColor: a.fg,
                  },
                ]}
              />
            </View>

            <View style={s.figures}>
              <Figure label="Surviving" value={num(b.total_survived)} />
              <Figure label="Ready" value={num(b.available_to_dispatch)} />
              {b.total_mortality ? (
                <Figure label="Lost" value={num(b.total_mortality)} tone={colors.error} />
              ) : null}
              {b.expected_delivery ? (
                <Figure
                  label={b.expected_delivery.overdue_in_stage ? 'Overdue' : 'Due out'}
                  value={
                    b.expected_delivery.overdue_in_stage
                      ? `${b.expected_delivery.overdue_in_stage}d`
                      : `${b.expected_delivery.days_out}d`
                  }
                  tone={b.expected_delivery.overdue_in_stage ? colors.warning : undefined}
                />
              ) : null}
            </View>
            {b.propagation_unit ? (
              <Text style={s.unit} numberOfLines={1}>
                {b.propagation_unit}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}

      {/* --------------------------------------------------------- the bar */}
      {selecting ? (
        <View style={s.actions}>
          <TouchableOpacity style={s.action} activeOpacity={0.8} onPress={() => setSheet('move')}>
            <Ionicons name="arrow-forward-circle-outline" size={20} color={colors.textOnPrimary} />
            <Text style={s.actionText}>Move</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} activeOpacity={0.8} onPress={() => setSheet('losses')}>
            <Ionicons name="trending-down-outline" size={20} color={colors.textOnPrimary} />
            <Text style={s.actionText}>Losses</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ------------------------------------------------------- the sheets */}
      <Sheet
        open={sheet === 'move'}
        title={`Move ${chosen.length} batch${chosen.length === 1 ? '' : 'es'}`}
        onClose={closeSheet}
      >
        <Text style={s.sheetNote}>
          Forward only. A batch already at or past the stage you pick is left where it is, and comes
          back saying so.
        </Text>
        <View style={s.filters}>
          {[...STAGES, 'Completed'].map((st) => (
            <Chip key={st} label={st} on={moveStage === st} onPress={() => setMoveStage(st)} />
          ))}
        </View>
        <PickerField
          label="And into"
          value={moveUnit}
          placeholder="Leave where they are"
          load={loadUnits}
          onChange={setMoveUnit}
          helperText="Use this when the move is onto another trough or bench."
        />
        <Button
          label={moveStage ? `Move to ${moveStage}` : 'Move'}
          onPress={doMove}
          loading={busy}
          disabled={!moveStage && !moveUnit}
        />
      </Sheet>

      <Sheet
        open={sheet === 'losses'}
        title={`Losses on ${chosen.length} batch${chosen.length === 1 ? '' : 'es'}`}
        onClose={closeSheet}
      >
        <Text style={s.sheetNote}>
          The number is per batch, not split between them: you counted the dead tray by tray and a
          figure the server divided is a figure nobody counted.
        </Text>
        <LabeledInput
          label="Lost from each"
          value={dead}
          onChangeText={setDead}
          keyboardType="number-pad"
          placeholder="0"
        />
        <LabeledInput
          label="What you saw"
          value={note}
          onChangeText={setNote}
          placeholder="Optional"
          multiline
        />
        <Button label="Record the losses" onPress={doLosses} loading={busy} />
      </Sheet>

      <Sheet open={sheet === 'bench'} title="Bench a delivery" onClose={closeSheet}>
        <Text style={s.sheetNote}>
          A batch starts from a delivery that has been checked in. It takes the variety, the unit
          and its number from the arrival.
        </Text>
        <PickerField
          label="Delivery"
          value={consignment}
          placeholder="Which consignment"
          load={loadBenchable}
          onChange={(v) => {
            setConsignment(v);
            closeSheet();
            router.push({ pathname: '/arrival/[name]', params: { name: v } });
          }}
        />
        <Button
          label="See every arrival"
          variant="outline"
          onPress={() => {
            closeSheet();
            router.push('/arrival');
          }}
        />
      </Sheet>
    </Screen>
  );
}

/** How far along the ladder this batch is, as a share of the seven rungs. */
function pct(b: BatchRow): number {
  const i = STAGES.indexOf(b.current_stage ?? '');
  if (i < 0) return b.current_stage === 'Completed' ? 100 : 0;
  return Math.round(((i + 1) / STAGES.length) * 100);
}

function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <SafeAreaView style={s.sheet} edges={['bottom']}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, on ? s.chipOn : null]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, on ? s.chipTextOn : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View>
      <Text style={[s.figValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={s.figLabel}>{label}</Text>
    </View>
  );
}

const num = (n: number | null | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

const s = StyleSheet.create({
  summary: { marginBottom: spacing.lg },
  summaryBig: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text },
  summaryLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: 2,
  },
  cardOn: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tick: { paddingRight: 2 },
  variety: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  stage: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    maxWidth: 130,
  },
  stageText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  name: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  bar: {
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  barFill: { height: 4, borderRadius: borderRadius.full },
  figures: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  figValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  figLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  unit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  actionText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textOnPrimary },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  sheetBody: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetNote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
});
