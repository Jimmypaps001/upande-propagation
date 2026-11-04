import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { farms as loadFarms } from "@/lib/api";
import { isError } from "@/lib/frappe";

/**
 * The farm the whole app is filtered to. A farm here is the company the nursery
 * books to (every propagation endpoint takes `company`), "" meaning all farms.
 * The last pick is remembered in this browser, like SCP's place picker.
 */
const KEY = "propagation.farm";

interface FarmState {
  farm: string;
  setFarm: (f: string) => void;
  farms: string[];
}

const Ctx = createContext<FarmState>({ farm: "", setFarm: () => {}, farms: [] });

function read(): string {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function FarmProvider({ children }: { children: ReactNode }) {
  const [farm, setFarmState] = useState<string>(read);
  const [farms, setFarms] = useState<string[]>([]);

  useEffect(() => {
    void loadFarms().then((r) => {
      if (!isError(r)) setFarms((r as Array<{ name: string }>).map((c) => c.name));
    });
  }, []);

  const setFarm = useCallback((f: string) => {
    setFarmState(f);
    try {
      if (f) window.localStorage.setItem(KEY, f);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* private mode: the pick just is not remembered */
    }
  }, []);

  // A remembered farm that no longer exists is dropped once the list is known.
  useEffect(() => {
    if (farm && farms.length && !farms.includes(farm)) setFarmState("");
  }, [farm, farms]);

  const value = useMemo(() => ({ farm, setFarm, farms }), [farm, setFarm, farms]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useFarm = () => useContext(Ctx);
