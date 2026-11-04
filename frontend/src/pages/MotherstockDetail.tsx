import { ArrowLeft } from "lucide-react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Series, SERIES } from "@/components/charts";
import { motherstockPlan } from "@/lib/api";
import { useHref } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export function MotherstockDetail({ name }: { name: string }) {
  const href = useHref();
  const r = useLoad(() => motherstockPlan(name), [name]);
  const d = r.data;
  const p = d?.plan ?? {};

  const genCols: Column<Row>[] = [
    { key: "generation", label: "Generation", align: "right" },
    { key: "mothers", label: "Mothers", align: "right", render: (g) => qty(n(g.mothers)) },
    { key: "arrivals", label: "Arrivals", align: "right", render: (g) => qty(n(g.arrivals)) },
    { key: "stuck_date", label: "Stuck", render: (g) => shortDate(g.stuck_date as string | null) },
    { key: "first_cut_date", label: "First cut", render: (g) => shortDate(g.first_cut_date as string | null) },
    { key: "cutting_weeks", label: "Cutting weeks", align: "right" },
    { key: "expiry_date", label: "Expires", render: (g) => shortDate(g.expiry_date as string | null) },
  ];
  const weekCols: Column<Row>[] = [
    { key: "week_no", label: "Week", align: "right" },
    { key: "week_start", label: "Starts", render: (w) => shortDate(w.week_start as string | null) },
    { key: "generations_live", label: "Generations" },
    { key: "mothers_standing", label: "Mothers", align: "right", render: (w) => qty(n(w.mothers_standing)) },
    { key: "cuttings_cut", label: "Cut", align: "right", render: (w) => qty(n(w.cuttings_cut)) },
    { key: "to_multiplication", label: "To multiplication", align: "right", render: (w) => qty(n(w.to_multiplication)) },
    { key: "to_field", label: "To field", align: "right", render: (w) => qty(n(w.to_field)) },
    { key: "demand", label: "Demand", align: "right", render: (w) => qty(n(w.demand)) },
    { key: "shortfall", label: "Short", align: "right", render: (w) => qty(n(w.shortfall)) },
    { key: "event", label: "Event" },
  ];

  return (
    <Frame
      view="motherstock"
      title={name}
      description={d ? `${p.variety ?? ""} · ${p.farm ?? ""} · ${p.season ?? ""}` : undefined}
      farmFilter={false}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
      classic={{ href: `/desk/summer-flower-motherstock-plan/${encodeURIComponent(name)}` }}
      controls={
        <a
          href={href("motherstock")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-4 text-xs font-medium text-foreground no-underline shadow-[var(--sd-shadow-1)] hover:shadow-[var(--sd-shadow-2)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All motherstock
        </a>
      }
    >
      {d ? (
        <>
          <KpiGrid>
            <KpiCard label="TC to order" value={n(p.tc_to_order)} />
            <KpiCard label="Peak pool" value={n(p.peak_pool)} tone="good" />
            <KpiCard label="Plants to field" value={n(p.plants_to_field)} />
            <KpiCard label="Shortfall" value={n(p.shortfall)} tone="critical" hint={`${n(p.weeks_met)} of ${n(p.weeks_required)} weeks met`} />
          </KpiGrid>
          <Panel title="Mothers standing and cuttings cut" description="Week by week">
            <Series data={d.schedule.map((w) => ({ log_date: `0000-${String(w.week_no).padStart(2, "0")}`, cut: n(w.cuttings_cut) }))} x="log_date" y="cut" label="Cuttings cut" color={SERIES[0]} />
          </Panel>
          <Panel title="Generations"><DataTable columns={genCols} rows={d.generations} rowKey={(_, i) => String(i)} search={false} empty="No generations." /></Panel>
          <Panel title="Schedule"><DataTable columns={weekCols} rows={d.schedule} rowKey={(_, i) => String(i)} search={false} empty="No schedule." tall /></Panel>
        </>
      ) : null}
    </Frame>
  );
}
