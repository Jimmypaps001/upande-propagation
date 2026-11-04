import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { planActuals, type ActualRow, type ActualsBook } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop, useHref } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

export function Actuals() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const href = useHref();
  const r = useLoad(() => planActuals(farm, cropKey), [farm, cropKey]);
  const d = r.data;

  const cols: Column<ActualRow>[] = [
    { key: "actual_date", label: "Date", render: (a) => shortDate(a.actual_date) },
    { key: "name", label: "Record" },
    { key: "propagation_plan", label: "Plan", render: (a) => (a.propagation_plan ? <a className="no-underline hover:underline" href={href("plans", a.propagation_plan)}>{a.propagation_plan}</a> : "—") },
    { key: "variety", label: "Variety" },
    { key: "event", label: "Event", render: (a) => <StatusPill text={a.event} tone="info" /> },
    { key: "form", label: "Form" },
    { key: "units", label: "Units", align: "right", render: (a) => qty(a.units) },
    { key: "plants", label: "Plants", align: "right", render: (a) => qty(a.plants) },
    { key: "supplier", label: "Supplier" },
    { key: "recorded_from", label: "Recorded from" },
    { key: "reason", label: "Reason" },
  ];
  const planCols: Column<ActualsBook["plans"][number]>[] = [
    { key: "name", label: "Plan", render: (p) => <a className="font-medium text-[var(--sd-ink)] no-underline hover:underline" href={href("plans", p.name)}>{p.name}</a> },
    { key: "variety", label: "Variety" },
    { key: "season", label: "Season" },
    { key: "actuals_recorded", label: "Actuals", align: "right", render: (p) => qty(p.actuals_recorded) },
    { key: "weeks_closed", label: "Weeks closed", align: "right", render: (p) => qty(p.weeks_closed) },
    { key: "tc_received", label: "TC received", align: "right", render: (p) => qty(p.tc_received) },
    { key: "roots_withdrawn", label: "Roots withdrawn", align: "right", render: (p) => qty(p.roots_withdrawn) },
    { key: "plants_to_farm", label: "To farm", align: "right", render: (p) => qty(p.plants_to_farm) },
    { key: "plants_lost", label: "Lost", align: "right", render: (p) => qty(p.plants_lost) },
    { key: "delivered_short", label: "Delivered short", align: "right", render: (p) => qty(p.delivered_short) },
  ];
  const sum = (f: (p: ActualsBook["plans"][number]) => number) => (d?.plans ?? []).reduce((t, p) => t + f(p), 0);

  return (
    <Frame
      view="actuals"
      description="What really happened against each plan: tissue culture received, roots withdrawn, plants sent to the farm and plants lost."
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
    >
      <KpiGrid>
        <KpiCard label="Actual records" value={d?.actuals.length ?? 0} loading={r.loading && !d} />
        <KpiCard label="TC received" value={sum((p) => p.tc_received)} loading={r.loading && !d} />
        <KpiCard label="Plants to farm" value={sum((p) => p.plants_to_farm)} tone="good" loading={r.loading && !d} />
        <KpiCard label="Plants lost" value={sum((p) => p.plants_lost)} tone="critical" loading={r.loading && !d} />
      </KpiGrid>
      <Panel title="Plants by event">
        <Bars data={d?.by_event ?? []} x="event" y="plants" label="Plants" height={220} />
      </Panel>
      <Panel title="Actuals against each plan">
        <DataTable columns={planCols} rows={d?.plans ?? null} loading={r.loading} rowKey={(p) => p.name} rowHref={(p) => href("plans", p.name)} empty="No plans yet." />
      </Panel>
      <Panel title="Propagation actuals">
        <DataTable columns={cols} rows={d?.actuals ?? null} loading={r.loading} rowKey={(a) => a.name} empty="No actuals recorded yet." tall />
      </Panel>
    </Frame>
  );
}
