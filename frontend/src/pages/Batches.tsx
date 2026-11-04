import { useState } from "react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { TogglePill } from "@/components/TogglePill";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars } from "@/components/charts";
import { batches, type Batch } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop, useHref } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

export function Batches() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const href = useHref();
  const [done, setDone] = useState(false);
  const r = useLoad(() => batches(farm, done, cropKey), [farm, done, cropKey]);
  const rows = r.data?.batches ?? [];

  const cols: Column<Batch>[] = [
    { key: "name", label: "Batch", render: (b) => <a className="font-medium text-[var(--sd-ink)] no-underline hover:underline" href={href("batches", b.name)}>{b.name}</a> },
    { key: "variety_name", label: "Variety", value: (b) => b.variety_name || b.variety },
    { key: "current_stage", label: "Stage", render: (b) => <StatusPill text={b.current_stage} /> },
    { key: "propagation_unit", label: "Unit" },
    { key: "start_date", label: "Started", render: (b) => shortDate(b.start_date) },
    { key: "total_cuttings_actual", label: "Stuck", align: "right", render: (b) => qty(b.total_cuttings_actual) },
    { key: "total_survived", label: "Surviving", align: "right", render: (b) => qty(b.total_survived) },
    { key: "total_mortality", label: "Lost", align: "right", render: (b) => qty(b.total_mortality) },
    { key: "available_to_dispatch", label: "Available", align: "right", render: (b) => qty(b.available_to_dispatch) },
    { key: "success_rate", label: "Success", align: "right", render: (b) => (b.success_rate == null ? "—" : `${qty(b.success_rate, 1)}%`) },
  ];

  const sum = (f: (b: Batch) => number) => rows.reduce((t, b) => t + (f(b) || 0), 0);

  return (
    <Frame
      view="batches"
      description="Every submitted batch, newest week first. Open one to follow it through its stages."
      controls={<TogglePill pressed={done} onPressedChange={setDone}>Include completed</TogglePill>}
      loading={r.loading}
      hasData={!!r.data}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid cols={4}>
        <KpiCard label="Batches" value={rows.length} loading={r.loading && !r.data} />
        <KpiCard label="Surviving" value={sum((b) => b.total_survived)} tone="good" loading={r.loading && !r.data} />
        <KpiCard label="Available to dispatch" value={sum((b) => b.available_to_dispatch)} tone="good" loading={r.loading && !r.data} />
        <KpiCard label="Lost" value={sum((b) => b.total_mortality)} tone="critical" loading={r.loading && !r.data} />
      </KpiGrid>
      <Panel title="Seedlings by stage">
        <Bars data={(r.data?.pipeline ?? []).map((p) => ({ stage: p.stage, seedlings: p.seedlings }))} x="stage" y="seedlings" label="Seedlings" height={220} />
      </Panel>
      <Panel title="Propagation batches">
        <DataTable columns={cols} rows={rows} loading={r.loading} rowKey={(b) => b.name} rowHref={(b) => href("batches", b.name)} empty="No batches yet." tall />
      </Panel>
    </Frame>
  );
}
