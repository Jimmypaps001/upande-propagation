import { Drawer } from 'expo-router/drawer';
import { Sidebar } from '@/src/components/Sidebar';
import { colors } from '@/src/theme';

/**
 * The sidebar sits outside the tabs so it can reach every screen, including
 * the ones the tab bar has no room for. Headers are off throughout: each
 * screen draws its own through <Screen/>, which carries the hamburger.
 */
export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <Sidebar {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        swipeEdgeWidth: 48,
        drawerStyle: { backgroundColor: colors.surface, width: 292 },
        overlayColor: colors.overlay,
      }}
    >
      <Drawer.Screen name="(tabs)" />
    </Drawer>
  );
}
