import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';

/**
 * Where this phone is, and what it is recording for.
 *
 * A phone lives in one propagation unit, so the unit is asked once and kept.
 * The plan changes with the season and is kept only so the home screen opens
 * where it was left.
 */
interface UnitState {
  hydrated: boolean;
  unit: string | null;
  plan: string | null;
  hydrate: () => Promise<void>;
  setUnit: (unit: string | null) => Promise<void>;
  setPlan: (plan: string | null) => Promise<void>;
}

export const useUnitStore = create<UnitState>((set) => ({
  hydrated: false,
  unit: null,
  plan: null,

  async hydrate() {
    const [unit, plan] = await Promise.all([
      storage.get(StorageKeys.unit),
      storage.get(StorageKeys.plan),
    ]);
    set({ hydrated: true, unit, plan });
  },

  async setUnit(unit) {
    if (unit) await storage.set(StorageKeys.unit, unit);
    else await storage.remove(StorageKeys.unit);
    set({ unit });
  },

  async setPlan(plan) {
    if (plan) await storage.set(StorageKeys.plan, plan);
    else await storage.remove(StorageKeys.plan);
    set({ plan });
  },
}));

/** The unit has been chosen, so the app can open on its work. */
export const setupComplete = (s: UnitState): boolean => !!s.unit;
