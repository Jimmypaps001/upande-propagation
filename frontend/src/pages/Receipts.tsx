import { useState } from "react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { StatusPill } from "@/components/StatusPill";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import { plantReceipts, type ReceiptLine } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";
import { todayISO, ymd } from "@/lib/utils";

const slug = (dt: string) => dt.toLowerCase().replace(/ /g, "-");

/** Plant material bought in: the plant lines on Purchase Receipts and Invoices, against what each planting was approved for. */
export function Receipts() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const [range, setRange] = useState<DateRange>(() => {
    const f = new Date();
    f.setMonth(f.getMonth() - 6);
    return { from: ymd(f), to: todayISO() };
  });
  const r = useLoad(() => plantReceipts(farm, range.from, range.to, cropKey), [farm, cropKey, range.from, range.to]);
  const d = r.data;
  const t = d?.totals;

  const cols: Column<ReceiptLine>[] = [
    { key: "posting_date", label: "Date", render: (l) => shortDate(l.posting_date) },
    { key: "document", label: "Document", render: (l) => <a className="font-medium text-[var(--sd-ink)] no-underline hover:underline" href={`/desk/${slug(l.document_type)}/${encodeURIComponent(l.document)}`}>{l.document}</a> },
    { key: "document_type", label: "Type" },
    { key: "supplier", label: "Supplier" },
    { key: "item_name", label: "Plant", value: (l) => l.item_name || l.item_code },
    { key: "qty", label: "Accepted", align: "right", render: (l) => qty(l.qty) },
    { key: "rejected_qty", label: "Rejected", align: "right", render: (l) => qty(l.rejected_qty) },
    { key: "planting", label: "Planting" },
    { key: "block", label: "Block" },
    { key: "planned_plants", label: "Planned", align: "right", render: (l) => qty(l.planned_plants) },
    { key: "variance", label: "Variance", align: "right", render: (l) => (l.planting ? qty(l.variance) : "—") },
    { key: "days_before_planting", label: "Days before planting", align: "right", render: (l) => (l.planting ? qty(l.days_before_planting) : "—") },
    { key: "quality_inspection", label: "Inspection", render: (l) => <StatusPill text={l.quality_inspection ? "Inspected" : "None"} tone={l.quality_inspection ? "good" : "quiet"} /> },
  ];

  return (
    <Frame
      view="receipts"
      description="Plants bought in. Each plant line is set against the planting it was ordered for, so a short or late delivery shows up here."
      controls={<DateRangePicker value={range} onChange={setRange} label="Receipt range" />}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid>
        <KpiCard label="Plant lines" value={t?.lines ?? 0} loading={r.loading && !d} />
        <KpiCard label="Plants accepted" value={t?.qty ?? 0} tone="good" loading={r.loading && !d} />
        <KpiCard label="Rejected" value={t?.rejected ?? 0} tone="critical" loading={r.loading && !d} />
        <KpiCard label="Variance to plan" value={t?.variance ?? 0} hint={`${qty(t?.planned ?? 0)} planned`} loading={r.loading && !d} />
      </KpiGrid>
      <Panel title="Plant receipts">
        <DataTable columns={cols} rows={d?.lines ?? null} loading={r.loading} rowKey={(l, i) => `${l.document}-${i}`} empty="No plant material received in this range." tall />
      </Panel>
    </Frame>
  );
}
