import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { ToastProvider } from '@/src/components/Toast';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { useAuthStore } from '@/src/stores/authStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import { setupComplete, useUnitStore } from '@/src/stores/unitStore';

// Hold the native splash until fonts + auth hydrated.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => s.hasSession);
  const hydrate = useAuthStore((s) => s.hydrate);
  const initNetwork = useNetworkStore((s) => s.init);
  const hydrateUnit = useUnitStore((s) => s.hydrate);
  const unitHydrated = useUnitStore((s) => s.hydrated);
  const setUp = useUnitStore(setupComplete);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    hydrate();
    initNetwork();
    // The unit is needed before sign-in, so the setup screen can offer it.
    hydrateUnit();
  }, [hydrate, initNetwork, hydrateUnit]);

  useEffect(() => {
    if (fontsLoaded && hydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, hydrated]);

  // Auth gate — login, then the unit, then the work.
  useEffect(() => {
    if (!hydrated || !unitHydrated) return;
    const first = segments[0] as string | undefined;

    if (!hasSession) {
      if (first !== 'login') router.replace('/login');
      return;
    }
    if (!setUp) {
      if (first === 'login' || first === undefined) router.replace('/setup');
      return;
    }
    if (first === 'login') router.replace('/');
  }, [hydrated, unitHydrated, hasSession, setUp, segments, router]);

  if (!fontsLoaded || !hydrated) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="record/[event]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
          <Stack.Screen name="login" />
        </Stack>
        <OfflineBanner />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
