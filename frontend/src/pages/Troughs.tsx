import { Frame } from "@/components/Frame";
import { Panel, Empty } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { StatusPill } from "@/components/StatusPill";
import { troughBoard, type TroughBoard, type TroughRow } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  Free: "border-[var(--sd-line)] bg-[var(--sd-card)]",
  Occupied: "border-[var(--sd-data-green)]/40 bg-[var(--sd-data-green)]/[0.06]",
  "Out of Service": "border-[var(--sd-line)] bg-[var(--sd-bg-soft)] opacity-70",
};

/** The troughs of each unit as tiles: free, standing with a crop (and how full), or out of service. */
function Board({ troughs }: { troughs: TroughRow[] }) {
  if (!troughs.length) return <Empty>No troughs are set up. Add them in the desk under Propagation Trough.</Empty>;
  const units = [...new Set(troughs.map((t) => t.unit ?? "No unit"))];
  return (
    <div className="flex flex-col gap-5">
      {units.map((u) => (
        <section key={u}>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--sd-quiet)]">{u}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {troughs
              .filter((t) => (t.unit ?? "No unit") === u)
              .map((t) => (
                <div key={t.name} className={cn("flex flex-col gap-1.5 rounded-[var(--sd-radius-lg)] border p-3", TONE[t.state])} title={t.setting ?? undefined}>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="text-[13px] font-semibold">{t.trough_name}</span>
                    <StatusPill text={t.state} />
                  </div>
                  <div className="text-[12px] text-[var(--sd-muted)]">
                    {t.state === "Occupied" ? `${t.variety ?? "—"} · ${qty(t.plants)} plants` : `Holds ${qty(t.capacity)}`}
                  </div>
                  {t.state === "Occupied" ? (
                    <>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--sd-bg-soft)]" role="img" aria-label={`${t.fill_pct ?? 0}% full`}>
                        <div className="h-full rounded-full bg-[var(--sd-data-green)]" style={{ width: `${Math.min(100, t.fill_pct ?? 0)}%` }} />
                      </div>
                      <div className="text-[11px] text-[var(--sd-quiet)]">{t.frees ? `Free from ${shortDate(t.frees)}` : `Set ${shortDate(t.set_date)}`}</div>
                    </>
                  ) : null}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function Troughs() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const r = useLoad(() => troughBoard(farm, cropKey), [farm, cropKey]);
  const d: TroughBoard | null = r.data;
  const s = d?.summary;

  const cols: Column<TroughBoard["settings"][number]>[] = [
    { key: "name", label: "Setting" },
    { key: "trough", label: "Trough" },
    { key: "propagation_unit", label: "Unit" },
    { key: "variety", label: "Variety" },
    { key: "form", label: "Form" },
    { key: "set_date", label: "Set", render: (x) => shortDate(x.set_date) },
    { key: "plants", label: "Plants", align: "right", render: (x) => qty(x.plants) },
    { key: "plants_lifted", label: "Lifted", align: "right", render: (x) => qty(x.plants_lifted) },
    { key: "plants_remaining", label: "Remaining", align: "right", render: (x) => qty(x.plants_remaining) },
    { key: "fill_pct", label: "Fill", align: "right", render: (x) => (x.fill_pct == null ? "—" : `${qty(x.fill_pct, 0)}%`) },
    { key: "freed_on", label: "Free from", render: (x) => shortDate(x.freed_on) },
    { key: "status", label: "Status", render: (x) => <StatusPill text={x.status} /> },
  ];

  return (
    <Frame
      view="troughs"
      description="Every trough, and what a Trough Setting says is standing in it now."
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid>
        <KpiCard label="Troughs" value={s?.troughs ?? 0} hint={s ? `${qty(s.capacity)} plants of room` : undefined} loading={r.loading && !d} />
        <KpiCard label="Occupied" value={s?.occupied ?? 0} tone="good" loading={r.loading && !d} />
        <KpiCard label="Free" value={s?.free ?? 0} loading={r.loading && !d} />
        <KpiCard label="Plants standing" value={s?.plants ?? 0} tone="good" loading={r.loading && !d} />
      </KpiGrid>
      <Panel title="Trough board">
        <Board troughs={d?.troughs ?? []} />
      </Panel>
      <Panel title="Trough settings" description="The record of what went into each trough">
        <DataTable columns={cols} rows={d?.settings ?? null} loading={r.loading} rowKey={(x) => x.name} empty="No trough settings recorded." />
      </Panel>
    </Frame>
  );
}
