import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { ChipChoice, PickerField, type PickerOption } from '@/src/components/PickerField';
import { useToast } from '@/src/components/Toast';
import { successHaptic } from '@/src/services/feedback';
import {
  FORMS,
  newConsignment,
  nextConsignmentCode,
  suppliers,
  varieties,
  warehouses,
  type ArrivalForm,
} from '@/src/services/operations-api';
import { openPlantOrders, type OpenOrder } from '@/src/services/planning-api';
import { userMessage } from '@/src/services/user-message';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * A lorry at the gate: supplier, variety, how many.
 *
 * The number is shown before anything is saved, because it is what gets written
 * on the trays in the next ten minutes and the unit should not have to wait for
 * a round trip to know it.
 *
 * Nothing here receives stock. Saving records that the delivery happened; the
 * quality check is what puts it on the ledger, and that is the next screen.
 */
export default function NewArrival() {
  const router = useRouter();
  const toast = useToast();

  const [supplier, setSupplier] = useState<string | null>(null);
  const [supplierLabel, setSupplierLabel] = useState<string | null>(null);
  const [variety, setVariety] = useState<string | null>(null);
  const [form, setForm] = useState<ArrivalForm>('Tissue Culture');
  const [qty, setQty] = useState('');
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  const [code, setCode] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<OpenOrder[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setCode((await nextConsignmentCode()).consignment);
      } catch {
        // Not worth a message: the server will number it either way, and a
        // failure here says nothing about whether the arrival can be saved.
        setCode(null);
      }
    })();
  }, []);

  // What was ordered, if anything was. A delivery does not need a purchase order
  // behind it -- plants turn up against a phone call often enough -- but when
  // there is one, the outstanding figure is worth seeing before typing a count.
  useEffect(() => {
    if (!supplier && !variety) return;
    let alive = true;
    (async () => {
      try {
        const res = await openPlantOrders({
          supplier: supplier ?? undefined,
          variety: variety ?? undefined,
        });
        if (alive) setOrdered(res.orders);
      } catch {
        if (alive) setOrdered(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supplier, variety]);

  const loadSuppliers = useCallback(
    async (): Promise<PickerOption[]> =>
      (await suppliers()).map((r) => ({
        value: r.name,
        label: r.supplier_name ?? r.name,
        hint: r.supplier_group,
        favourite: r.used_before,
      })),
    [],
  );

  const loadVarieties = useCallback(
    async (): Promise<PickerOption[]> =>
      (await varieties()).map((r) => ({
        value: r.name,
        label: r.item_name ?? r.name,
        hint: r.item_group,
      })),
    [],
  );

  const loadWarehouses = useCallback(
    async (): Promise<PickerOption[]> =>
      (await warehouses()).map((r) => ({
        value: r.name,
        label: r.name,
        hint: r.is_unit
          ? `Propagation unit${r.capacity_plants ? ` · holds ${r.capacity_plants.toLocaleString()}` : ''}`
          : r.company,
        favourite: !!r.is_unit,
      })),
    [],
  );

  const count = Number(qty.replace(/[^0-9]/g, '')) || 0;
  const ready = !!supplier && !!variety && count > 0;

  const outstanding = (ordered ?? [])
    .flatMap((o) => o.lines)
    .filter((l) => !variety || l.item_code === variety)
    .reduce((sum, l) => sum + l.outstanding, 0);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await newConsignment({
        supplier: supplier!,
        variety: variety!,
        qty: count,
        form,
        warehouse: warehouse ?? undefined,
        deliveryNote: deliveryNote.trim() || undefined,
        rate: Number(rate.replace(/[^0-9.]/g, '')) || 0,
        notes: notes.trim() || undefined,
      });
      successHaptic();
      toast.showSuccess(`${res.consignment.consignment} recorded. Check it in to receive the stock.`);
      router.replace({ pathname: '/arrival/[name]', params: { name: res.consignment.name } });
    } catch (e) {
      toast.showError(userMessage(e, 'The arrival could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Record an arrival" leftIcon="arrow-back" onPressLeft={() => router.back()}>
      {code ? (
        <View style={s.codeCard}>
          <Text style={s.codeLabel}>This delivery will be</Text>
          <Text style={s.code}>{code}</Text>
          <Text style={s.codeNote}>
            Year, week, day — Sunday is 01. The batches raised from it and the dispatch that sends
            them to the farm all carry this number.
          </Text>
        </View>
      ) : null}

      <PickerField
        label="Supplier"
        value={supplier}
        placeholder="Who delivered it"
        load={loadSuppliers}
        onChange={(v, o) => {
          setSupplier(v);
          setSupplierLabel(o.label);
        }}
      />

      <PickerField
        label="Variety"
        value={variety}
        placeholder="What was in it"
        load={loadVarieties}
        onChange={setVariety}
        helperText="One variety per consignment. Two varieties on one lorry are two arrivals."
      />

      {outstanding > 0 ? (
        <View style={s.ordered}>
          <Ionicons name="document-text-outline" size={16} color={colors.mist} />
          <Text style={s.orderedText}>
            {outstanding.toLocaleString()} still outstanding on an open order
            {supplierLabel ? ` with ${supplierLabel}` : ''}.
          </Text>
        </View>
      ) : null}

      <ChipChoice
        label="Form"
        value={form}
        options={FORMS}
        onChange={(v) => setForm(v as ArrivalForm)}
      />

      <LabeledInput
        label="Quantity received"
        value={qty}
        onChangeText={setQty}
        keyboardType="number-pad"
        placeholder="0"
        iconLeft="cube-outline"
        helperText={
          form === 'Tissue Culture'
            ? 'Plantlets, not flasks — the count that goes onto the bench.'
            : undefined
        }
      />

      <PickerField
        label="Receive into"
        value={warehouse}
        placeholder="The unit it goes to"
        load={loadWarehouses}
        onChange={setWarehouse}
        helperText="Left blank, the default from Propagation Settings is used."
      />

      <LabeledInput
        label="Supplier delivery note"
        value={deliveryNote}
        onChangeText={setDeliveryNote}
        placeholder="The waybill number"
        iconLeft="receipt-outline"
        autoCapitalize="characters"
        helperText="Some sites will not put a receipt through without it."
      />

      <LabeledInput
        label="Rate per plant"
        value={rate}
        onChangeText={setRate}
        keyboardType="decimal-pad"
        placeholder="0.00"
        iconLeft="pricetag-outline"
      />

      <LabeledInput
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything about the state it arrived in"
        multiline
      />

      <Button
        label={ready ? `Record ${count.toLocaleString()} ${form.toLowerCase()}` : 'Record the arrival'}
        onPress={save}
        loading={busy}
        disabled={!ready}
        iconLeft="checkmark-circle-outline"
      />
      <Text style={s.after}>
        Saving writes the delivery down. The quality check is what receives the stock.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: 2,
  },
  codeLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  code: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text, letterSpacing: 1 },
  codeNote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  ordered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.mistSoft,
    marginBottom: spacing.md,
  },
  orderedText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.mist },
  after: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
