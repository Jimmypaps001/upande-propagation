import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { PickerField, type PickerOption } from '@/src/components/PickerField';
import { useToast } from '@/src/components/Toast';
import { lightHaptic, successHaptic } from '@/src/services/feedback';
import {
  SCOUTING,
  addLog,
  batchDetail,
  diseases as listDiseases,
  type Activity,
  type BatchDetail,
} from '@/src/services/batches-api';
import {
  batchActivities,
  dispatchBatch,
  dispatchTargets,
  moveBatches,
  stagePlan,
  warehouses,
  type BatchActivities,
  type DispatchTargets,
  type StageRung,
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
 * One batch: where it is, what it came in on, and the three things done to it.
 *
 * The activity list is not the same eight for every batch. A variety raised
 * from tissue culture has no motherstock to cut from; a consignment of rooted
 * cuttings has already been stuck; a motherstock on a two-week multiplication
 * cycle cannot be cut eight days running. The server reads that off the crop
 * protocol and the arrival, and answers per activity.
 *
 * Every one of them is still shown. A greyed row that says why is worth more
 * than a short list that looks arbitrary -- the unit learns the protocol from
 * it, instead of concluding the app is broken.
 */
export default function Batch() {
  const router = useRouter();
  const toast = useToast();
  const { name } = useLocalSearchParams<{ name: string }>();

  const [data, setData] = useState<BatchDetail | null>(null);
  const [acts, setActs] = useState<BatchActivities | null>(null);
  const [ladder, setLadder] = useState<StageRung[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [logging, setLogging] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [qty, setQty] = useState('');
  const [mortality, setMortality] = useState('');
  const [observations, setObservations] = useState('');
  const [disease, setDisease] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [affected, setAffected] = useState('');
  const [treatment, setTreatment] = useState('');
  const [diseaseList, setDiseaseList] = useState<{ name: string; common_name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const [sheet, setSheet] = useState<'move' | 'dispatch' | null>(null);
  const [moveStage, setMoveStage] = useState<string | null>(null);
  const [moveUnit, setMoveUnit] = useState<string | null>(null);
  const [targets, setTargets] = useState<DispatchTargets | null>(null);
  const [sendQty, setSendQty] = useState('');
  const [sendTo, setSendTo] = useState<string | null>(null);
  const [sendFarm, setSendFarm] = useState<string | null>(null);

  const load = useCallback(
    () =>
      (async () => {
        try {
          setError(null);
          const [detail, verdicts, plan] = await Promise.all([
            batchDetail(String(name)),
            batchActivities(String(name)).catch(() => null),
            stagePlan(String(name)).catch(() => null),
          ]);
          setData(detail);
          setActs(verdicts);
          setLadder(plan?.ladder ?? null);
          setSendQty((q) => q || String(Number(detail.batch.available_to_dispatch) || ''));
        } catch (e) {
          setError(userMessage(e, 'Could not load the batch.'));
        }
      })(),
    [name],
  );

  useEffect(() => {
    load();
  }, [load]);

  // The first thing this batch is allowed to be doing, so the form opens on
  // something that can actually be saved. Derived rather than written into
  // state by an effect: the chosen activity is only ever an override of it,
  // and storing the default as well would be two sources for one answer.
  const suggested = useMemo<Activity | null>(() => {
    if (!acts) return null;
    const first = acts.activities.find((a) => a.allowed && a.activity !== 'Mortality Count');
    return ((first?.activity ?? acts.allowed[0]) as Activity) ?? null;
  }, [acts]);
  const chosen = activity ?? suggested;

  useEffect(() => {
    if (chosen !== SCOUTING || diseaseList.length) return;
    listDiseases()
      .then(setDiseaseList)
      .catch(() => setDiseaseList([]));
  }, [chosen, diseaseList.length]);

  useEffect(() => {
    if (sheet !== 'dispatch' || targets) return;
    dispatchTargets()
      .then(setTargets)
      .catch(() => setTargets(null));
  }, [sheet, targets]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const b = (data?.batch ?? {}) as Record<string, unknown>;
  const scouting = chosen === SCOUTING;
  const verdict = acts?.activities.find((a) => a.activity === chosen);
  const blocked = !!verdict && !verdict.allowed;

  const canSave =
    !!chosen &&
    !blocked &&
    !busy &&
    (scouting
      ? !!disease && (toInt(affected) > 0 || !!observations.trim())
      : toInt(qty) + toInt(mortality) > 0);

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

  const save = async () => {
    if (!canSave || !data || !chosen) return;
    setBusy(true);
    try {
      const res = await addLog({
        batch: data.batch.name,
        activity: chosen,
        qtyDone: toInt(qty),
        mortality: toInt(mortality),
        observations: observations.trim() || null,
        disease: scouting ? disease : null,
        severity: scouting ? severity : null,
        affected: scouting ? toInt(affected) : 0,
        treatment: scouting ? treatment.trim() || null : null,
      });
      successHaptic();
      toast.showSuccess(`Logged ${res.name}.`);
      setLogging(false);
      setQty('');
      setMortality('');
      setObservations('');
      setAffected('');
      setTreatment('');
      setDisease(null);
      setSeverity(null);
      await load();
    } catch (e) {
      toast.showError(userMessage(e, 'Could not write the log.'));
    } finally {
      setBusy(false);
    }
  };

  const doMove = async () => {
    if (!data || busy || (!moveStage && !moveUnit)) return;
    setBusy(true);
    try {
      const res = await moveBatches({
        batches: [data.batch.name],
        stage: moveStage ?? undefined,
        unit: moveUnit ?? undefined,
      });
      if (res.refused.length) {
        toast.notify(res.refused[0].reason, 'error', 5000);
      } else {
        successHaptic();
        toast.showSuccess(`Moved to ${res.moved[0]?.stage ?? moveUnit}.`);
      }
      setSheet(null);
      setMoveStage(null);
      await load();
    } catch (e) {
      toast.showError(userMessage(e, 'The batch did not move.'));
    } finally {
      setBusy(false);
    }
  };

  const doDispatch = async () => {
    if (!data || busy) return;
    const n = toInt(sendQty);
    if (n <= 0) {
      toast.showError('How many are going?');
      return;
    }
    setBusy(true);
    try {
      const res = await dispatchBatch({
        batch: data.batch.name,
        qty: n,
        greenhouse: sendTo ?? undefined,
        farm: sendFarm ?? undefined,
      });
      successHaptic();
      toast.notify(
        res.stock_entry
          ? `${res.dispatch} sent. Stock moved on ${res.stock_entry}.`
          : `${res.dispatch} sent. No stock transfer — set a greenhouse to move the stock too.`,
        res.stock_entry ? 'success' : 'info',
        5000,
      );
      setSheet(null);
      await load();
    } catch (e) {
      toast.showError(userMessage(e, 'The dispatch did not go through.'));
    } finally {
      setBusy(false);
    }
  };

  const stageTone = accentFor(str(b.current_stage));

  return (
    <Screen
      title={String(name)}
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      loading={data === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {data ? (
        <>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.variety}>{str(b.variety_name) || str(b.variety) || '—'}</Text>
              <Text style={s.sub}>
                {str(b.propagation_unit) || '—'} · {str(b.propagation_method) || '—'}
              </Text>
            </View>
            <Pill value={str(b.current_stage) || '—'} />
          </View>

          {str(b.consignment_code) ? (
            <TouchableOpacity
              style={s.origin}
              activeOpacity={0.7}
              onPress={() =>
                router.push({
                  pathname: '/arrival/[name]',
                  params: { name: str(b.plant_consignment) },
                })
              }
            >
              <Ionicons name="cube-outline" size={16} color={colors.mist} />
              <Text style={s.originText}>
                Came in on {str(b.consignment_code)}
                {acts?.form ? ` as ${acts.form.toLowerCase()}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mist} />
            </TouchableOpacity>
          ) : null}

          {/* ------------------------------------------------------ the ladder */}
          {ladder?.length ? (
            <Card title="Up the ladder">
              {ladder.map((r) => {
                const a = accentFor(r.stage);
                const over = r.state === 'current' && r.expected_days > 0 && r.days_in_stage > r.expected_days;
                return (
                  <View key={r.stage} style={s.rung}>
                    <View
                      style={[
                        s.dot,
                        {
                          backgroundColor:
                            r.state === 'ahead' ? colors.surfaceAlt : a.fg,
                          borderColor: r.state === 'current' ? a.fg : 'transparent',
                        },
                      ]}
                    />
                    <Text
                      style={[
                        s.rungName,
                        r.state === 'current' ? s.rungNow : null,
                        r.state === 'ahead' ? s.rungAhead : null,
                      ]}
                    >
                      {r.stage}
                    </Text>
                    <Text style={[s.rungDays, over ? { color: colors.warning } : null]}>
                      {r.state === 'current'
                        ? `day ${r.days_in_stage}${r.expected_days ? ` of ${r.expected_days}` : ''}`
                        : r.state === 'ahead'
                          ? r.expected_days
                            ? `${r.expected_days}d`
                            : ''
                          : r.days_in_stage
                            ? `${r.days_in_stage}d`
                            : '—'}
                    </Text>
                  </View>
                );
              })}
              {acts?.protocol ? (
                <Text style={s.basis}>
                  Days from Propagation Settings; the protocol in force is {acts.protocol}
                  {acts.route_summary ? ` (${acts.route_summary})` : ''}.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {data.expected_delivery ? (
            <Card title="Due at the farm">
              <View style={s.bigRow}>
                <Text style={s.big}>{data.expected_delivery.date}</Text>
                <Text style={s.bigUnit}>
                  {data.expected_delivery.days_out === 0
                    ? 'ready now'
                    : `in ${data.expected_delivery.days_out} days`}
                </Text>
              </View>
              <Text style={s.basis}>{data.expected_delivery.basis}</Text>
              {data.expected_delivery.overdue_in_stage ? (
                <Text style={s.late}>
                  {data.expected_delivery.overdue_in_stage} days over the expected time in this
                  stage.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {data.funnel?.length ? (
            <Card title="Where the plants went">
              {data.funnel.map((f) => (
                <View key={f.label} style={s.funnelRow}>
                  <Text style={s.funnelLabel}>{f.label}</Text>
                  <View style={s.funnelBarWrap}>
                    <View
                      style={[
                        s.funnelBar,
                        { width: `${Math.min(100, f.percent)}%`, backgroundColor: stageTone.fg },
                      ]}
                    />
                  </View>
                  <Text style={s.funnelValue}>{num(f.value)}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {/* ------------------------------------------------------- the work */}
          {logging ? (
            <Card title="Add a log">
              <View style={s.chips}>
                {(acts?.activities ?? []).map((a) => {
                  const on = a.activity === chosen;
                  return (
                    <TouchableOpacity
                      key={a.activity}
                      style={[
                        s.chip,
                        on ? s.chipOn : null,
                        !a.allowed ? s.chipOff : null,
                      ]}
                      onPress={() => {
                        lightHaptic();
                        setActivity(a.activity as Activity);
                      }}
                      activeOpacity={0.7}
                    >
                      {!a.allowed ? (
                        <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
                      ) : null}
                      <Text
                        style={[
                          s.chipText,
                          on ? s.chipTextOn : null,
                          !a.allowed ? s.chipTextOff : null,
                        ]}
                      >
                        {a.activity}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {blocked && verdict?.reason ? (
                <View style={s.blocked}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.root} />
                  <Text style={s.blockedText}>
                    {verdict.reason}
                    {verdict.next_allowed_on ? ` Next on ${verdict.next_allowed_on}.` : ''}
                  </Text>
                </View>
              ) : null}

              {!blocked && scouting ? (
                <>
                  <Text style={s.fieldLabel}>Disease</Text>
                  {diseaseList.length ? (
                    <View style={s.chips}>
                      {diseaseList.map((d) => (
                        <TouchableOpacity
                          key={d.name}
                          style={[s.chip, d.name === disease ? s.chipOn : null]}
                          onPress={() => setDisease(d.name)}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.chipText, d.name === disease ? s.chipTextOn : null]}>
                            {d.common_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <Text style={s.empty}>
                      No diseases are set up on this server yet, so there is nothing to pick.
                    </Text>
                  )}

                  <Text style={s.fieldLabel}>Severity</Text>
                  <View style={s.chips}>
                    {['Low', 'Medium', 'High'].map((v) => (
                      <TouchableOpacity
                        key={v}
                        style={[s.chip, v === severity ? s.chipOn : null]}
                        onPress={() => setSeverity(v)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.chipText, v === severity ? s.chipTextOn : null]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <LabeledInput
                    label="Plants affected"
                    value={affected}
                    onChangeText={setAffected}
                    keyboardType="numeric"
                    placeholder="0"
                    helperText="Showing symptoms. Record deaths as a mortality count instead."
                  />
                  <LabeledInput
                    label="Treatment applied"
                    value={treatment}
                    onChangeText={setTreatment}
                    placeholder="What was sprayed, if anything"
                  />
                </>
              ) : !blocked ? (
                <>
                  <LabeledInput
                    label="Done today"
                    value={qty}
                    onChangeText={setQty}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                  <LabeledInput
                    label="Died today"
                    value={mortality}
                    onChangeText={setMortality}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                </>
              ) : null}

              {!blocked ? (
                <LabeledInput
                  label="What you saw"
                  value={observations}
                  onChangeText={setObservations}
                  placeholder="Anything worth remembering"
                  multiline
                />
              ) : null}

              <Button
                label={busy ? 'Saving…' : 'Save the log'}
                onPress={save}
                disabled={!canSave}
                loading={busy}
                style={{ marginTop: spacing.md }}
              />
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setLogging(false)}
                style={{ marginTop: spacing.sm }}
              />
            </Card>
          ) : (
            <View style={s.actions}>
              <Action icon="create-outline" label="Log" onPress={() => setLogging(true)} />
              <Action
                icon="arrow-forward-circle-outline"
                label="Move on"
                onPress={() => setSheet('move')}
              />
              <Action
                icon="paper-plane-outline"
                label="To the farm"
                onPress={() => setSheet('dispatch')}
              />
            </View>
          )}

          {data.logs?.length ? (
            <Card title={`Logs (${data.logs.length})`}>
              {[...data.logs].reverse().slice(0, 25).map((l) => (
                <View key={l.name} style={s.logRow}>
                  <Text style={s.logDate}>{l.log_date}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.logActivity}>{l.activity_type}</Text>
                    {l.observations ? (
                      <Text style={s.logNote} numberOfLines={2}>
                        {l.observations}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={s.logQty}>
                    {l.qty_done_today ? num(l.qty_done_today) : ''}
                    {l.mortality_today ? ` −${num(l.mortality_today)}` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          {data.dispatches?.length ? (
            <Card title={`Dispatched (${data.dispatches.length})`}>
              {data.dispatches.map((d, i) => (
                <View key={str(d.name) || i} style={s.logRow}>
                  <Text style={s.logDate}>{str(d.dispatch_date)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.logActivity}>{str(d.farm) || str(d.customer) || '—'}</Text>
                    <Text style={s.logNote}>
                      {str(d.purpose)}
                      {d.target_greenhouse ? ` · ${str(d.target_greenhouse)}` : ''}
                    </Text>
                  </View>
                  <Text style={s.logQty}>{num(Number(d.qty_dispatched) || 0)}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {/* -------------------------------------------------------- the sheets */}
      <Sheet open={sheet === 'move'} title="Move it on" onClose={() => setSheet(null)}>
        <Text style={s.sheetNote}>
          Forward only, and never past where the work has got to. Use the unit when the move is onto
          another trough.
        </Text>
        <View style={s.chips}>
          {[...STAGES, 'Completed'].map((st) => (
            <TouchableOpacity
              key={st}
              style={[s.chip, moveStage === st ? s.chipOn : null]}
              onPress={() => setMoveStage(st)}
              activeOpacity={0.7}
            >
              <Text style={[s.chipText, moveStage === st ? s.chipTextOn : null]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <PickerField
          label="And into"
          value={moveUnit}
          placeholder="Leave where it is"
          load={loadUnits}
          onChange={setMoveUnit}
        />
        <Button
          label={moveStage ? `Move to ${moveStage}` : 'Move'}
          onPress={doMove}
          loading={busy}
          disabled={!moveStage && !moveUnit}
        />
      </Sheet>

      <Sheet open={sheet === 'dispatch'} title="Send to the farm" onClose={() => setSheet(null)}>
        <Text style={s.sheetNote}>
          A dispatch to one of our own farms moves the stock with it, out of the unit and into the
          greenhouse. Without a greenhouse it stays a paper record.
        </Text>
        <LabeledInput
          label="How many"
          value={sendQty}
          onChangeText={setSendQty}
          keyboardType="number-pad"
          helperText={`${num(Number(b.available_to_dispatch) || 0)} available`}
        />
        <PickerField
          label="Farm"
          value={sendFarm}
          placeholder="Where it is going"
          load={async () =>
            (targets?.farms ?? []).map((f) => ({
              value: f.name,
              label: f.farm_name ?? f.name,
              hint: f.company,
            }))
          }
          onChange={setSendFarm}
        />
        <PickerField
          label="Greenhouse"
          value={sendTo}
          placeholder="Which house it lands in"
          load={async () =>
            (targets?.greenhouses ?? []).map((g) => ({
              value: g.name,
              label: g.name,
              hint: g.company,
            }))
          }
          onChange={setSendTo}
        />
        <Button label="Send them" onPress={doDispatch} loading={busy} iconLeft="paper-plane-outline" />
      </Sheet>
    </Screen>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={s.action}
      activeOpacity={0.8}
      onPress={() => {
        lightHaptic();
        onPress();
      }}
    >
      <Ionicons name={icon} size={20} color={colors.textOnPrimary} />
      <Text style={s.actionText}>{label}</Text>
    </TouchableOpacity>
  );
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

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (n: number | undefined | null): string => (n ? Math.round(n).toLocaleString() : '0');
const toInt = (v: string): number => {
  const n = parseInt((v || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  origin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.mistSoft,
    marginBottom: spacing.lg,
  },
  originText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.mist },
  rung: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 3 },
  rungName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  rungNow: { fontFamily: fontFamily.semiBold },
  rungAhead: { color: colors.textMuted },
  rungDays: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  big: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  bigUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  basis: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  late: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.warning, marginTop: spacing.xs },
  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  funnelLabel: { width: 112, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  funnelBarWrap: { flex: 1, height: 5, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  funnelBar: { height: 5, borderRadius: borderRadius.full },
  funnelValue: { width: 62, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipOff: { backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
  chipTextOff: { color: colors.textMuted },
  blocked: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.rootSoft,
    marginBottom: spacing.md,
  },
  blockedText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.root, lineHeight: 17 },
  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.lg },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  actionText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textOnPrimary },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  logDate: { width: 76, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  logActivity: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  logNote: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 15 },
  logQty: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
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
