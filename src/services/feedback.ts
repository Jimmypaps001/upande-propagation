/**
 * Sound and haptics, ported from the Upande Coffee app's src/utils/feedback.ts.
 *
 * Two reasons it is worth having. A scan happens with the phone held at a tray,
 * often not being looked at, so the confirmation has to be something you can
 * hear and feel. And the difference between "found it" and "that label means
 * nothing here" must be audible without reading, or the second one gets missed
 * and the same tray is scanned again.
 *
 * Coffee uses expo-av, which SDK 54 removed. This is the same behaviour on
 * expo-audio: players are made once and replayed, because creating one per
 * scan adds a delay you can hear.
 *
 * Every call is best-effort. A phone with no audio, a muted ringer or a device
 * without a haptic motor must not break a scan, so nothing here throws.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

let successPlayer: AudioPlayer | null = null;
let errorPlayer: AudioPlayer | null = null;

export function preloadSounds(): void {
  try {
    successPlayer = createAudioPlayer(require('../../assets/sounds/scan-success.wav'));
    successPlayer.volume = 0.6;
    errorPlayer = createAudioPlayer(require('../../assets/sounds/scan-error.wav'));
    errorPlayer.volume = 0.6;
  } catch {
    // Sounds unavailable — carry on silently rather than fail a scan.
  }
}

export function unloadSounds(): void {
  try {
    successPlayer?.remove();
    errorPlayer?.remove();
  } catch {
    // Already gone.
  }
  successPlayer = null;
  errorPlayer = null;
}

async function play(player: AudioPlayer | null): Promise<void> {
  if (!player) return;
  try {
    await player.seekTo(0);
    player.play();
  } catch {
    // A sound that will not play is not a reason to stop.
  }
}

/** A label resolved: two taps rising, and the chime. */
export async function onScanSuccess(): Promise<void> {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }, 80);
  } catch {
    // No haptics on this device.
  }
  await play(successPlayer);
}

/** Nothing matched. Deliberately unlike the success pattern to the ear. */
export async function onScanError(): Promise<void> {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // No haptics on this device.
  }
  await play(errorPlayer);
}

/** A tap that did something — a tab, a drawer row, a filter. */
export function lightHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Something was written to the server. */
export function successHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
