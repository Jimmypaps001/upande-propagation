import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { listUnits } from '@/src/services/propagation-api';
import { useUnitStore } from '@/src/stores/unitStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * Asked once. A phone lives in one propagation unit, and everything it records
 * is recorded there, so this is the first thing after signing in and never
 * asked again unless somebody changes it in settings.
 */
export default function Setup() {
  const [units, setUnits] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setUnit = useUnitStore((s) => s.setUnit);
  const current = useUnitStore((s) => s.unit);
  const router = useRouter();

  // Nothing is set before the request goes out, so the effect body itself
  // never calls setState and cannot cascade a render.
  const load = useCallback(() => {
    listUnits()
      .then((rows) => {
        setError(null);
        setUnits(rows);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the units.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const choose = async (unit: string) => {
    await setUnit(unit);
    router.replace('/');
  };

  return (
    <Screen title="Which unit?" loading={units === null && !error} error={error} onRetry={load}>
      <Text style={s.blurb}>
        Everything this phone records is recorded here. It is asked once.
      </Text>
      {(units ?? []).map((u) => (
        <TouchableOpacity key={u} style={[s.row, current === u && s.rowOn]} onPress={() => choose(u)}>
          <Text style={s.rowText}>{u}</Text>
        </TouchableOpacity>
      ))}
      {units && units.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>
            No warehouse on this server is marked as a propagation unit, so there is nowhere to
            record against yet.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  blurb: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowOn: { borderColor: colors.primary, borderWidth: 2 },
  rowText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  empty: { padding: spacing.lg },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
