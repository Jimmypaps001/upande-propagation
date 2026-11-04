import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Donut } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { flowerTrials, type FlowerTrial } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

export function Trials() {
  const r = useLoad(() => flowerTrials(), []);
  const rows = r.data ?? null;
  const byStatus = Object.values(
    (rows ?? []).reduce<Record<string, { status: string; n: number }>>((acc, t) => {
      const k = t.cycle_status || "Unset";
      (acc[k] ||= { status: k, n: 0 }).n += 1;
      return acc;
    }, {}),
  );

  const cols: Column<FlowerTrial>[] = [
    { key: "trial_name", label: "Trial", render: (t) => <a className="font-medium text-[var(--sd-ink)] no-underline hover:underline" href={`/desk/flower-trial/${encodeURIComponent(t.name)}`}>{t.trial_name}</a> },
    { key: "crop_type", label: "Crop" },
    { key: "greenhouse", label: "Greenhouse" },
    { key: "cycle_status", label: "Cycle", render: (t) => <StatusPill text={t.cycle_status} /> },
    { key: "seedling_source", label: "Source" },
    { key: "qty_planted", label: "Planted", align: "right", render: (t) => qty(t.qty_planted) },
    { key: "current_live_plants", label: "Live", align: "right", render: (t) => qty(t.current_live_plants) },
    { key: "planting_date", label: "Planted on", render: (t) => shortDate(t.planting_date) },
    { key: "first_harvest_date", label: "First harvest", render: (t) => shortDate(t.first_harvest_date) },
    { key: "total_stems_harvested", label: "Stems", align: "right", render: (t) => qty(t.total_stems_harvested) },
    { key: "recommendation", label: "Recommendation" },
  ];

  return (
    <Frame
      view="trials"
      description="Variety trials run in the greenhouses, and how each one is getting on."
      farmFilter={false}
      loading={r.loading}
      hasData={!!rows}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid cols={3}>
        <KpiCard label="Trials" value={rows?.length ?? 0} loading={r.loading && !rows} />
        <KpiCard label="Plants in trial" value={(rows ?? []).reduce((t, x) => t + (x.current_live_plants || 0), 0)} tone="good" loading={r.loading && !rows} />
        <KpiCard label="Stems harvested" value={(rows ?? []).reduce((t, x) => t + (x.total_stems_harvested || 0), 0)} loading={r.loading && !rows} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By cycle status">
          <Donut data={byStatus} name="status" value="n" label="Trials" height={240} />
        </Panel>
        <Panel title="Flower trials" className="lg:col-span-2">
          <DataTable columns={cols} rows={rows} loading={r.loading} rowKey={(t) => t.name} empty="No flower trials yet." />
        </Panel>
      </div>
    </Frame>
  );
}
