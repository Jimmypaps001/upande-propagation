import { useState } from "react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Donut } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { TogglePill } from "@/components/TogglePill";
import { requestsBook, type RequestRow } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

export function Requests() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const [closed, setClosed] = useState(false);
  const r = useLoad(() => requestsBook(farm, closed, cropKey), [farm, closed, cropKey]);
  const d = r.data;
  const rows = d?.requests ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const items = (d?.rows ?? []).filter((x) => x.parent === open);

  const cols: Column<RequestRow>[] = [
    { key: "name", label: "Request", render: (x) => <button type="button" className="font-medium text-[var(--sd-ink)] hover:underline" onClick={() => setOpen(open === x.name ? null : x.name)}>{x.name}</button> },
    { key: "farm", label: "Farm" },
    { key: "priority", label: "Priority", render: (x) => <StatusPill text={x.priority} /> },
    { key: "request_date", label: "Raised", render: (x) => shortDate(x.request_date) },
    { key: "required_by_date", label: "Needed by", render: (x) => shortDate(x.required_by_date) },
    { key: "total_qty_requested", label: "Requested", align: "right", render: (x) => qty(x.total_qty_requested) },
    { key: "total_qty_dispatched", label: "Dispatched", align: "right", render: (x) => qty(x.total_qty_dispatched) },
    { key: "pending", label: "Pending", align: "right", render: (x) => qty(x.pending) },
    { key: "fulfilment_percentage", label: "Fulfilment", render: (x) => <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--sd-bg-soft)]" role="img" aria-label={`${Math.round(x.fulfilment_percentage ?? 0)}% fulfilled`}><div className="h-full rounded-full bg-[var(--sd-data-green)]" style={{ width: `${Math.min(100, x.fulfilment_percentage ?? 0)}%` }} /></div> },
    { key: "status", label: "Status", render: (x) => <StatusPill text={x.overdue ? "Overdue" : x.status} /> },
  ];
  const requested = rows.reduce((t, x) => t + (x.total_qty_requested || 0), 0);
  const sent = rows.reduce((t, x) => t + (x.total_qty_dispatched || 0), 0);

  return (
    <Frame
      view="requests"
      description="What the farms have asked the nursery for, and how much of it has gone."
      controls={<TogglePill pressed={closed} onPressedChange={setClosed}>Include closed</TogglePill>}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid cols={4}>
        <KpiCard label="Requests" value={rows.length} loading={r.loading && !d} />
        <KpiCard label="Requested" value={requested} loading={r.loading && !d} />
        <KpiCard label="Dispatched" value={sent} tone="good" loading={r.loading && !d} />
        <KpiCard label="Overdue" value={rows.filter((x) => x.overdue).length} tone="critical" loading={r.loading && !d} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By status" className="lg:col-span-1">
          <Donut data={d?.by_status ?? []} name="status" value="requests" label="Requests" height={240} />
        </Panel>
        <Panel title="Seedling requests" className="lg:col-span-2" description={open ? `${open}: rows below` : "Click a request to see what it asks for"}>
          <DataTable columns={cols} rows={rows} loading={r.loading} rowKey={(x) => x.name} empty="No seedling requests." />
          {open ? (
            <div className="mt-4 rounded-[var(--sd-radius-lg)] bg-[var(--sd-bg-soft)] p-3 text-[13px]">
              {items.length ? (
                <ul className="flex flex-col gap-1">
                  {items.map((x, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">{x.variety}</span>
                      <span className="tabular-nums text-[var(--sd-muted)]">
                        {qty(x.qty_dispatched)} of {qty(x.qty_requested)} · {qty(x.qty_pending)} pending {x.target_greenhouse ? `· ${x.target_greenhouse}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                "This request has no rows."
              )}
            </div>
          ) : null}
        </Panel>
      </div>
    </Frame>
  );
}
