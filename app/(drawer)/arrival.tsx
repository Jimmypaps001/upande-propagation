import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import {
  draftPlantReceipt,
  openPlantOrders,
  type OpenOrder,
  type ReceiptLineInput,
} from '@/src/services/planning-api';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Entry {
  accepted: string;
  rejected: string;
}

/**
 * What arrived, against what was ordered.
 *
 * The receipt is written as a DRAFT and left there. Submitting moves stock and
 * posts to the ledger; the unit has the figures but the office has the invoice,
 * so the two halves of that are deliberately kept apart.
 */
export default function Arrival() {
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const toast = useToast();

  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [required, setRequired] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [deliveryNote, setDeliveryNote] = useState('');
  const [rejectedWarehouse, setRejectedWarehouse] = useState('');

  const load = useCallback(
    () =>
      (async () => {
        try {
          const res = await openPlantOrders();
          setError(null);
          setOrders(res.orders);
          setRequired(res.required_on_receipt ?? []);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the orders.');
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

  const order = orders?.find((o) => o.purchase_order === open) ?? null;

  const lines: ReceiptLineInput[] = (order?.lines ?? [])
    .map((l) => ({
      po_item: l.po_item,
      accepted: toNum(entries[l.po_item]?.accepted),
      rejected: toNum(entries[l.po_item]?.rejected),
    }))
    .filter((l) => l.accepted + (l.rejected ?? 0) > 0);

  const anyRejected = lines.some((l) => (l.rejected ?? 0) > 0);
  const needsNote = required.includes('supplier_delivery_note');
  const canSave =
    lines.length > 0 &&
    (!needsNote || !!deliveryNote.trim()) &&
    (!anyRejected || !!rejectedWarehouse.trim()) &&
    !busy;

  const save = async () => {
    if (!order || !canSave) return;
    setBusy(true);
    try {
      const res = await draftPlantReceipt({
        purchaseOrder: order.purchase_order,
        lines,
        supplierDeliveryNote: deliveryNote.trim() || null,
        rejectedWarehouse: rejectedWarehouse.trim() || null,
      });
      toast.showSuccess(`Draft receipt ${res.name} created — the office submits it.`);
      setOpen(null);
      setEntries({});
      setDeliveryNote('');
      setRejectedWarehouse('');
      await load();
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : 'Could not write the receipt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Arrivals"
      leftIcon="menu"
      onPressLeft={() => drawer.openDrawer()}
      loading={orders === null && !error}
      error={error}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <Text style={s.intro}>
        Orders with plant material still to come. Enter what turned up and the app writes a
        draft Purchase Receipt; stock moves only when the office submits it.
      </Text>

      {orders && orders.length === 0 ? (
        <Text style={s.none}>
          Nothing outstanding. Every plant order on this server is either closed or already
          received in full.
        </Text>
      ) : null}

      {(orders ?? []).map((o) => {
        const isOpen = o.purchase_order === open;
        return (
          <Card key={o.purchase_order}>
            <TouchableOpacity
              style={s.head}
              activeOpacity={0.7}
              onPress={() => setOpen(isOpen ? null : o.purchase_order)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.supplier} numberOfLines={1}>
                  {o.supplier_name ?? o.supplier}
                </Text>
                <Text style={s.po} numberOfLines={1}>
                  {o.purchase_order} · {o.transaction_date ?? '—'}
                </Text>
              </View>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            {o.lines.map((l) => (
              <View key={l.po_item} style={s.line}>
                <View style={s.lineHead}>
                  <Text style={s.item} numberOfLines={1}>
                    {l.item_name ?? l.item_code}
                  </Text>
                  <Text style={s.outstanding}>{num(l.outstanding)} to come</Text>
                </View>
                <Text style={s.lineSub}>
                  {num(l.ordered)} ordered · {num(l.received)} received
                  {l.schedule_date ? ` · due ${l.schedule_date}` : ''}
                  {l.planting ? ` · ${l.planting}` : ''}
                </Text>

                {isOpen ? (
                  <View style={s.inputs}>
                    <View style={{ flex: 1 }}>
                      <LabeledInput
                        label="Accepted"
                        value={entries[l.po_item]?.accepted ?? ''}
                        onChangeText={(t) =>
                          setEntries((e) => ({
                            ...e,
                            [l.po_item]: { accepted: t, rejected: e[l.po_item]?.rejected ?? '' },
                          }))
                        }
                        keyboardType="numeric"
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <LabeledInput
                        label="Rejected"
                        value={entries[l.po_item]?.rejected ?? ''}
                        onChangeText={(t) =>
                          setEntries((e) => ({
                            ...e,
                            [l.po_item]: { accepted: e[l.po_item]?.accepted ?? '', rejected: t },
                          }))
                        }
                        keyboardType="numeric"
                        placeholder="0"
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ))}

            {isOpen ? (
              <View style={s.footer}>
                <LabeledInput
                  label={needsNote ? "Supplier's delivery note (required)" : "Supplier's delivery note"}
                  value={deliveryNote}
                  onChangeText={setDeliveryNote}
                  placeholder="DN number on the paperwork"
                />
                {anyRejected ? (
                  <LabeledInput
                    label="Rejected warehouse (required)"
                    value={rejectedWarehouse}
                    onChangeText={setRejectedWarehouse}
                    placeholder="Where the rejects go"
                    helperText="Rejected stock cannot sit in the accepted warehouse."
                  />
                ) : null}

                <Button
                  label={busy ? 'Writing…' : 'Save as draft receipt'}
                  onPress={save}
                  disabled={!canSave}
                  loading={busy}
                  style={{ marginTop: spacing.md }}
                />
                <Text style={s.note}>
                  A draft is created against {o.purchase_order}. Nothing moves until it is
                  submitted.
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const toNum = (s: string | undefined): number => {
  const n = parseInt((s ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};
const num = (n: number | undefined): string => (n ? Math.round(n).toLocaleString() : '0');

const s = StyleSheet.create({
  intro: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 19 },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supplier: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  po: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  line: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 2 },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  item: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  outstanding: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  lineSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  inputs: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  footer: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
});
