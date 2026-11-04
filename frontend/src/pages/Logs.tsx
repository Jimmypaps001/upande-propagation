import { useState } from "react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars, Series, SERIES } from "@/components/charts";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import { nurseryLogs, type LogRow } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";
import { routeHash } from "@/lib/router";
import { todayISO, ymd } from "@/lib/utils";

export function Logs() {
  const { farm } = useFarm();
  const [range, setRange] = useState<DateRange>(() => {
    const f = new Date();
    f.setDate(f.getDate() - 30);
    return { from: ymd(f), to: todayISO() };
  });
  const r = useLoad(() => nurseryLogs(farm, range.from, range.to), [farm, range.from, range.to]);
  const d = r.data;
  const done = (d?.by_activity ?? []).reduce((t, a) => t + a.done, 0);
  const dead = (d?.by_activity ?? []).reduce((t, a) => t + a.dead, 0);

  const cols: Column<LogRow>[] = [
    { key: "log_date", label: "Date", render: (l) => shortDate(l.log_date) },
    { key: "propagation_batch", label: "Batch", render: (l) => (l.propagation_batch ? <a className="no-underline hover:underline" href={routeHash("batches", l.propagation_batch)}>{l.propagation_batch}</a> : "—") },
    { key: "rose_variety", label: "Variety" },
    { key: "activity_type", label: "Activity" },
    { key: "qty_done_today", label: "Done", align: "right", render: (l) => qty(l.qty_done_today) },
    { key: "mortality_today", label: "Lost", align: "right", render: (l) => qty(l.mortality_today) },
    { key: "surviving_qty", label: "Surviving", align: "right", render: (l) => qty(l.surviving_qty) },
    { key: "greenhouse", label: "Greenhouse" },
    { key: "logged_by", label: "By" },
  ];

  return (
    <Frame
      view="logs"
      description="Work recorded in the nursery: what was done, what was lost, and by whom."
      controls={<DateRangePicker value={range} onChange={setRange} label="Log range" />}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid cols={3}>
        <KpiCard label="Logs" value={d?.logs.length ?? 0} loading={r.loading && !d} />
        <KpiCard label="Plants handled" value={done} tone="good" loading={r.loading && !d} />
        <KpiCard label="Plants lost" value={dead} tone="critical" loading={r.loading && !d} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Work by activity">
          <Bars data={d?.by_activity ?? []} x="activity_type" y="done" label="Plants handled" color={SERIES[1]} />
        </Panel>
        <Panel title="Plants lost each day">
          <Series data={d?.by_day ?? []} x="log_date" y="dead" label="Plants lost" kind="line" color="var(--sd-data-red)" />
        </Panel>
      </div>
      <Panel title="Daily propagation logs">
        <DataTable columns={cols} rows={d?.logs ?? null} loading={r.loading} rowKey={(l) => l.name} empty="No logs in this range." tall />
      </Panel>
    </Frame>
  );
}
