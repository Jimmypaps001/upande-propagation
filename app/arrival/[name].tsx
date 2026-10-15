import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { PickerField, type PickerOption } from '@/src/components/PickerField';
import { useToast } from '@/src/components/Toast';
import { lightHaptic, successHaptic } from '@/src/services/feedback';
import {
  checkConsignment,
  consignmentDetail,
  createBatch,
  warehouses,
  type CheckParameter,
  type ConsignmentDetail,
} from '@/src/services/operations-api';
import { userMessage } from '@/src/services/user-message';
import { accentFor, borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

type Verdict = 'Accepted' | 'Rejected';

interface Reading {
  reading: string;
  verdict: Verdict | null;
}

/**
 * One delivery: what came, how it checked out, and what has been made of it.
 *
 * The check is the heart of the screen. ERPNext already carries the whole chain
 * -- Quality Inspection against a template, Purchase Receipt with accepted and
 * rejected quantities, the stock ledger behind both -- so nothing here is a new
 * inspection engine. What it adds is a sheet a person can fill in while holding
 * the plants.
 *
 * The thresholds on that template are placeholders nobody agronomic has signed
 * off, so they are shown as guidance and the operator's verdict is what counts.
 * A number refusing a real delivery is worse than a person refusing it.
 */
export default function ArrivalDetail() {
  const router = useRouter();
  const toast = useToast();
  const { name } = useLocalSearchParams<{ name: string }>();

  const [data, setData] = useState<ConsignmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // the check
  const [accepted, setAccepted] = useState('');
  const [rejected, setRejected] = useState('');
  const [reason, setReason] = useState('');
  const [rejectWh, setRejectWh] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [held, setHeld] = useState<string | null>(null);

  // benching
  const [benchQty, setBenchQty] = useState('');
  const [benchUnit, setBenchUnit] = useState<string | null>(null);

  const load = useCallback(
    () =>
      (async () => {
        try {
          const res = await consignmentDetail(String(name));
          setError(null);
          setData(res);
          setAccepted((a) => a || String(res.consignment.qty_received ?? ''));
          setDeliveryNote((d) => d || (res.consignment.supplier_delivery_note ?? ''));
          setRejectWh((w) => w ?? res.consignment.rejected_warehouse ?? null);
          setBenchQty((b) => b || String(res.consignment.qty_unbatched ?? ''));
          setBenchUnit((u) => u ?? res.consignment.warehouse ?? null);
          setReadings((cur) =>
            Object.keys(cur).length
              ? cur
              : Object.fromEntries(
                  res.check.parameters.map((p) => [p.specification, { reading: '', verdict: null }]),
                ),
          );
        } catch (e) {
          setError(userMessage(e, 'Could not load the arrival.'));
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

  const loadWarehouses = useCallback(
    async (): Promise<PickerOption[]> =>
      (await warehouses()).map((r) => ({
        value: r.name,
        label: r.name,
        hint: r.is_unit ? 'Propagation unit' : r.company,
        favourite: !!r.is_unit,
      })),
    [],
  );

  const c = data?.consignment;
  const params = data?.check.parameters ?? [];
  const toCheck = c?.status === 'Awaiting Check' || c?.status === 'Held';

  const acceptedN = Number(accepted.replace(/[^0-9]/g, '')) || 0;
  const rejectedN = Number(rejected.replace(/[^0-9]/g, '')) || 0;
  const over = c ? acceptedN + rejectedN > c.qty_received : false;
  const unaccounted = c ? c.qty_received - acceptedN - rejectedN : 0;

  const anyRejectedReading = useMemo(
    () => Object.values(readings).some((r) => r.verdict === 'Rejected'),
    [readings],
  );

  const submitCheck = async () => {
    if (!c || busy) return;
    if (over) {
      toast.showError('That is more than arrived.');
      return;
    }
    if (acceptedN + rejectedN === 0) {
      toast.showError('Say how many passed and how many were turned away.');
      return;
    }
    setBusy(true);
    try {
      const payload: CheckParameter[] = params.map((p) => ({
        ...p,
        reading_value: readings[p.specification]?.reading || null,
        status: readings[p.specification]?.verdict ?? suggest(p, readings[p.specification]?.reading),
      }));
      const res = await checkConsignment({
        consignment: c.name,
        accepted: acceptedN,
        rejected: rejectedN,
        readings: payload,
        reason: reason.trim() || undefined,
        rejectedWarehouse: rejectWh ?? undefined,
        deliveryNote: deliveryNote.trim() || undefined,
      });
      if (res.held) {
        setHeld(res.message);
        // notify, not showError: the server's words can run long and showError
        // discards anything that does not read like a short sentence.
        toast.notify('Held. Nothing has gone onto the ledger.', 'error', 5000);
      } else {
        setHeld(null);
        successHaptic();
        toast.notify(res.message, 'success', 4000);
      }
      await load();
    } catch (e) {
      toast.showError(userMessage(e, 'The check could not be recorded.'));
    } finally {
      setBusy(false);
    }
  };

  const bench = async () => {
    if (!c || busy) return;
    const n = Number(benchQty.replace(/[^0-9]/g, '')) || 0;
    if (n <= 0) {
      toast.showError('How many go onto the bench?');
      return;
    }
    setBusy(true);
    try {
      const res = await createBatch({
        consignment: c.name,
        qty: n,
        unit: benchUnit ?? undefined,
      });
      successHaptic();
      toast.showSuccess(`${res.batch} opened at ${res.stage}.`);
      await load();
      router.push({ pathname: '/batch/[name]', params: { name: res.batch } });
    } catch (e) {
      toast.showError(userMessage(e, 'The batch could not be opened.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={c?.consignment ?? 'Arrival'}
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      loading={data === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {c ? (
        <>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.variety} numberOfLines={2}>
                {c.variety_name ?? c.variety ?? '—'}
              </Text>
              <Text style={s.meta}>
                {c.form ?? '—'} · {c.supplier ?? 'no supplier'} · {c.arrival_date ?? '—'}
              </Text>
            </View>
            <View style={[s.badge, { backgroundColor: toneOf(c.status).bg }]}>
              <Text style={[s.badgeText, { color: toneOf(c.status).fg }]}>{c.status}</Text>
            </View>
          </View>

          <View style={s.figures}>
            <Figure label="Arrived" value={num(c.qty_received)} big />
            {c.status === 'Received' ? (
              <>
                <Figure label="Accepted" value={num(c.qty_accepted)} big tone={colors.leaf} />
                {c.qty_rejected ? (
                  <Figure label="Turned away" value={num(c.qty_rejected)} big tone={colors.error} />
                ) : null}
              </>
            ) : null}
          </View>

          {held || c.status === 'Held' ? (
            <View style={s.alert}>
              <Ionicons name="hand-left-outline" size={18} color="#991B1B" />
              <Text style={s.alertText}>
                {held ??
                  'This delivery is held. The plants are here and the stock is deliberately not ' +
                    'on the ledger. Correct the check and put it through, or have the office ' +
                    'receipt it on its own authority.'}
              </Text>
            </View>
          ) : null}

          {/* ------------------------------------------------------- the check */}
          {toCheck ? (
            <>
              <Text style={s.section}>The check</Text>

              <View style={s.splitRow}>
                <View style={s.splitHalf}>
                  <LabeledInput
                    label="Accepted"
                    value={accepted}
                    onChangeText={setAccepted}
                    keyboardType="number-pad"
                    iconLeft="checkmark-circle-outline"
                    invalid={over}
                  />
                </View>
                <View style={s.splitHalf}>
                  <LabeledInput
                    label="Turned away"
                    value={rejected}
                    onChangeText={setRejected}
                    keyboardType="number-pad"
                    iconLeft="close-circle-outline"
                    invalid={over}
                  />
                </View>
              </View>

              <View style={s.quick}>
                <TouchableOpacity
                  style={s.quickBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    lightHaptic();
                    setAccepted(String(c.qty_received));
                    setRejected('');
                  }}
                >
                  <Text style={s.quickText}>Accept all {num(c.qty_received)}</Text>
                </TouchableOpacity>
                {unaccounted > 0 && acceptedN > 0 ? (
                  <TouchableOpacity
                    style={s.quickBtn}
                    activeOpacity={0.7}
                    onPress={() => {
                      lightHaptic();
                      setRejected(String(unaccounted + rejectedN));
                    }}
                  >
                    <Text style={s.quickText}>Turn away the other {num(unaccounted)}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {over ? (
                <Text style={s.warn}>
                  {num(acceptedN + rejectedN)} is more than the {num(c.qty_received)} that arrived.
                </Text>
              ) : unaccounted > 0 ? (
                <Text style={s.warn}>
                  {num(unaccounted)} unaccounted for. Only what is accounted for goes on the ledger.
                </Text>
              ) : null}

              {rejectedN > 0 ? (
                <>
                  <PickerField
                    label="Rejected stock goes to"
                    value={rejectWh}
                    placeholder="A different warehouse"
                    load={loadWarehouses}
                    onChange={setRejectWh}
                    helperText="It cannot be the accepted warehouse. ERPNext will not hold the two together."
                  />
                  <LabeledInput
                    label="Why"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Overheated in transit, wrong variety, mouldy…"
                    multiline
                  />
                </>
              ) : null}

              <LabeledInput
                label="Supplier delivery note"
                value={deliveryNote}
                onChangeText={setDeliveryNote}
                placeholder="The waybill number"
                autoCapitalize="characters"
              />

              {params.length ? (
                <>
                  <Text style={s.section}>
                    {data?.check.template ?? 'Quality'}
                    <Text style={s.sectionNote}>
                      {'  '}
                      your verdict, not the threshold&rsquo;s
                    </Text>
                  </Text>
                  {params.map((p) => (
                    <ReadingRow
                      key={p.specification}
                      param={p}
                      state={readings[p.specification] ?? { reading: '', verdict: null }}
                      onChange={(next) =>
                        setReadings((cur) => ({ ...cur, [p.specification]: next }))
                      }
                    />
                  ))}
                  {anyRejectedReading ? (
                    <Text style={s.warn}>
                      A rejected reading holds the whole delivery off the ledger, whatever the
                      accepted count says.
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={s.none}>
                  No inspection template is set for this variety, so there is nothing to score.
                </Text>
              )}

              <Button
                label={
                  acceptedN > 0
                    ? `Receive ${num(acceptedN)} into ${c.warehouse ?? 'the unit'}`
                    : 'Turn the whole delivery away'
                }
                onPress={submitCheck}
                loading={busy}
                disabled={over}
                color={acceptedN > 0 ? undefined : colors.danger}
                iconLeft={acceptedN > 0 ? 'enter-outline' : 'close-circle-outline'}
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : null}

          {/* ------------------------------------------------------- the stock */}
          {c.status === 'Received' ? (
            <>
              <Text style={s.section}>On the ledger</Text>
              <View style={s.card}>
                <KeyValue k="Receipt" v={c.purchase_receipt ?? '—'} />
                <KeyValue k="Inspection" v={c.quality_inspection ?? 'not required'} />
                <KeyValue k="Warehouse" v={c.warehouse ?? '—'} />
                {c.rejection_reason ? <KeyValue k="Rejected because" v={c.rejection_reason} /> : null}
              </View>

              <Text style={s.section}>On the bench</Text>
              {(data?.batches ?? []).length === 0 ? (
                <Text style={s.none}>Nothing of this delivery has been benched yet.</Text>
              ) : null}
              {(data?.batches ?? []).map((b) => {
                const a = accentFor(b.current_stage);
                return (
                  <TouchableOpacity
                    key={b.name}
                    style={s.batch}
                    activeOpacity={0.7}
                    onPress={() =>
                      router.push({ pathname: '/batch/[name]', params: { name: b.name } })
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.batchName}>{b.name}</Text>
                      <Text style={s.meta}>
                        {num(b.total_cuttings_planned)} benched · {num(b.total_survived)} surviving
                        {b.propagation_unit ? ` · ${b.propagation_unit}` : ''}
                      </Text>
                    </View>
                    <View style={[s.stage, { backgroundColor: a.bg }]}>
                      <Text style={[s.stageText, { color: a.fg }]}>{b.current_stage ?? '—'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {data?.can_batch ? (
                <View style={s.benchBox}>
                  <Text style={s.benchTitle}>
                    {num(c.qty_unbatched)} still to go onto the bench
                  </Text>
                  <View style={s.splitRow}>
                    <View style={s.splitHalf}>
                      <LabeledInput
                        label="How many"
                        value={benchQty}
                        onChangeText={setBenchQty}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                  <PickerField
                    label="Into"
                    value={benchUnit}
                    placeholder="Which unit or trough"
                    load={loadWarehouses}
                    onChange={setBenchUnit}
                  />
                  <Button
                    label="Open a batch"
                    onPress={bench}
                    loading={busy}
                    iconLeft="layers-outline"
                  />
                  <Text style={s.benchNote}>
                    The batch takes its number from this delivery, and starts at the stage the form
                    implies — tissue culture at sticking, roots at rooting, plants at nursery.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * One parameter. The threshold is shown and a verdict is suggested from it, but
 * the two buttons are what the server is told.
 */
function ReadingRow({
  param,
  state,
  onChange,
}: {
  param: CheckParameter;
  state: Reading;
  onChange: (next: Reading) => void;
}) {
  const suggested = suggest(param, state.reading);
  const verdict = state.verdict ?? suggested;
  const spec = param.numeric
    ? `${param.min_value}–${param.max_value}`
    : param.expected_value ?? '';

  return (
    <View style={s.reading}>
      <View style={s.readingTop}>
        <Text style={s.readingName} numberOfLines={1}>
          {param.specification}
        </Text>
        {spec ? (
          <Text style={s.readingSpec} numberOfLines={1}>
            {spec}
          </Text>
        ) : null}
      </View>
      <View style={s.readingRow}>
        <LabeledInput
          label=""
          value={state.reading}
          onChangeText={(t) => onChange({ ...state, reading: t })}
          keyboardType={param.numeric ? 'decimal-pad' : 'default'}
          placeholder={param.numeric ? '0' : 'What you saw'}
        />
      </View>
      <View style={s.verdicts}>
        <TouchableOpacity
          style={[s.verdict, verdict === 'Accepted' ? s.verdictOk : null]}
          activeOpacity={0.7}
          onPress={() => {
            lightHaptic();
            onChange({ ...state, verdict: 'Accepted' });
          }}
        >
          <Ionicons
            name="checkmark"
            size={16}
            color={verdict === 'Accepted' ? colors.textOnPrimary : colors.textSecondary}
          />
          <Text style={[s.verdictText, verdict === 'Accepted' ? s.verdictTextOn : null]}>Pass</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.verdict, verdict === 'Rejected' ? s.verdictBad : null]}
          activeOpacity={0.7}
          onPress={() => {
            lightHaptic();
            onChange({ ...state, verdict: 'Rejected' });
          }}
        >
          <Ionicons
            name="close"
            size={16}
            color={verdict === 'Rejected' ? colors.textOnPrimary : colors.textSecondary}
          />
          <Text style={[s.verdictText, verdict === 'Rejected' ? s.verdictTextOn : null]}>Fail</Text>
        </TouchableOpacity>
        {state.verdict === null && state.reading ? (
          <Text style={s.suggested}>suggested</Text>
        ) : null}
      </View>
    </View>
  );
}

/** What the threshold would say. Guidance only: see the file header. */
function suggest(param: CheckParameter, reading: string | undefined): Verdict {
  if (!param.numeric || !reading) return 'Accepted';
  const n = Number(reading.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) return 'Accepted';
  return n >= param.min_value && n <= param.max_value ? 'Accepted' : 'Rejected';
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.kv}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v} numberOfLines={1}>
        {v}
      </Text>
    </View>
  );
}

function Figure({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: string;
  big?: boolean;
}) {
  return (
    <View>
      <Text style={[big ? s.figBig : s.figValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={s.figLabel}>{label}</Text>
    </View>
  );
}

function toneOf(status: string): { fg: string; bg: string } {
  if (status === 'Received') return { fg: '#166534', bg: '#DCFCE7' };
  if (status === 'Awaiting Check') return { fg: '#92400E', bg: '#FEF3C7' };
  if (status === 'Held' || status === 'Rejected') return { fg: '#991B1B', bg: '#FEE2E2' };
  return { fg: colors.textSecondary, bg: colors.surfaceAlt };
}

const num = (n: number | null | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  badgeText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  figures: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.lg },
  figBig: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  figValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  figLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  alert: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: '#FEE2E2',
    marginBottom: spacing.lg,
  },
  alertText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: '#991B1B' },
  section: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionNote: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  splitRow: { flexDirection: 'row', gap: spacing.md },
  splitHalf: { flex: 1 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  quickBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  quickText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  warn: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.warning,
    marginBottom: spacing.md,
  },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  reading: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  readingTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  readingName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  readingSpec: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  readingRow: { marginTop: spacing.xs, marginBottom: -spacing.sm },
  verdicts: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  verdictOk: { backgroundColor: colors.leaf },
  verdictBad: { backgroundColor: colors.error },
  verdictText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  verdictTextOn: { color: colors.textOnPrimary },
  suggested: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  k: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  v: { flex: 1, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  batch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  batchName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  stage: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  stageText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  benchBox: {
    backgroundColor: colors.leafSoft,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  benchTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.leaf,
    marginBottom: spacing.md,
  },
  benchNote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
