import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  good: "bg-[var(--sd-data-green)]/12 text-[var(--sd-data-green)]",
  warn: "bg-[var(--sd-data-amber)]/15 text-[#a86a0a]",
  bad: "bg-[var(--sd-data-red)]/10 text-[var(--sd-data-red)]",
  info: "bg-[var(--sd-data-cyan)]/12 text-[#1b7fb0]",
  quiet: "bg-[var(--sd-ink)]/[0.06] text-[var(--sd-muted)]",
};

const WORDS: Array<[RegExp, keyof typeof TONES]> = [
  [/^(fulfilled|completed|accepted|passed|standing|free|healthy|active|good|sale|in stock)$/i, "good"],
  [/^(in progress|partially|partly|submitted|ready|occupied|checking|pending|internal planting|rooting|nursery)/i, "info"],
  [/^(overdue|rejected|failed|out of service|cancelled|dead|held|diseased)/i, "bad"],
  [/^(draft|high|urgent|warning|stressed|partly lifted)/i, "warn"],
];

export function toneOf(text: string): keyof typeof TONES {
  return WORDS.find(([re]) => re.test(text.trim()))?.[1] ?? "quiet";
}

/** A short coloured status word. The colour is chosen from the word, so every page agrees. */
export function StatusPill({ text, tone }: { text: string | null | undefined; tone?: keyof typeof TONES }) {
  if (!text) return <span className="text-[var(--sd-quiet)]">{"—"}</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium", TONES[tone ?? toneOf(text)])}>
      {text}
    </span>
  );
}
