/**
 * The farm picker, ported from Upande SCP's PlacePicker (farm level only: a
 * nursery has no greenhouses to descend into).
 *
 * A single pill that opens a searchable list: "All farms", then each farm. The
 * pill reads "All farms" or the farm's name. Same markup, same keyboard
 * behaviour as SCP's.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { SearchInput } from "@/components/SearchInput";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HEADER_PILL } from "@/components/header-controls";
import { cn, matchesQuery } from "@/lib/utils";

export const ALL_FARMS_LABEL = "All farms";

export function PlacePicker({
  farms,
  value,
  onChange,
  allLabel = ALL_FARMS_LABEL,
  label = "Farm",
  className,
}: {
  farms: string[];
  value: string;
  onChange: (next: string) => void;
  allLabel?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const baseId = useId();

  const names = useMemo(() => farms.filter(Boolean), [farms]);
  const rows = useMemo(() => {
    const out: Array<{ id: string; farm: string; text: string }> = [];
    if (!query.trim()) out.push({ id: "all", farm: "", text: allLabel });
    for (const f of names) if (matchesQuery(f, query)) out.push({ id: `f:${f}`, farm: f, text: f });
    return out;
  }, [names, query, allLabel]);

  const selectedId = value ? `f:${value}` : "all";
  const pick = (farm: string) => {
    onChange(farm);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const i = rows.findIndex((r) => r.id === active);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const n = i < 0 ? (step > 0 ? 0 : rows.length - 1) : (i + step + rows.length) % rows.length;
      setActive(rows[n].id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[i] ?? rows[0];
      if (row) pick(row.farm);
    }
  };

  const listId = `${baseId}-list`;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(selectedId);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="listbox"
          className={cn(
            "inline-flex min-w-0 items-center justify-between border text-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            HEADER_PILL,
            className,
          )}
        >
          <span className="truncate">{value || allLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <SearchInput
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search farms"
          value={query}
          onChange={(v) => {
            setQuery(v);
            setActive(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search farms"
          className="mb-1.5"
        />
        <div id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
          {rows.length === 0 && <div className="px-2 py-3 text-center text-xs text-muted-foreground">No match</div>}
          {rows.map((r) => (
            <div
              key={r.id}
              role="option"
              aria-selected={r.id === selectedId}
              onMouseMove={() => active !== r.id && setActive(r.id)}
              onClick={() => pick(r.farm)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-sm",
                r.farm && "font-medium",
                r.id === active && "bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{r.text}</span>
              <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", r.id !== selectedId && "invisible")} />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
