import { ArrowLeft, Check } from "lucide-react";
import { Frame } from "@/components/Frame";
import { Panel, Empty } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { HBars } from "@/components/charts";
import { batchDetail, type Dispatch, type LogRow, type StageRow } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { qty, kes, shortDate } from "@/lib/format";
import { routeHash } from "@/lib/router";
import { cn } from "@/lib/utils";

/** The stage chain: every stage a batch has been through, with how long it stayed and what it lost. */
function Chain({ stages }: { stages: StageRow[] }) {
  if (!stages.length) return <Empty>This batch has no stages yet.</Empty>;
  return (
    <ol className="flex flex-col gap-0" aria-label="Stage chain">
      {stages.map((s, i) => (
        <li key={`${s.stage}-${i}`} className="relative flex gap-4 pb-5 last:pb-0">
          {i < stages.length - 1 ? <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px bg-[var(--sd-line)]" /> : null}
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
              s.open
                ? "border-[var(--sd-data-green)] bg-[var(--sd-data-green)]/12 text-[var(--sd-data-green)]"
                : "border-[var(--sd-line)] bg-[var(--sd-bg-soft)] text-[var(--sd-muted)]",
            )}
          >
            {s.open ? i + 1 : <Check className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[14px] font-semibold text-[var(--sd-ink)]">{s.stage}</span>
              {s.open ? <StatusPill text="Here now" tone="good" /> : null}
              {s.over_expected ? <StatusPill text={`${s.days_in_stage - s.expected_days} days over`} tone="warn" /> : null}
            </div>
            <div className="mt-0.5 text-[12px] tabular-nums text-[var(--sd-quiet)]">
              {shortDate(s.start_date)} {s.end_date ? `→ ${shortDate(s.end_date)}` : "→ now"} · {s.days_in_stage}
              {s.expected_days ? ` of ${s.expected_days}` : ""} days · {qty(s.qty_entered)} in
              {s.end_date ? `, ${qty(s.qty_exited)} out` : ""}
              {s.lost ? ` · ${qty(s.lost)} lost` : ""}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function BatchDetail({ name }: { name: string }) {
  const r = useLoad(() => batchDetail(name), [name]);
  const d = r.data;
  const b = d?.batch;

  const logCols: Column<LogRow>[] = [
    { key: "log_date", label: "Date", render: (l) => shortDate(l.log_date) },
    { key: "activity_type", label: "Activity" },
    { key: "qty_done_today", label: "Done", align: "right", render: (l) => qty(l.qty_done_today) },
    { key: "mortality_today", label: "Lost", align: "right", render: (l) => qty(l.mortality_today) },
    { key: "surviving_qty", label: "Surviving", align: "right", render: (l) => qty(l.surviving_qty) },
    { key: "weather_conditions", label: "Weather" },
    { key: "logged_by", label: "By" },
  ];
  const dispCols: Column<Dispatch>[] = [
    { key: "dispatch_date", label: "Date", render: (x) => shortDate(x.dispatch_date) },
    { key: "purpose", label: "Purpose", render: (x) => <StatusPill text={x.purpose} /> },
    { key: "qty_dispatched", label: "Qty", align: "right", render: (x) => qty(x.qty_dispatched) },
    { key: "grade", label: "Grade" },
    { key: "destination", label: "Destination", value: (x) => (x.purpose === "Sale" ? x.customer : x.target_crop_cycle || x.target_greenhouse) },
    { key: "amount", label: "Amount", align: "right", render: (x) => (x.amount ? kes(x.amount) : "—") },
  ];

  return (
    <Frame
      view="batches"
      title={name}
      description={b ? `${b.variety_name || b.variety || "Batch"} · ${b.propagation_unit ?? "no unit"} · started ${shortDate(b.start_date)}` : undefined}
      farmFilter={false}
      loading={r.loading}
      hasData={!!d}
      error={r.error}
      onRefresh={r.reload}
      classic={{ href: `/desk/propagation-batch/${encodeURIComponent(name)}`, label: "Classic view" }}
      controls={
        <a
          href={routeHash("batches")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-4 text-xs font-medium text-foreground no-underline shadow-[var(--sd-shadow-1)] hover:shadow-[var(--sd-shadow-2)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All batches
        </a>
      }
    >
      {d && b ? (
        <>
          <KpiGrid>
            <KpiCard label="Stage now" value={b.current_stage} loading={false} />
            <KpiCard label="Surviving" value={b.total_survived} tone="good" />
            <KpiCard label="Available to dispatch" value={b.available_to_dispatch} tone="good" />
            <KpiCard label="Lost" value={b.total_mortality} tone="critical" hint={b.success_rate != null ? `${qty(b.success_rate, 1)}% success` : undefined} />
          </KpiGrid>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Stage chain" description="From cutting to dispatch">
              <Chain stages={d.stages} />
            </Panel>
            <Panel title="Funnel" description="Cuttings in, seedlings out">
              <HBars data={d.funnel.map((f) => ({ step: f.label, value: f.value }))} name="step" value="value" label="Plants" height={300} />
            </Panel>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Source">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-[var(--sd-quiet)]">Mother block</dt>
                <dd>{b.mother_block ?? "—"}</dd>
                <dt className="text-[var(--sd-quiet)]">Method</dt>
                <dd>{b.propagation_method ?? "—"}</dd>
                <dt className="text-[var(--sd-quiet)]">Cuttings stuck</dt>
                <dd className="tabular-nums">{qty(b.total_cuttings_actual)}</dd>
                <dt className="text-[var(--sd-quiet)]">Budwood taken</dt>
                <dd className="tabular-nums">{qty(d.harvests.reduce((t, h) => t + (h.number_of_stems || 0), 0))} stems</dd>
                <dt className="text-[var(--sd-quiet)]">Cost per seedling</dt>
                <dd className="tabular-nums">{b.cost_per_surviving_seedling ? kes(b.cost_per_surviving_seedling) : "—"}</dd>
              </dl>
            </Panel>
            <Panel title="Request">
              {d.request ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                  <dt className="text-[var(--sd-quiet)]">Request</dt>
                  <dd>{d.request.name}</dd>
                  <dt className="text-[var(--sd-quiet)]">Farm</dt>
                  <dd>{d.request.farm ?? "—"}</dd>
                  <dt className="text-[var(--sd-quiet)]">Needed by</dt>
                  <dd>{shortDate(d.request.required_by_date)}</dd>
                  <dt className="text-[var(--sd-quiet)]">Fulfilment</dt>
                  <dd className="tabular-nums">{qty(d.request.fulfilment_percentage, 0)}%</dd>
                  <dt className="text-[var(--sd-quiet)]">Status</dt>
                  <dd><StatusPill text={d.request.status} /></dd>
                </dl>
              ) : (
                <Empty>Not raised against a request.</Empty>
              )}
            </Panel>
            <Panel title="Invoices">
              {d.invoices.length ? (
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {d.invoices.map((i) => (
                    <li key={i.name} className="flex items-center justify-between gap-3">
                      <span>{i.name}</span>
                      <span className="tabular-nums text-[var(--sd-muted)]">{kes(i.grand_total)}</span>
                      <StatusPill text={i.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No sales invoices.</Empty>
              )}
            </Panel>
          </div>
          <Panel title="Daily logs">
            <DataTable columns={logCols} rows={d.logs} rowKey={(l) => l.name} empty="No work logged against this batch yet." search={false} />
          </Panel>
          <Panel title="Dispatches">
            <DataTable columns={dispCols} rows={d.dispatches} rowKey={(x) => x.name} empty="Nothing dispatched yet." search={false} />
          </Panel>
        </>
      ) : null}
    </Frame>
  );
}
