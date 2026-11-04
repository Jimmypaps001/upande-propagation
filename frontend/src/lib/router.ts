import { useCallback, useEffect, useState } from "react";

/**
 * Hash routing: `#/<view>`, `#/<view>/<name>` (a batch's detail), and either of those under a crop:
 * `#/<crop_key>/<view>[/<name>]`. No crop segment means "All crops".
 *
 * A hash router rather than a history one because Frappe serves the page at a single route
 * (/propagation_app); a path router would need a server-side catch-all that does not exist.
 */
export const VIEWS = [
  "dashboard",
  "batches",
  "logs",
  "plans",
  "motherstock",
  "actuals",
  "receipts",
  "requests",
  "dispatch",
  "troughs",
  "consignments",
  "trials",
  "mother-blocks",
  "traceability",
] as const;

export type View = (typeof VIEWS)[number];

export const DEFAULT_VIEW: View = "dashboard";

const KNOWN: ReadonlySet<string> = new Set<string>(VIEWS);

export function isView(v: string): v is View {
  return KNOWN.has(v);
}

export interface Route {
  /** the crop_key, or null for All crops */
  crop: string | null;
  view: View;
  /** the record a detail page shows (a batch name), if any */
  arg: string | null;
}

/** `#/standard-roses/batches/PB-0001` -> `{crop: "standard-roses", view: "batches", arg: "PB-0001"}`.
 *  Anything unreadable degrades to the dashboard rather than to an error screen. */
export function parseRoute(hash: string): Route {
  const parts = (hash || "").replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  let crop: string | null = null;
  if (parts.length && !isView(parts[0].toLowerCase())) crop = decodeURIComponent(parts.shift() as string);
  const v = (parts.shift() || "").toLowerCase();
  const view = isView(v) ? v : DEFAULT_VIEW;
  const arg = isView(v) && parts.length ? decodeURIComponent(parts.join("/")) : null;
  return { crop, view, arg };
}

export function routeHash(view: View = DEFAULT_VIEW, arg?: string | null, crop?: string | null): string {
  return `#/${crop ? `${encodeURIComponent(crop)}/` : ""}${view}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
}

export function useRoute(): [Route, (view: View, arg?: string | null, crop?: string | null) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((view: View = DEFAULT_VIEW, arg?: string | null, crop?: string | null) => {
    const h = routeHash(view, arg, crop);
    if (window.location.hash !== h) window.location.hash = h;
  }, []);

  return [route, navigate];
}
