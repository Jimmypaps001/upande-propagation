import { useCallback, useEffect, useRef, useState } from "react";
import { isError, type Envelope } from "@/lib/frappe";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Run an endpoint call on mount and whenever `deps` change; keep the previous
 * answer on screen while the next one loads. Failure comes back as a string,
 * never a throw, so every page has one thing to check.
 */
export function useLoad<T>(fn: () => Promise<Envelope<T>>, deps: unknown[]): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    void fn().then((r) => {
      if (mine !== seq.current) return;
      if (isError(r)) {
        setError(r.error);
        setData(null);
      } else {
        setError(null);
        setData(r as T);
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
