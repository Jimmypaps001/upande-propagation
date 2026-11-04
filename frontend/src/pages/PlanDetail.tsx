import { ArrowLeft } from "lucide-react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Bars } from "@/components/charts";
import { StatusPill } from "@/components/StatusPill";
import { propagationPlan } from "@/lib/api";
import { useHref } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const date = (k: string) => (r: Row) => shortDate(r[k] as string | null);

export function PlanDetail({ name }: { name: string }) {
  const href = useHref();
  const r = useLoad(() => propagationPlan(name), [name]);
  const d = r.data;
  const p = d?.plan ?? {};

  const weekCols: Column<Row>[] = [
    { key: "year", label: "Year" },
    { key: "week_no", label: "Week" },
    { key: "week_start_date", label: "Starts", render: date("week_start_date") },
    { key: "plants_to_stick", label: "Plants to stick", align: "right", render: (w) => qty(n(w.plants_to_stick)) },
    { key: "cuttings_required", label: "Cuttings", align: "right", render: (w) => qty(n(w.cuttings_required)) },
    { key: "from_existing_ms", label: "Existing ms", align: "right", render: (w) => qty(n(w.from_existing_ms)) },
    { key: "from_new_ms", label: "New ms", align: "right", render: (w) => qty(n(w.from_new_ms)) },
    { key: "from_bought", label: "Bought", align: "right", render: (w) => qty(n(w.from_bought)) },
    { key: "shortfall", label: "Short", align: "right", render: (w) => qty(n(w.shortfall)) },
    { key: "deliver_on", label: "Deliver on", render: date("deliver_on") },
    { key: "state", label: "State", render: (w) => <StatusPill text={w.state as string | null} /> },
  ];
  const intakeCols: Column<Row>[] = [
    { key: "week_iso", label: "Week" },
    { key: "form", label: "Form" },
    { key: "source", label: "Source" },
    { key: "units", label: "Units", align: "right", render: (w) => qty(n(w.units)) },
    { key: "plants", label: "Plants", align: "right", render: (w) => qty(n(w.plants)) },
    { key: "ready_on", label: "Ready", render: date("ready_on") },
    { key: "deliver_on", label: "Deliver on", render: date("deliver_on") },
    { key: "actual_units", label: "Actual units", align: "right", render: (w) => qty(n(w.actual_units)) },
    { key: "state", label: "State", render: (w) => <StatusPill text={w.state as string | null} /> },
  ];
  const allocCols: Column<Row>[] = [
    { key: "alloc_type", label: "Type" },
    { key: "raises", label: "Raises" },
    { key: "party", label: "Party", value: (a) => (a.party as string) || (a.propagation_unit as string) || (a.supplier as string) },
    { key: "plants", label: "Plants", align: "right", render: (a) => qty(n(a.plants)) },
    { key: "share_pct", label: "Share", align: "right", render: (a) => `${qty(n(a.share_pct), 0)}%` },
    { key: "start_by", label: "Start by", render: date("start_by") },
    { key: "plants_from", label: "From", render: date("plants_from") },
    { key: "plants_to", label: "To", render: date("plants_to") },
    { key: "purchase_order", label: "Order" },
  ];
  const sourceCols: Column<Row>[] = [
    { key: "source_type", label: "Source" },
    { key: "generation", label: "Generation", align: "right" },
    { key: "mother_plants", label: "Mother plants", align: "right", render: (s) => qty(n(s.mother_plants)) },
    { key: "weekly_capacity", label: "Weekly capacity", align: "right", render: (s) => qty(n(s.weekly_capacity)) },
    { key: "available_from", label: "From", render: date("available_from") },
    { key: "available_to", label: "To", render: date("available_to") },
    { key: "total_cuttings", label: "Cuttings", align: "right", render: (s) => qty(n(s.total_cuttings)) },
  ];

  return (
    <Frame
      view="plans"
      title={name}
      description={d ? `${p.variety ?? ""} · ${p.farm ?? ""} · ${p.season ?? ""}` : undefined}
      farmFilter={false}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
      classic={{ href: `/desk/summer-flower-propagation-plan/${encodeURIComponent(name)}` }}
      controls={
        <a
          href={href("plans")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-4 text-xs font-medium text-foreground no-underline shadow-[var(--sd-shadow-1)] hover:shadow-[var(--sd-shadow-2)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All plans
        </a>
      }
    >
      {d ? (
        <>
          <KpiGrid>
            <KpiCard label="Status" value={String(p.status ?? "Draft")} />
            <KpiCard label="Plants to stick" value={n(p.total_plants_to_stick)} tone="good" />
            <KpiCard label="Cuttings required" value={n(p.total_cuttings_required)} hint={`peak ${qty(n(p.peak_weekly_cuttings))} a week`} />
            <KpiCard label="Uncovered" value={n(p.cuttings_uncovered)} tone="critical" hint={`${qty(n(p.plants_short))} plants short`} />
          </KpiGrid>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Cuttings by week" description="Required each week">
              <Bars data={d.weeks.map((w) => ({ week: `${w.year}-W${w.week_no}`, cuttings: n(w.cuttings_required) }))} x="week" y="cuttings" label="Cuttings" height={240} />
            </Panel>
            <Panel title="Where the cuttings come from">
              <Bars
                data={[
                  { from: "Existing", cuttings: n(p.cuttings_from_existing) },
                  { from: "New motherstock", cuttings: n(p.cuttings_from_new) },
                  { from: "Bought", cuttings: n(p.cuttings_from_bought) },
                  { from: "Uncovered", cuttings: n(p.cuttings_uncovered) },
                ]}
                x="from"
                y="cuttings"
                label="Cuttings"
                height={240}
              />
            </Panel>
          </div>
          <Panel title="Weeks"><DataTable columns={weekCols} rows={d.weeks} rowKey={(_, i) => String(i)} search={false} empty="No weeks." tall /></Panel>
          <Panel title="Intake"><DataTable columns={intakeCols} rows={d.intake} rowKey={(_, i) => String(i)} empty="No intake rows." /></Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Allocation"><DataTable columns={allocCols} rows={d.allocations} rowKey={(_, i) => String(i)} search={false} empty="Nothing allocated yet." /></Panel>
            <Panel title="Sources"><DataTable columns={sourceCols} rows={d.sources} rowKey={(_, i) => String(i)} search={false} empty="No sources." /></Panel>
          </div>
        </>
      ) : null}
    </Frame>
  );
}
