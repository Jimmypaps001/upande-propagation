import { useCallback, useEffect, useRef, useState } from "react";

const SRC = "/assets/upande_propagation/images/propagation_logo.svg";

let svgText: string | null = null;
let loading: Promise<string | null> | null = null;

function fetchSvg(): Promise<string | null> {
  if (svgText) return Promise.resolve(svgText);
  if (!loading) {
    loading = fetch(SRC, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => (svgText = t))
      .catch(() => null);
  }
  return loading;
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
export function PropagationMark({ size = 48, title = "Upande Propagation" }: { size?: number; title?: string }) {
  const [src, setSrc] = useState(SRC);
  const blob = useRef<string | null>(null);
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    void fetchSvg();
    return () => {
      if (blob.current) URL.revokeObjectURL(blob.current);
    };
  }, []);

  const replay = useCallback(() => {
    if (reduced) return;
    void fetchSvg().then((text) => {
      if (!text) return;
      const next = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
      if (blob.current) URL.revokeObjectURL(blob.current);
      blob.current = next;
      setSrc(next);
    });
  }, [reduced]);

  return (
    <img
      src={src}
      alt={title}
      width={size}
      height={size}
      draggable={false}
      onMouseEnter={replay}
      onFocus={replay}
      className="block rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
