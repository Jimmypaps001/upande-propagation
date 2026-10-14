import { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import { scan } from '@/src/services/batches-api';
import { onScanError, onScanSuccess } from '@/src/services/feedback';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * Scan a batch label, or type its name when the label will not read.
 *
 * A label that has spent three months under misting is not always scannable,
 * and a worker holding a tray should not be stuck because of it -- so the typed
 * route is a first-class way in, not a fallback buried in a menu.
 */
export default function Scan() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(drawer)');
  const toast = useToast();

  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [manual, setManual] = useState(false);

  // onBarcodeScanned fires every frame the code is in view. Without this the
  // same label opens a dozen lookups before the first one has come back.
  const locked = useRef(false);

  const resolve = async (code: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const res = await scan(code);
      if (res.kind === 'batch') {
        onScanSuccess();
        router.replace({ pathname: '/batch/[name]', params: { name: res.name } });
        return;
      }
      if (res.kind === 'variety') {
        onScanSuccess();
        router.replace({ pathname: '/batches', params: { variety: res.name } });
        return;
      }
      onScanError();
      toast.showError(`Nothing on this server matches "${res.code}".`);
      locked.current = false;
    } catch (e) {
      onScanError();
      toast.showError(e instanceof Error ? e.message : 'Could not look that up.');
      locked.current = false;
    } finally {
      setBusy(false);
    }
  };

  const onScanned = (r: BarcodeScanningResult) => {
    if (!r?.data) return;
    resolve(r.data.trim());
  };

  const granted = permission?.granted === true;

  return (
    <Screen title="Scan" leftIcon="menu" onPressLeft={() => drawer.openDrawer()} scroll={!granted || manual}>
      {!permission ? null : !granted ? (
        <View style={s.ask}>
          <Ionicons name="camera-outline" size={34} color={colors.textMuted} />
          <Text style={s.askText}>
            The camera reads the QR on a batch label. Nothing is recorded until you choose to.
          </Text>
          <Button label="Allow the camera" onPress={requestPermission} />
          <Button label="Type the batch name instead" variant="outline" onPress={() => setManual(true)} />
        </View>
      ) : manual ? null : (
        <View style={s.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
            onBarcodeScanned={busy ? undefined : onScanned}
          />
          <View style={s.reticle} pointerEvents="none" />
          <View style={s.hintWrap} pointerEvents="box-none">
            <Text style={s.hint}>{busy ? 'Looking it up…' : 'Point at the label'}</Text>
            <TouchableOpacity onPress={() => setManual(true)} style={s.typeBtn} activeOpacity={0.8}>
              <Text style={s.typeText}>Type it instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {manual || !granted ? (
        <View style={granted ? undefined : { marginTop: spacing.lg }}>
          <LabeledInput
            label="Batch or variety"
            value={typed}
            onChangeText={setTyped}
            placeholder="PB-2026-W32-0001"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Button
            label={busy ? 'Looking it up…' : 'Find it'}
            onPress={() => {
              locked.current = false;
              resolve(typed.trim());
            }}
            disabled={!typed.trim() || busy}
            loading={busy}
            style={{ marginTop: spacing.md }}
          />
          {granted ? (
            <Button
              label="Use the camera"
              variant="outline"
              onPress={() => setManual(false)}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  ask: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  askText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  cameraWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  reticle: {
    position: 'absolute',
    top: '26%',
    left: '14%',
    right: '14%',
    bottom: '34%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: borderRadius.lg,
  },
  hintWrap: { position: 'absolute', left: 0, right: 0, bottom: spacing.xl, alignItems: 'center', gap: spacing.md },
  hint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  typeBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  typeText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
});
