import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { lightHaptic } from '@/src/services/feedback';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

export interface PickerOption {
  value: string;
  label: string;
  /** A second line: the supplier group, the unit's company, who it belongs to. */
  hint?: string | null;
  /** Pinned above the rest, under its own heading. */
  favourite?: boolean;
}

interface PickerFieldProps {
  label: string;
  value: string | null;
  placeholder?: string;
  /** Resolved once when the sheet first opens, then filtered on the phone. */
  load: () => Promise<PickerOption[]>;
  onChange: (value: string, option: PickerOption) => void;
  /** Shown under the field: what this choice means, or what it will cost. */
  helperText?: string;
  disabled?: boolean;
  favouriteHeading?: string;
}

/**
 * Pick one of several hundred things, on a phone, with one thumb.
 *
 * A Frappe Link field on the desk is a typeahead against the server. On a
 * handset in a polytunnel that is a request per keystroke over whatever signal
 * there is, so this fetches the list once and filters it here. The lists this
 * app picks from -- plant varieties, suppliers, warehouses -- are hundreds of
 * rows, not millions, and the server already caps them.
 */
export function PickerField({
  label,
  value,
  placeholder = 'Choose one',
  load,
  onChange,
  helperText,
  disabled,
  favouriteHeading = 'Used before',
}: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PickerOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open || options !== null) return;
    let alive = true;
    (async () => {
      try {
        const rows = await load();
        if (alive) setOptions(rows);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the list.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, options, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = options ?? [];
    if (!q) return all;
    return all.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  const chosen = (options ?? []).find((o) => o.value === value);
  const favourites = shown.filter((o) => o.favourite);
  const rest = shown.filter((o) => !o.favourite);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity
        style={[s.field, disabled ? s.fieldDisabled : null]}
        activeOpacity={0.7}
        disabled={disabled}
        onPress={() => {
          lightHaptic();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
      >
        <Text style={[s.value, !value ? s.placeholder : null]} numberOfLines={1}>
          {chosen?.label ?? value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {helperText ? <Text style={s.helper}>{helperText}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={s.sheet} edges={['top', 'left', 'right']}>
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8} style={s.sheetBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>
              {label}
            </Text>
            <View style={s.sheetBtn} />
          </View>

          <View style={s.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={s.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {options === null && !error ? (
            <View style={s.centre}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <View style={s.centre}>
              <Text style={s.error}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={[...favourites, ...rest]}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={s.none}>Nothing matches “{query}”.</Text>}
              renderItem={({ item, index }) => (
                <>
                  {favourites.length > 0 && index === 0 ? (
                    <Text style={s.group}>{favouriteHeading}</Text>
                  ) : null}
                  {favourites.length > 0 && index === favourites.length ? (
                    <Text style={s.group}>Everything else</Text>
                  ) : null}
                  <TouchableOpacity
                    style={s.option}
                    activeOpacity={0.7}
                    onPress={() => {
                      lightHaptic();
                      onChange(item.value, item);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionLabel} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {item.hint ? (
                        <Text style={s.optionHint} numberOfLines={1}>
                          {item.hint}
                        </Text>
                      ) : null}
                    </View>
                    {item.value === value ? (
                      <Ionicons name="checkmark" size={20} color={colors.leaf} />
                    ) : null}
                  </TouchableOpacity>
                </>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** The same control for a short, fixed list: no sheet, just chips. */
export function ChipChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.chips}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            style={[s.chip, value === o ? s.chipOn : null]}
            activeOpacity={0.7}
            onPress={() => {
              lightHaptic();
              onChange(o);
            }}
          >
            <Text style={[s.chipText, value === o ? s.chipTextOn : null]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldDisabled: { opacity: 0.5 },
  value: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  placeholder: { color: colors.textMuted },
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  sheet: { flex: 1, backgroundColor: colors.surface },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
  },
  search: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, padding: 0 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error, textAlign: 'center' },
  none: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    padding: spacing.lg,
  },
  group: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  optionHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
});
