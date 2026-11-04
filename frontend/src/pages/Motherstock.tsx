import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { motherstockBook, type MotherstockBatch, type MotherstockPlan } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop, useHref } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { kes, qty, shortDate } from "@/lib/format";

export function Motherstock() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const href = useHref();
  const r = useLoad(() => motherstockBook(farm, cropKey), [farm, cropKey]);
  const d = r.data;
  const t = d?.totals;

  const planCols: Column<MotherstockPlan>[] = [
    { key: "name", label: "Plan", render: (p) => <a className="font-medium text-[var(--sd-ink)] no-underline hover:underline" href={href("motherstock", p.name)}>{p.name}</a> },
    { key: "variety", label: "Variety" },
    { key: "farm", label: "Farm" },
    { key: "season", label: "Season" },
    { key: "tc_to_order", label: "TC to order", align: "right", render: (p) => qty(p.tc_to_order) },
    { key: "multiplications", label: "Rounds", align: "right" },
    { key: "peak_pool", label: "Peak pool", align: "right", render: (p) => qty(p.peak_pool) },
    { key: "cuttings_required", label: "Cuttings needed", align: "right", render: (p) => qty(p.cuttings_required) },
    { key: "plants_to_field", label: "To field", align: "right", render: (p) => qty(p.plants_to_field) },
    { key: "weeks_met", label: "Weeks met", align: "right", render: (p) => `${p.weeks_met}/${p.weeks_required}` },
    { key: "shortfall", label: "Shortfall", align: "right", render: (p) => qty(p.shortfall) },
    { key: "covers", label: "Covers", render: (p) => <StatusPill text={p.covers ? "Covers" : "Short"} tone={p.covers ? "good" : "bad"} /> },
    { key: "order_by_date", label: "Order TC by", render: (p) => shortDate(p.order_by_date) },
  ];
  const batchCols: Column<MotherstockBatch>[] = [
    { key: "name", label: "Batch" },
    { key: "variety", label: "Variety" },
    { key: "farm", label: "Farm" },
    { key: "batch_status", label: "Status", render: (b) => <StatusPill text={b.batch_status} /> },
    { key: "generation", label: "Gen", align: "right" },
    { key: "mother_plants", label: "Mother plants", align: "right", render: (b) => qty(b.mother_plants) },
    { key: "pots_required", label: "Pots", align: "right", render: (b) => qty(b.pots_required) },
    { key: "tc_plants_required", label: "TC plants", align: "right", render: (b) => qty(b.tc_plants_required) },
    { key: "first_sticking_date", label: "First sticking", render: (b) => shortDate(b.first_sticking_date) },
    { key: "expiry_date", label: "Expires", render: (b) => shortDate(b.expiry_date) },
    { key: "total_cost", label: "Cost", align: "right", render: (b) => (b.total_cost ? kes(b.total_cost) : "—") },
  ];

  return (
    <Frame
      view="motherstock"
      description="The multiplication line that makes the cuttings: tissue culture in, mothers standing, cuttings out, week by week."
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid>
        <KpiCard label="Motherstock plans" value={t?.plans ?? 0} loading={r.loading && !d} />
        <KpiCard label="Covering their demand" value={t?.covering ?? 0} tone="good" loading={r.loading && !d} />
        <KpiCard label="Cuttings short" value={t?.short ?? 0} tone="critical" loading={r.loading && !d} />
        <KpiCard label="Mother plants (batches)" value={t?.mother_plants ?? 0} loading={r.loading && !d} />
      </KpiGrid>
      <Panel title="Peak pool by variety">
        <Bars data={(d?.plans ?? []).slice(0, 12).map((p) => ({ variety: p.variety ?? p.name, pool: p.peak_pool }))} x="variety" y="pool" label="Peak pool" height={220} />
      </Panel>
      <Panel title="Motherstock plans">
        <DataTable columns={planCols} rows={d?.plans ?? null} loading={r.loading} rowKey={(p) => p.name} rowHref={(p) => href("motherstock", p.name)} empty="No motherstock plans yet." />
      </Panel>
      <Panel title="Motherstock batches">
        <DataTable columns={batchCols} rows={d?.batches ?? null} loading={r.loading} rowKey={(b) => b.name} empty="No motherstock batches yet." />
      </Panel>
    </Frame>
  );
}
