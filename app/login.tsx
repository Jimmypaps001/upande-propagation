import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useAuthStore } from '@/src/stores/authStore';
import { storage, StorageKeys } from '@/src/services/storage';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

export default function Login() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);

  // The server and the email almost never change between shifts, so they come
  // back filled in and only the password is asked for.
  useEffect(() => {
    storage.get(StorageKeys.instanceUrlBackup).then((v) => v && setUrl(v));
    storage.get(StorageKeys.emailBackup).then((v) => v && setEmail(v));
  }, []);

  const canSubmit = !!url.trim() && !!email.trim() && !!password && !busy;

  return (
    <Screen>
      <View style={s.head}>
        <Image source={require('@/assets/images/upande_logo.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>Propagation</Text>
        <Text style={s.sub}>Record what the unit received, and what it sent out.</Text>
      </View>

      <LabeledInput
        label="Server"
        value={url}
        onChangeText={setUrl}
        placeholder="marginpar.frappe.cloud"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <LabeledInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@upande.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <LabeledInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        onSubmitEditing={() => canSubmit && login(url, email.trim(), password)}
        returnKeyType="go"
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Button
        label={busy ? 'Signing in…' : 'Sign in'}
        onPress={() => login(url, email.trim(), password)}
        disabled={!canSubmit}
        loading={busy}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.xs },
  logo: { width: 140, height: 48, marginBottom: spacing.sm },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
  },
});
