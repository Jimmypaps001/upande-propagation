import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { crops as loadCrops, type CropInfo } from "@/lib/api";
import { isError } from "@/lib/frappe";
import { parseRoute, routeHash, type View } from "@/lib/router";

/**
 * The crop the app is showing, taken from the route (`#/<crop_key>/<view>`), and the list of crops it
 * can show. No crop in the route is "All crops": the unmapped records are only there.
 */
interface CropState {
  /** the open crop's key, or "" for all crops */
  cropKey: string;
  crop: CropInfo | null;
  crops: CropInfo[];
  ready: boolean;
}

const Ctx = createContext<CropState>({ cropKey: "", crop: null, crops: [], ready: false });

export function CropProvider({ cropKey, children }: { cropKey: string; children: ReactNode }) {
  const [crops, setCrops] = useState<CropInfo[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadCrops().then((r) => {
      if (!isError(r)) setCrops((r as { crops: CropInfo[] }).crops);
      setReady(true);
    });
  }, []);

  const value = useMemo<CropState>(
    () => ({ cropKey, crop: crops.find((c) => c.crop_key === cropKey) ?? null, crops, ready }),
    [cropKey, crops, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCrop = () => useContext(Ctx);

/** The hash for `view` under the crop that is open now (links inside pages use this). */
export function useHref() {
  const { cropKey } = useCrop();
  return (view: View, arg?: string | null) => routeHash(view, arg, cropKey || null);
}

/** Open the same page under another crop ("" is All crops). A record's own page goes back to its list. */
export function switchCrop(key: string) {
  const r = parseRoute(window.location.hash);
  const h = routeHash(r.view, r.view === "batches" ? null : r.arg, key || null);
  if (window.location.hash !== h) window.location.hash = h;
}

export { parseRoute };

// The crop's own loader file; the generic one stands in when a crop has none (see `loaderFor`).
const BASE = "/assets/upande_propagation/images/";
export const GENERIC_LOADER = `${BASE}propagation_logo_loader.svg`;
export const loaderFor = (key?: string | null) => (key ? `${BASE}propagation_logo_${key}_loader.svg` : GENERIC_LOADER);
export const markFor = (key?: string | null) => (key ? `${BASE}propagation_logo_${key}.svg` : `${BASE}propagation_logo.svg`);
