import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars, Donut } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { propagationPlans, type PlanRow } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop, useHref } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { kes, qty, shortDate } from "@/lib/format";

export function Plans() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const href = useHref();
  const r = useLoad(() => propagationPlans(farm, cropKey), [farm, cropKey]);
  const d = r.data;
  const t = d?.totals;

  const cols: Column<PlanRow>[] = [
    { key: "name", label: "Plan", render: (p) => <a className="font-medium text-[var(--sd-ink)] no-underline hover:underline" href={href("plans", p.name)}>{p.name}</a> },
    { key: "variety", label: "Variety" },
    { key: "farm", label: "Farm" },
    { key: "season", label: "Season" },
    { key: "status", label: "Status", render: (p) => <StatusPill text={p.status ?? "Draft"} /> },
    { key: "total_plants_to_stick", label: "Plants to stick", align: "right", render: (p) => qty(p.total_plants_to_stick) },
    { key: "total_cuttings_required", label: "Cuttings", align: "right", render: (p) => qty(p.total_cuttings_required) },
    { key: "peak_weekly_cuttings", label: "Peak / week", align: "right", render: (p) => qty(p.peak_weekly_cuttings) },
    { key: "cuttings_uncovered", label: "Uncovered", align: "right", render: (p) => qty(p.cuttings_uncovered) },
    { key: "tc_plants_required", label: "TC plants", align: "right", render: (p) => qty(p.tc_plants_required) },
    { key: "tc_order_date", label: "Order TC by", render: (p) => shortDate(p.tc_order_date) },
    { key: "first_sticking_date", label: "First sticking", render: (p) => shortDate(p.first_sticking_date) },
    { key: "total_cost", label: "Cost", align: "right", render: (p) => (p.total_cost ? kes(p.total_cost) : "—") },
  ];

  return (
    <Frame
      view="plans"
      description="How each variety's plants are raised for the season: cuttings by week, where they come from, and when tissue culture has to be ordered."
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid>
        <KpiCard label="Plans" value={d?.plans.length ?? 0} loading={r.loading && !d} />
        <KpiCard label="Plants to stick" value={t?.total_plants_to_stick ?? 0} tone="good" loading={r.loading && !d} />
        <KpiCard label="Cuttings required" value={t?.total_cuttings_required ?? 0} loading={r.loading && !d} />
        <KpiCard label="Cuttings uncovered" value={t?.cuttings_uncovered ?? 0} tone="critical" loading={r.loading && !d} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By status">
          <Donut data={d?.by_status ?? []} name="status" value="plans" label="Plans" height={240} />
        </Panel>
        <Panel title="Cuttings by variety" className="lg:col-span-2">
          <Bars
            data={(d?.plans ?? []).slice(0, 12).map((p) => ({ variety: p.variety ?? p.name, cuttings: p.total_cuttings_required }))}
            x="variety"
            y="cuttings"
            label="Cuttings"
            height={240}
          />
        </Panel>
      </div>
      <Panel title="Propagation plans">
        <DataTable columns={cols} rows={d?.plans ?? null} loading={r.loading} rowKey={(p) => p.name} rowHref={(p) => href("plans", p.name)} empty="No propagation plans yet." tall />
      </Panel>
    </Frame>
  );
}
