import { useRef, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { lightHaptic, successHaptic } from '@/src/services/feedback';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface PhotoCaptureProps {
  label: string;
  /** What this picture is for, in a line. */
  hint?: string;
  /** Already taken, or already on the document. */
  uri: string | null;
  onCapture: (uri: string) => void;
  onClear?: () => void;
  /** Draw it as something the next step needs, rather than an extra. */
  required?: boolean;
}

/**
 * One photo, taken on the spot.
 *
 * expo-camera rather than a picker: the thing being photographed is in the
 * person's other hand, and a round trip through the gallery is a round trip
 * through every other picture on the phone.
 *
 * The picture is held as a local uri and uploaded by whoever asked for it,
 * because the document it attaches to often does not exist yet when the
 * shutter goes.
 */
export function PhotoCapture({
  label,
  hint,
  uri,
  onCapture,
  onClear,
  required,
}: PhotoCaptureProps) {
  const [open, setOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    lightHaptic();
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setOpen(true);
  };

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const shot = await camera.current?.takePictureAsync({ quality: 0.5 });
      if (shot?.uri) {
        successHaptic();
        onCapture(shot.uri);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>
        {label}
        {required && !uri ? <Text style={s.needed}>  needed here</Text> : null}
      </Text>

      {uri ? (
        <View style={s.taken}>
          <Image source={{ uri }} style={s.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={s.takenText}>Taken</Text>
            {hint ? <Text style={s.hint}>{hint}</Text> : null}
          </View>
          <TouchableOpacity onPress={start} hitSlop={8} style={s.iconBtn}>
            <Ionicons name="camera-reverse-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          {onClear ? (
            <TouchableOpacity onPress={onClear} hitSlop={8} style={s.iconBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity
          style={[s.empty, required ? s.emptyNeeded : null]}
          activeOpacity={0.7}
          onPress={start}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons
            name="camera-outline"
            size={22}
            color={required ? colors.root : colors.textSecondary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[s.emptyText, required ? { color: colors.root } : null]}>
              Take a picture
            </Text>
            {hint ? <Text style={s.hint}>{hint}</Text> : null}
          </View>
        </TouchableOpacity>
      )}

      {permission && !permission.granted && !permission.canAskAgain ? (
        <Text style={s.denied}>
          The camera is turned off for this app. Turn it on in the phone&rsquo;s settings.
        </Text>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={s.cameraRoot} edges={['top', 'bottom']}>
          <CameraView ref={camera} style={s.camera} facing="back" />
          <View style={s.bar}>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10} style={s.barBtn}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={shoot}
              disabled={busy}
              style={[s.shutter, busy ? { opacity: 0.5 } : null]}
              accessibilityRole="button"
              accessibilityLabel="Take the picture"
            >
              <View style={s.shutterInner} />
            </TouchableOpacity>
            <View style={s.barBtn} />
          </View>
          <Text style={s.cameraHint}>{hint ?? label}</Text>
        </SafeAreaView>
      </Modal>
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
  needed: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.root },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyNeeded: { borderColor: colors.root, backgroundColor: colors.rootSoft },
  emptyText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.textSecondary },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  taken: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  thumb: { width: 48, height: 48, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceAlt },
  takenText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  iconBtn: { padding: spacing.sm },
  denied: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warning,
    marginTop: spacing.xs,
  },
  cameraRoot: { flex: 1, backgroundColor: '#000000' },
  camera: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  barBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF' },
  cameraHint: {
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: '#FFFFFFAA',
    paddingBottom: spacing.md,
  },
});
