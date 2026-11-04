import { useMemo, useState, type ReactNode } from "react";
import { SearchInput } from "@/components/SearchInput";
import { ScrollTable, STICKY_HEAD } from "@/components/ScrollTable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/Panel";
import { RowsSkeleton } from "@/components/Loading";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  /** the plain text searched and sorted on; defaults to row[key] */
  value?: (row: T) => string | number | null | undefined;
  align?: "right";
  className?: string;
}

/**
 * A searchable, sortable table in a scroll box with its header kept.
 *
 * `href` makes a row a real link target (the first cell's content is wrapped by
 * the caller); clicking anywhere else in the row follows it in the same tab.
 */
export function DataTable<T>({
  columns,
  rows,
  loading,
  rowKey,
  rowHref,
  search = true,
  empty = "Nothing to show.",
  tall,
  toolbar,
}: {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  loading?: boolean;
  rowKey: (row: T, index: number) => string;
  rowHref?: (row: T) => string;
  search?: boolean;
  empty?: ReactNode;
  tall?: boolean;
  toolbar?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const cell = (c: Column<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.key]) as string | number | null | undefined;

  const shown = useMemo(() => {
    let out = rows ?? [];
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length) {
      out = out.filter((r) => {
        const hay = columns.map((c) => String(cell(c, r) ?? "")).join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) {
        out = [...out].sort((a, b) => {
          const x = cell(c, a);
          const y = cell(c, b);
          if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
          return String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }) * sort.dir;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort, columns]);

  return (
    <div className="flex flex-col gap-3">
      {search || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {search ? (
            <SearchInput value={q} onChange={setQ} placeholder="Search" aria-label="Search the table" className="max-w-xs" />
          ) : null}
          {toolbar}
          {rows ? (
            <span className="ml-auto text-[12px] tabular-nums text-[var(--sd-quiet)]">
              {shown.length.toLocaleString("en-US")} {shown.length === 1 ? "row" : "rows"}
            </span>
          ) : null}
        </div>
      ) : null}
      {loading && !rows ? (
        <RowsSkeleton rows={6} />
      ) : !shown.length ? (
        <Empty>{q ? "No rows match that search." : empty}</Empty>
      ) : (
        <ScrollTable tall={tall}>
          <Table>
            <TableHeader className={STICKY_HEAD}>
              <TableRow>
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    className={cn("cursor-pointer select-none whitespace-nowrap", c.align === "right" && "text-right", c.className)}
                    onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                  >
                    {c.label}
                    {sort?.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r, i) => {
                const href = rowHref?.(r);
                return (
                  <TableRow
                    key={rowKey(r, i)}
                    className={cn(href && "cursor-pointer")}
                    onClick={href ? () => (window.location.hash = href.replace(/^#/, "")) : undefined}
                  >
                    {columns.map((c) => (
                      <TableCell key={c.key} className={cn("whitespace-nowrap tabular-nums", c.align === "right" && "text-right", c.className)}>
                        {c.render ? c.render(r) : (cell(c, r) ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollTable>
      )}
    </div>
  );
}
