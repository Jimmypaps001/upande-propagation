import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { motherStock, type MotherStock } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

type Block = MotherStock["blocks"][number];
type Harvest = MotherStock["harvests"][number];

export function MotherBlocks() {
  const { farm } = useFarm();
  const r = useLoad(() => motherStock(farm), [farm]);
  const d = r.data;

  const cols: Column<Block>[] = [
    { key: "name", label: "Mother block", render: (b) => <a className="font-medium text-[var(--sd-ink)] no-underline hover:underline" href={`/desk/mother-block/${encodeURIComponent(b.name)}`}>{b.name}</a> },
    { key: "variety", label: "Variety" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status", render: (b) => <StatusPill text={b.status} /> },
    { key: "health_status", label: "Health", render: (b) => <StatusPill text={b.health_status} /> },
    { key: "plant_count", label: "Plants", align: "right", render: (b) => qty(b.plant_count) },
    { key: "planted_date", label: "Planted", render: (b) => shortDate(b.planted_date) },
    { key: "total_cuttings_taken", label: "Cuttings taken", align: "right", render: (b) => qty(b.total_cuttings_taken) },
    { key: "last_cutting_date", label: "Last cut", render: (b) => shortDate(b.last_cutting_date) },
  ];
  const hcols: Column<Harvest>[] = [
    { key: "harvest_datetime", label: "Harvested", render: (h) => shortDate(h.harvest_datetime) },
    { key: "mother_block", label: "Block" },
    { key: "item_name", label: "Item", value: (h) => h.item_name || h.item },
    { key: "number_of_stems", label: "Stems", align: "right", render: (h) => qty(h.number_of_stems) },
    { key: "propagation_batch", label: "Batch", render: (h) => h.propagation_batch ?? "Not yet used" },
  ];

  return (
    <Frame
      view="mother-blocks"
      description="The stock plants cuttings are taken from, and the budwood harvested off them."
      farmFilter={false}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid cols={3}>
        <KpiCard label="Mother blocks" value={d?.blocks.length ?? 0} loading={r.loading && !d} />
        <KpiCard label="Plants" value={(d?.blocks ?? []).reduce((t, b) => t + (b.plant_count || 0), 0)} tone="good" loading={r.loading && !d} />
        <KpiCard label="Cuttings taken" value={(d?.blocks ?? []).reduce((t, b) => t + (b.total_cuttings_taken || 0), 0)} loading={r.loading && !d} />
      </KpiGrid>
      <Panel title="Cuttings taken by variety">
        <Bars data={d?.by_variety ?? []} x="variety" y="taken" label="Cuttings taken" height={220} />
      </Panel>
      <Panel title="Mother blocks">
        <DataTable columns={cols} rows={d?.blocks ?? null} loading={r.loading} rowKey={(b) => b.name} empty="No mother blocks yet." />
      </Panel>
      <Panel title="Budwood harvests" description={d?.unassigned.length ? `${d.unassigned.length} not yet used in a batch` : undefined}>
        <DataTable columns={hcols} rows={d?.harvests ?? null} loading={r.loading} rowKey={(h) => h.name} empty="No budwood harvested yet." />
      </Panel>
    </Frame>
  );
}
