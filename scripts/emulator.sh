#!/usr/bin/env bash
# Start the app on the local Android emulator.
#
#   ./scripts/emulator.sh          boot the emulator, serve the app, install Expo Go
#   ./scripts/emulator.sh --window show the emulator window (default is headless)
#   ./scripts/emulator.sh --stop   shut the emulator down
#
# Why Expo Go and not `expo run:android`: this machine has no JDK, so Gradle
# cannot run. Every native module this app uses (camera, secure-store,
# reanimated, gesture-handler, screens, safe-area-context, async-storage,
# audio) is bundled inside Expo Go for SDK 57, so a dev build buys nothing
# here. The two config plugins only shape a native build; Expo Go ignores them.
#
# Memory: this box has ~7G with little free, so the emulator is given 1536M and
# marked as the first thing the OOM killer should take. If the machine runs out
# the emulator dies -- not Chrome, not the bench, not the site under test.
set -euo pipefail

AVD=prop_api36
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$SDK/platform-tools/adb"
EMU="$SDK/emulator/emulator"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${TMPDIR:-/tmp}/upande-emulator.log"

# Node 20: the default on this machine is 18, which Expo SDK 57 refuses.
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"

stop() {
  "$ADB" -s emulator-5554 emu kill 2>/dev/null || true
  pkill -f "qemu-system-x86_64.*$AVD" 2>/dev/null || true
  echo "emulator stopped"
}

[ "${1:-}" = "--stop" ] && { stop; exit 0; }

WINDOW=(-no-window)
[ "${1:-}" = "--window" ] && WINDOW=()

# ---------------------------------------------------------------- the emulator
if "$ADB" devices | grep -q emulator-5554; then
  echo "emulator already up"
else
  echo "booting $AVD (log: $LOG)"
  nohup "$EMU" -avd "$AVD" "${WINDOW[@]}" \
    -no-audio -no-boot-anim -no-snapshot \
    -gpu swiftshader_indirect -memory 1536 -cores 4 \
    -netdelay none -netspeed full > "$LOG" 2>&1 &
  pid=$!
  sleep 5
  # Volunteer as the OOM killer's first choice, children included.
  for p in $(pgrep -P "$pid" 2>/dev/null) "$pid"; do
    echo 1000 > "/proc/$p/oom_score_adj" 2>/dev/null || true
  done

  printf 'waiting for boot'
  for _ in $(seq 1 60); do
    [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
    printf '.'; sleep 10
  done
  echo
  [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] \
    || { echo "the emulator did not finish booting -- see $LOG"; tail -20 "$LOG"; exit 1; }
fi

"$ADB" shell input keyevent 82 >/dev/null 2>&1 || true   # dismiss the lock screen

# Metro on 8081 and the Frappe site on 8001, both reachable from inside the
# guest as localhost. 10.0.2.2 would also reach the host, but a reverse keeps
# the URL the same one a phone on the LAN would use.
"$ADB" reverse tcp:8081 tcp:8081 >/dev/null
"$ADB" reverse tcp:8001 tcp:8001 >/dev/null
echo "ports reversed: 8081 (metro), 8001 (frappe)"

# --------------------------------------------------------------------- the app
cd "$APP_DIR"
echo
echo "Sign in with the server  localhost:8001  (or 10.0.2.2:8001)"
echo
exec npx expo start --android --localhost --clear
