import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { useAuthStore } from '@/src/stores/authStore';
import { useUnitStore } from '@/src/stores/unitStore';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

export default function Settings() {
  const router = useRouter();
  const { email, fullName, baseUrl, logout } = useAuthStore();
  const unit = useUnitStore((s) => s.unit);
  const setUnit = useUnitStore((s) => s.setUnit);

  return (
    <Screen title="Settings" leftIcon="arrow-back" onPressLeft={() => router.back()}>
      <Card title="Signed in">
        <Row label="Name" value={fullName ?? '—'} />
        <Row label="Email" value={email ?? '—'} />
        <Row label="Server" value={baseUrl ?? '—'} />
      </Card>

      <Card title="This phone">
        <Row label="Propagation unit" value={unit ?? 'not set'} />
        <Button
          label="Change unit"
          variant="outline"
          onPress={async () => {
            await setUnit(null);
            router.replace('/setup');
          }}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <Button
        label="Sign out"
        variant="outline"
        color={colors.danger}
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, gap: spacing.md },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  value: { flex: 1, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
});
