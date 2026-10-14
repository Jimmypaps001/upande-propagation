import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import { successHaptic } from '@/src/services/feedback';
import {
  ACTIVITIES,
  SCOUTING,
  addLog,
  batchDetail,
  diseases as listDiseases,
  type Activity,
  type BatchDetail,
} from '@/src/services/batches-api';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/** The batch a label opens on: where it is, where it came from, what it is owed. */
export default function Batch() {
  const router = useRouter();
  const toast = useToast();
  const { name } = useLocalSearchParams<{ name: string }>();

  const [data, setData] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [logging, setLogging] = useState(false);
  const [activity, setActivity] = useState<Activity>('Nursery Count');
  const [qty, setQty] = useState('');
  const [mortality, setMortality] = useState('');
  const [observations, setObservations] = useState('');
  const [disease, setDisease] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [affected, setAffected] = useState('');
  const [treatment, setTreatment] = useState('');
  const [diseaseList, setDiseaseList] = useState<{ name: string; common_name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      (async () => {
        try {
          setError(null);
          setData(await batchDetail(String(name)));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the batch.');
        }
      })(),
    [name],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Fetched once the scouting form is actually opened: most logs are counts and
  // never need the list.
  useEffect(() => {
    if (activity !== SCOUTING || diseaseList.length) return;
    listDiseases()
      .then(setDiseaseList)
      .catch(() => setDiseaseList([]));
  }, [activity, diseaseList.length]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const b = (data?.batch ?? {}) as Record<string, unknown>;
  const scouting = activity === SCOUTING;
  const canSave = scouting
    ? !!disease && (toInt(affected) > 0 || !!observations.trim()) && !busy
    : toInt(qty) + toInt(mortality) > 0 && !busy;

  const save = async () => {
    if (!canSave || !data) return;
    setBusy(true);
    try {
      const res = await addLog({
        batch: data.batch.name,
        activity,
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
      toast.showError(e instanceof Error ? e.message : 'Could not write the log.');
    } finally {
      setBusy(false);
    }
  };

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
                    <View style={[s.funnelBar, { width: `${Math.min(100, f.percent)}%` }]} />
                  </View>
                  <Text style={s.funnelValue}>{num(f.value)}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {logging ? (
            <Card title="Add a log">
              <View style={s.chips}>
                {ACTIVITIES.map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[s.chip, a === activity ? s.chipOn : null]}
                    onPress={() => setActivity(a)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, a === activity ? s.chipTextOn : null]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {scouting ? (
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
              ) : (
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
              )}

              <LabeledInput
                label="What you saw"
                value={observations}
                onChangeText={setObservations}
                placeholder="Anything worth remembering"
                multiline
              />

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
            <Button
              label="Add a log"
              iconLeft="create-outline"
              onPress={() => setLogging(true)}
              style={{ marginTop: spacing.md, marginBottom: spacing.lg }}
            />
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
    </Screen>
  );
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (n: number | undefined | null): string => (n ? Math.round(n).toLocaleString() : '0');
const toInt = (v: string): number => {
  const n = parseInt((v || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  big: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  bigUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  basis: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 16 },
  late: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.warning, marginTop: spacing.xs },
  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  funnelLabel: { width: 112, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  funnelBarWrap: { flex: 1, height: 5, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  funnelBar: { height: 5, borderRadius: borderRadius.full, backgroundColor: colors.text },
  funnelValue: { width: 62, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 16 },
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
});
