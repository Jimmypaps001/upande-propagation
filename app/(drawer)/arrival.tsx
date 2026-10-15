import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { lightHaptic } from '@/src/services/feedback';
import {
  consignments,
  type ConsignmentRow,
  type ConsignmentStatus,
} from '@/src/services/operations-api';
import { userMessage } from '@/src/services/user-message';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * Arrivals: the history, and the way to add to it.
 *
 * The history is what the screen opens on, not the form. Most of the time
 * somebody comes here to find a delivery that already happened -- which lorry
 * brought the plants that are failing in bed 14 -- and only occasionally to
 * write a new one down. A form that opened first would make the common case the
 * slow one.
 *
 * Tissue culture is not a separate page. It is one of six forms a consignment
 * can arrive in, chosen on the same form, because a unit does not think of a TC
 * flask and a box of roots as two different kinds of event: both are a lorry at
 * the gate with a waybill.
 */
const FILTERS: { label: string; status?: ConsignmentStatus }[] = [
  { label: 'All' },
  { label: 'To check', status: 'Awaiting Check' },
  { label: 'Held', status: 'Held' },
  { label: 'Received', status: 'Received' },
  { label: 'Turned away', status: 'Rejected' },
];

export default function Arrivals() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');

  const [rows, setRows] = useState<ConsignmentRow[] | null>(null);
  const [status, setStatus] = useState<ConsignmentStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (next?: ConsignmentStatus | undefined, replace = false) =>
      (async () => {
        try {
          const use = replace ? next : status;
          setError(null);
          if (replace) setStatus(next);
          setRows(await consignments(use ? { status: use } : {}));
        } catch (e) {
          setError(userMessage(e, 'Could not load the arrivals.'));
        }
      })(),
    [status],
  );

  useEffect(() => {
    load();
    // Once, on mount: the filter chips drive every later load themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const waiting = (rows ?? []).filter(
    (r) => r.status === 'Awaiting Check' || r.status === 'Held',
  ).length;

  return (
    <Screen
      title="Arrivals"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={rows === null && !error}
      error={error}
      onRetry={() => load()}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <Button
        label="Record an arrival"
        iconLeft="add-circle-outline"
        onPress={() => {
          lightHaptic();
          router.push('/arrival/new');
        }}
        style={{ marginBottom: spacing.lg }}
      />

      {waiting > 0 && !status ? (
        <TouchableOpacity
          style={s.banner}
          activeOpacity={0.7}
          onPress={() => load('Awaiting Check', true)}
        >
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text style={s.bannerText}>
            {waiting} {waiting === 1 ? 'delivery has' : 'deliveries have'} not been checked. Nothing
            of {waiting === 1 ? 'it' : 'them'} is on the ledger yet.
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={s.filters}>
        {FILTERS.map((f) => (
          <Chip
            key={f.label}
            label={f.label}
            on={status === f.status}
            onPress={() => load(f.status, true)}
          />
        ))}
      </View>

      {rows && rows.length === 0 ? (
        <Text style={s.none}>
          {status
            ? `Nothing ${status === 'Rejected' ? 'turned away' : status.toLowerCase()}.`
            : 'No arrival has been recorded yet. The first one will be numbered for today.'}
        </Text>
      ) : null}

      {(rows ?? []).map((c) => (
        <TouchableOpacity
          key={c.name}
          style={s.card}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/arrival/[name]', params: { name: c.name } })}
        >
          <View style={s.cardTop}>
            <Text style={s.code}>{c.consignment}</Text>
            <StatusBadge status={c.status} />
          </View>

          <Text style={s.variety} numberOfLines={1}>
            {c.variety_name ?? c.variety ?? '—'}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {c.form ?? '—'} · {c.supplier_name ?? c.supplier ?? 'no supplier'} ·{' '}
            {c.arrival_date ?? '—'}
          </Text>

          <View style={s.figures}>
            <Figure label="Arrived" value={num(c.qty_received)} />
            {c.status === 'Received' ? (
              <>
                <Figure label="Accepted" value={num(c.qty_accepted)} />
                {c.qty_rejected ? (
                  <Figure label="Turned away" value={num(c.qty_rejected)} tone={colors.error} />
                ) : null}
                <Figure
                  label={c.qty_unbatched ? 'To bench' : 'Benched'}
                  value={c.qty_unbatched ? num(c.qty_unbatched) : `${c.batches_created}`}
                  tone={c.qty_unbatched ? colors.leaf : undefined}
                />
              </>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </Screen>
  );
}

/**
 * Held is the one that matters. It means the plants are physically here and the
 * stock deliberately is not on the ledger, which is a different problem from a
 * delivery nobody has looked at yet.
 */
function StatusBadge({ status }: { status: ConsignmentStatus }) {
  const tone = TONE[status] ?? { fg: colors.textSecondary, bg: colors.surfaceAlt };
  return (
    <View style={[s.badge, { backgroundColor: tone.bg }]}>
      <Text style={[s.badgeText, { color: tone.fg }]}>{status}</Text>
    </View>
  );
}

const TONE: Record<string, { fg: string; bg: string }> = {
  'Awaiting Check': { fg: '#92400E', bg: '#FEF3C7' },
  Held: { fg: '#991B1B', bg: '#FEE2E2' },
  Received: { fg: '#166534', bg: '#DCFCE7' },
  Rejected: { fg: '#991B1B', bg: '#FEE2E2' },
  Draft: { fg: colors.textSecondary, bg: colors.surfaceAlt },
  Cancelled: { fg: colors.textMuted, bg: colors.surfaceAlt },
};

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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: '#FEF3C7',
    marginBottom: spacing.lg,
  },
  bannerText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: '#92400E' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  code: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text, letterSpacing: 0.4 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  figures: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  figValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  figLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
