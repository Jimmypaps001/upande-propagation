import { useState } from "react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Donut } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import { consignments, type Consignment } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";
import { todayISO, ymd } from "@/lib/utils";

export function Consignments() {
  const { farm } = useFarm();
  const [range, setRange] = useState<DateRange>(() => {
    const f = new Date();
    f.setMonth(f.getMonth() - 6);
    return { from: ymd(f), to: todayISO() };
  });
  const r = useLoad(() => consignments(farm, range.from, range.to), [farm, range.from, range.to]);
  const rows = r.data ?? null;
  const sum = (f: (c: Consignment) => number) => (rows ?? []).reduce((t, c) => t + (f(c) || 0), 0);
  const byStatus = Object.values(
    (rows ?? []).reduce<Record<string, { status: string; n: number }>>((acc, c) => {
      const k = c.status || "Unset";
      (acc[k] ||= { status: k, n: 0 }).n += 1;
      return acc;
    }, {}),
  );

  const cols: Column<Consignment>[] = [
    { key: "consignment", label: "Consignment" },
    { key: "arrival_date", label: "Arrived", render: (c) => shortDate(c.arrival_date) },
    { key: "supplier", label: "Supplier", value: (c) => c.supplier_name || c.supplier },
    { key: "variety", label: "Variety", value: (c) => c.variety_name || c.variety },
    { key: "form", label: "Form" },
    { key: "qty_received", label: "Received", align: "right", render: (c) => qty(c.qty_received) },
    { key: "qty_accepted", label: "Accepted", align: "right", render: (c) => qty(c.qty_accepted) },
    { key: "qty_rejected", label: "Rejected", align: "right", render: (c) => qty(c.qty_rejected) },
    { key: "qty_unbatched", label: "Not yet batched", align: "right", render: (c) => qty(c.qty_unbatched) },
    { key: "qc_status", label: "Check", render: (c) => <StatusPill text={c.qc_status} /> },
    { key: "status", label: "Status", render: (c) => <StatusPill text={c.status} /> },
    { key: "purchase_receipt", label: "Receipt" },
  ];

  return (
    <Frame
      view="consignments"
      description="Plants delivered to the nursery by outside propagators: what arrived, what passed the check, and what is still to be batched."
      controls={<DateRangePicker value={range} onChange={setRange} label="Arrival range" />}
      loading={r.loading}
      hasData={!!rows}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid>
        <KpiCard label="Consignments" value={rows?.length ?? 0} loading={r.loading && !rows} />
        <KpiCard label="Received" value={sum((c) => c.qty_received)} loading={r.loading && !rows} />
        <KpiCard label="Rejected" value={sum((c) => c.qty_rejected)} tone="critical" loading={r.loading && !rows} />
        <KpiCard label="Not yet batched" value={sum((c) => c.qty_unbatched)} tone="warning" loading={r.loading && !rows} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By status">
          <Donut data={byStatus} name="status" value="n" label="Consignments" height={240} />
        </Panel>
        <Panel title="Plant consignments" className="lg:col-span-2">
          <DataTable columns={cols} rows={rows} loading={r.loading} rowKey={(c) => c.name} empty="No consignments in this range." />
        </Panel>
      </div>
    </Frame>
  );
}
