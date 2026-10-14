import type { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { EVENTS, type EventKey } from '@/src/services/propagation-api';
import { useUnitStore } from '@/src/stores/unitStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function iconFor(key: EventKey): IconName {
  if (key === 'TC Received') return 'cube-outline';
  if (key === 'Roots Withdrawn') return 'snow-outline';
  if (key === 'Plants To Farm') return 'leaf-outline';
  return 'alert-circle-outline';
}

/**
 * The four things this unit can report, given room to say what each one is.
 * Home keeps the same four as quick tiles; this is the deliberate way in.
 */
export default function Record() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const unit = useUnitStore((s) => s.unit);
  const plan = useUnitStore((s) => s.plan);

  return (
    <Screen title="Record" leftIcon="menu" onPressLeft={() => drawer.openDrawer()}>
      <Text style={s.intro}>
        What happened in {unit ?? 'this unit'}. Each entry is written against the propagation plan
        the home screen is showing.
      </Text>

      {plan ? (
        <View style={s.context}>
          <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
          <Text style={s.contextText} numberOfLines={1}>
            {plan}
          </Text>
        </View>
      ) : (
        <View style={s.context}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
          <Text style={[s.contextText, { color: colors.error }]}>
            No plan chosen yet — open Home first.
          </Text>
        </View>
      )}

      <View style={s.list}>
        {EVENTS.map((e) => (
          <TouchableOpacity
            key={e.key}
            style={s.row}
            activeOpacity={0.7}
            disabled={!plan}
            onPress={() => router.push({ pathname: '/record/[event]', params: { event: e.key } })}
          >
            <View style={s.rowIcon}>
              <Ionicons name={iconFor(e.key)} size={22} color={plan ? colors.text : colors.textMuted} />
            </View>
            <View style={s.rowBody}>
              <Text style={[s.rowTitle, !plan ? { color: colors.textMuted } : null]}>{e.title}</Text>
              <Text style={s.rowBlurb}>{e.blurb}</Text>
              <Text style={s.rowCounts}>
                Counted in {e.counts === 'units' ? 'units' : 'plants'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.lg,
  },
  contextText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    maxWidth: 240,
  },
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  rowBlurb: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  rowCounts: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
