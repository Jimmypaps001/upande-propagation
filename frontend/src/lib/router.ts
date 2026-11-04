import { useCallback, useEffect, useState } from "react";

/**
 * Hash routing: `#/<view>` and `#/<view>/<name>` (a batch's detail).
 *
 * A hash router rather than a history one because Frappe serves the page at a
 * single route (/propagation_app); a path router would need a server-side
 * catch-all that does not exist.
 */
export const VIEWS = [
  "dashboard",
  "batches",
  "logs",
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
  view: View;
  /** the record a detail page shows (a batch name), if any */
  arg: string | null;
}

/** `#/batches/PB-0001` -> `{view: "batches", arg: "PB-0001"}`. Anything unreadable
 *  degrades to the dashboard rather than to an error screen. */
export function parseRoute(hash: string): Route {
  const raw = (hash || "").replace(/^#\/?/, "").split("?")[0];
  const [view, ...rest] = raw.split("/").filter(Boolean);
  const v = (view || "").toLowerCase();
  const arg = rest.length ? decodeURIComponent(rest.join("/")) : null;
  return { view: isView(v) ? v : DEFAULT_VIEW, arg: isView(v) ? arg : null };
}

export function routeHash(view: View = DEFAULT_VIEW, arg?: string | null): string {
  return `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
}

export function useRoute(): [Route, (view: View, arg?: string | null) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((view: View = DEFAULT_VIEW, arg?: string | null) => {
    const h = routeHash(view, arg);
    if (window.location.hash !== h) window.location.hash = h;
  }, []);

  return [route, navigate];
}
