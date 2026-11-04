import { useCallback, useEffect, useRef, useState } from "react";
import { markFor } from "@/lib/crops";

// One fetch per mark file; a crop with no file of its own falls back to the generic mark.
const cache = new Map<string, Promise<string | null>>();

function fetchSvg(src: string): Promise<string | null> {
  let p = cache.get(src);
  if (!p) {
    p = fetch(src, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    cache.set(src, p);
  }
  return p;
}

/**
 * The Propagation mark: the Upande disc and arrow at rest, and on hover the
 * cutting-to-seedling scene plays once and comes back to rest.
 *
 * The SVG is pure CSS that plays when it loads, so a replay is a fresh load: on
 * hover the <img> is pointed at a new blob URL of the same file (the same trick
 * the desk's app tile uses). Until then, and if anything fails, it is the plain
 * file.
 */
export function PropagationMark({ size = 48, title = "Upande Propagation", crop }: { size?: number; title?: string; crop?: string | null }) {
  const GENERIC = markFor(null);
  const wanted = markFor(crop);
  const [own, setOwn] = useState(true);
  const SRC = own ? wanted : GENERIC;
  const [src, setSrc] = useState(SRC);
  // A new crop gets its own scene; one with no file (the request fails) keeps the generic mark.
  useEffect(() => {
    setOwn(true);
    setSrc(wanted);
  }, [wanted]);
  const blob = useRef<string | null>(null);
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    void fetchSvg(SRC);
    return () => {
      if (blob.current) URL.revokeObjectURL(blob.current);
    };
  }, []);

  const replay = useCallback(() => {
    if (reduced) return;
    void fetchSvg(SRC).then((text) => {
      if (!text) return;
      const next = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
      if (blob.current) URL.revokeObjectURL(blob.current);
      blob.current = next;
      setSrc(next);
    });
  }, [reduced, SRC]);

  return (
    <img
      src={src}
      alt={title}
      width={size}
      height={size}
      draggable={false}
      onMouseEnter={replay}
      onFocus={replay}
      onError={() => {
        if (own && crop) {
          setOwn(false);
          setSrc(GENERIC);
        }
      }}
      className="block rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
