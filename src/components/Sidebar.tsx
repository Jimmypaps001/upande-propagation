import type { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { EVENTS, type EventKey } from '@/src/services/propagation-api';
import { lightHaptic } from '@/src/services/feedback';
import { useAuthStore } from '@/src/stores/authStore';
import { useUnitStore } from '@/src/stores/unitStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The sidebar. Sections, not colours: the theme forbids per-feature accents,
 * so what a row is gets carried by its icon and the group it sits in.
 */
const WORK: { href: Href; label: string; icon: IconName }[] = [
  { href: '/', label: 'Home', icon: 'home-outline' },
  { href: '/record', label: 'Record', icon: 'create-outline' },
  { href: '/arrival', label: 'Arrivals', icon: 'cube-outline' },
];

/** Batches on the bench: a different chain, and a different server app. */
const BENCH: { href: Href; label: string; icon: IconName }[] = [
  { href: '/unit', label: 'Unit', icon: 'business-outline' },
  { href: '/batches', label: 'Batches', icon: 'layers-outline' },
  { href: '/scan', label: 'Scan a label', icon: 'qr-code-outline' },
];

/** What the unit is working to, as opposed to what it is doing today. */
const PLAN: { href: Href; label: string; icon: IconName }[] = [
  { href: '/plans', label: 'Plans', icon: 'calendar-outline' },
  { href: '/deliveries', label: 'To the farms', icon: 'bus-outline' },
  { href: '/reports', label: 'Reports', icon: 'stats-chart-outline' },
  { href: '/protocol', label: 'Protocol', icon: 'document-text-outline' },
  { href: '/motherstock', label: 'Motherstock', icon: 'git-branch-outline' },
];

function eventIcon(key: EventKey): IconName {
  if (key === 'TC Received') return 'cube-outline';
  if (key === 'Roots Withdrawn') return 'snow-outline';
  if (key === 'Plants To Farm') return 'leaf-outline';
  return 'alert-circle-outline';
}

export function Sidebar(props: DrawerContentComponentProps) {
  const router = useRouter();
  const path = usePathname();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  const unit = useUnitStore((s) => s.unit);

  const go = (href: Href) => {
    lightHaptic();
    props.navigation.closeDrawer();
    router.push(href);
  };

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.identity}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(fullName ?? email)}</Text>
        </View>
        <Text style={s.name} numberOfLines={1}>
          {fullName ?? 'Signed in'}
        </Text>
        {email ? (
          <Text style={s.email} numberOfLines={1}>
            {email}
          </Text>
        ) : null}
        {unit ? (
          <View style={s.unitChip}>
            <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
            <Text style={s.unitText} numberOfLines={1}>
              {unit}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={s.group}>
        {WORK.map((l) => (
          <Row
            key={String(l.href)}
            icon={l.icon}
            label={l.label}
            active={isActive(path, String(l.href))}
            onPress={() => go(l.href)}
          />
        ))}
      </View>

      <Text style={s.groupLabel}>On the bench</Text>
      <View style={s.group}>
        {BENCH.map((l) => (
          <Row
            key={String(l.href)}
            icon={l.icon}
            label={l.label}
            active={isActive(path, String(l.href))}
            onPress={() => go(l.href)}
          />
        ))}
      </View>

      <Text style={s.groupLabel}>The plan</Text>
      <View style={s.group}>
        {PLAN.map((l) => (
          <Row
            key={String(l.href)}
            icon={l.icon}
            label={l.label}
            active={isActive(path, String(l.href))}
            onPress={() => go(l.href)}
          />
        ))}
      </View>

      <Text style={s.groupLabel}>Record something</Text>
      <View style={s.group}>
        {EVENTS.map((e) => (
          <Row
            key={e.key}
            icon={eventIcon(e.key)}
            label={e.title}
            onPress={() => {
              props.navigation.closeDrawer();
              router.push({ pathname: '/record/[event]', params: { event: e.key } });
            }}
          />
        ))}
      </View>

      <View style={s.spacer} />

      <View style={s.group}>
        <Row
          icon="settings-outline"
          label="Settings"
          active={isActive(path, '/settings')}
          onPress={() => go('/settings')}
        />
        <Row
          icon="log-out-outline"
          label="Sign out"
          danger
          onPress={async () => {
            props.navigation.closeDrawer();
            await logout();
            router.replace('/login');
          }}
        />
      </View>
    </DrawerContentScrollView>
  );
}

/** "/" only matches "/" exactly; anything else matches its own subtree. */
function isActive(path: string, href: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(href + '/');
}

function initials(who: string | null): string {
  if (!who) return '?';
  const parts = who.trim().split(/[\s@._]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

function Row({
  icon,
  label,
  active,
  danger,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const tint = danger ? colors.danger : active ? colors.text : colors.textSecondary;
  return (
    <TouchableOpacity
      style={[s.row, active ? s.rowActive : null]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={[s.rowText, { color: tint }, active ? s.rowTextActive : null]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  content: { paddingTop: 0, paddingBottom: spacing.xl, flexGrow: 1 },
  identity: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  email: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  unitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  unitText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary, maxWidth: 170 },
  groupLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  group: { paddingHorizontal: spacing.sm, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  rowActive: { backgroundColor: colors.surfaceAlt },
  rowText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm },
  rowTextActive: { fontFamily: fontFamily.semiBold },
  spacer: { flex: 1, minHeight: spacing.xl },
});
