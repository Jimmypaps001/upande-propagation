import { useState } from "react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars, Donut, SERIES } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import { dispatchBook, type Dispatch as Row } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useLoad } from "@/lib/use-load";
import { kes, qty, shortDate } from "@/lib/format";
import { routeHash } from "@/lib/router";
import { todayISO, ymd } from "@/lib/utils";

export function Dispatch() {
  const { farm } = useFarm();
  const [range, setRange] = useState<DateRange>(() => {
    const f = new Date();
    f.setFullYear(f.getFullYear() - 1);
    return { from: ymd(f), to: todayISO() };
  });
  const r = useLoad(() => dispatchBook(farm, range.from, range.to), [farm, range.from, range.to]);
  const d = r.data;
  const total = (d?.by_purpose ?? []).reduce((t, p) => t + p.qty, 0);
  const sales = (d?.by_purpose ?? []).filter((p) => p.purpose === "Sale").reduce((t, p) => t + p.amount, 0);

  const cols: Column<Row>[] = [
    { key: "dispatch_date", label: "Date", render: (x) => shortDate(x.dispatch_date) },
    { key: "name", label: "Dispatch" },
    { key: "propagation_batch", label: "Batch", render: (x) => (x.propagation_batch ? <a className="no-underline hover:underline" href={routeHash("batches", x.propagation_batch)}>{x.propagation_batch}</a> : "—") },
    { key: "variety", label: "Variety" },
    { key: "purpose", label: "Purpose", render: (x) => <StatusPill text={x.purpose} /> },
    { key: "qty_dispatched", label: "Qty", align: "right", render: (x) => qty(x.qty_dispatched) },
    { key: "grade", label: "Grade" },
    { key: "destination", label: "Destination", value: (x) => (x.purpose === "Sale" ? x.customer : x.target_crop_cycle || x.target_greenhouse || x.farm) },
    { key: "amount", label: "Amount", align: "right", render: (x) => (x.amount ? kes(x.amount) : "—") },
    { key: "sales_invoice", label: "Invoice" },
  ];

  return (
    <Frame
      view="dispatch"
      description="Seedlings that have left the nursery: planted on a farm or sold."
      controls={<DateRangePicker value={range} onChange={setRange} label="Dispatch range" />}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid cols={3}>
        <KpiCard label="Dispatches" value={d?.dispatches.length ?? 0} loading={r.loading && !d} />
        <KpiCard label="Seedlings sent" value={total} tone="good" loading={r.loading && !d} />
        <KpiCard label="Sales" value={kes(sales)} loading={r.loading && !d} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Split by purpose">
          <Donut data={d?.by_purpose ?? []} name="purpose" value="qty" label="Seedlings" />
        </Panel>
        <Panel title="Planted and sold by month">
          <Bars data={d?.by_month ?? []} x="ym" y="planted" label="Planted" color={SERIES[0]} />
        </Panel>
      </div>
      <Panel title="Seedling dispatches">
        <DataTable columns={cols} rows={d?.dispatches ?? null} loading={r.loading} rowKey={(x) => x.name} empty="No dispatches in this range." tall />
      </Panel>
    </Frame>
  );
}
