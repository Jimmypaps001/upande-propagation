import { useMemo, useState } from "react";
import { Frame } from "@/components/Frame";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { Bars, Donut, HBars, Series, SERIES } from "@/components/charts";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import { dispatchBook, nurseryLogs, overview, requestsBook, type RequestRow } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useLoad } from "@/lib/use-load";
import { qty, kes, shortDate } from "@/lib/format";
import { routeHash } from "@/lib/router";
import { todayISO, ymd } from "@/lib/utils";

function lastDays(n: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - n);
  return { from: ymd(from), to: todayISO() };
}

/**
 * Everything the Propagation workspace used to show: the eight number cards and
 * the six charts, from the same sources (get_overview, get_dispatch_book,
 * get_nursery_logs, get_requests), plus the batches that are open now.
 */
export function Dashboard() {
  const { farm } = useFarm();
  const [range, setRange] = useState<DateRange>(() => lastDays(30));

  const ov = useLoad(() => overview(farm), [farm]);
  const book = useLoad(() => dispatchBook(farm, range.from, range.to), [farm, range.from, range.to]);
  const logs = useLoad(() => nurseryLogs(farm, range.from, range.to), [farm, range.from, range.to]);
  const reqs = useLoad(() => requestsBook(farm, true), [farm]);

  const k = ov.data?.kpis;
  const loading = ov.loading;
  const refresh = () => {
    ov.reload();
    book.reload();
    logs.reload();
    reqs.reload();
  };

  const stageData = useMemo(() => (ov.data?.pipeline ?? []).map((p) => ({ stage: p.stage, seedlings: p.seedlings })), [ov.data]);
  const funnel = useMemo(() => (ov.data?.funnel ?? []).map((f) => ({ step: f.label, value: f.value })), [ov.data]);

  const requestCols: Column<RequestRow>[] = [
    { key: "name", label: "Request" },
    { key: "farm", label: "Farm" },
    { key: "required_by_date", label: "Needed by", render: (r) => shortDate(r.required_by_date) },
    { key: "total_qty_requested", label: "Requested", align: "right", render: (r) => qty(r.total_qty_requested) },
    { key: "total_qty_dispatched", label: "Dispatched", align: "right", render: (r) => qty(r.total_qty_dispatched) },
    { key: "status", label: "Status", render: (r) => <StatusPill text={r.overdue ? "Overdue" : r.status} /> },
  ];

  return (
    <Frame
      view="dashboard"
      description="The nursery at a glance: what is standing in it, what is ready to leave, what the farms have asked for and what has gone."
      controls={<DateRangePicker value={range} onChange={setRange} label="Chart range" />}
      loading={loading}
      hasData={!!ov.data}
      error={ov.error}
      onRefresh={refresh}
    >
      <KpiGrid>
        <KpiCard label="Active batches" value={k?.active_batches ?? 0} hint="Not yet completed" href={routeHash("batches")} loading={loading} />
        <KpiCard label="Seedlings in the nursery" value={k?.in_nursery ?? 0} hint="Surviving across open batches" tone="good" loading={loading} />
        <KpiCard label="Ready to dispatch" value={k?.ready ?? 0} hint="Available to leave for a farm" tone="good" loading={loading} />
        <KpiCard label="Open seedling requests" value={k?.open_requests ?? 0} hint="Submitted or part fulfilled" href={routeHash("requests")} loading={loading} />
        <KpiCard label="Planted this month" value={k?.planted_this_month ?? 0} hint="Internal planting dispatches" loading={loading} />
        <KpiCard label="Sold this month" value={k?.sold_this_month ?? 0} hint="Seedlings dispatched on sale" loading={loading} />
        <KpiCard label="Sales this month" value={kes(k?.revenue_this_month)} hint="Value of seedling sales" loading={loading} />
        <KpiCard
          label="Cuttings lost"
          value={k?.mortality ?? 0}
          hint={k ? `${k.mortality_rate}% of those stuck` : undefined}
          tone={k && k.mortality_rate > 10 ? "critical" : "default"}
          loading={loading}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Propagation funnel" description="Cuttings in, seedlings out (open batches)">
          <HBars data={funnel} name="step" value="value" label="Plants" />
        </Panel>
        <Panel title="Seedlings by nursery stage" description="Surviving seedlings sitting at each stage">
          <Bars data={stageData} x="stage" y="seedlings" label="Seedlings" />
        </Panel>
        <Panel title="Seedling dispatch split" description="Seedlings dispatched, by purpose, in the range">
          <Donut data={book.data?.by_purpose ?? []} name="purpose" value="qty" label="Seedlings" />
        </Panel>
        <Panel title="Seedling request fulfilment" description="All requests, by status">
          <Donut data={reqs.data?.by_status ?? []} name="status" value="requests" label="Requests" />
        </Panel>
        <Panel title="Nursery work logged" description="Plants handled each day, in the range">
          <Series data={logs.data?.by_day ?? []} x="log_date" y="done" label="Plants handled" color={SERIES[0]} />
        </Panel>
        <Panel title="Nursery mortality" description="Plants lost each day, in the range">
          <Series data={logs.data?.by_day ?? []} x="log_date" y="dead" label="Plants lost" kind="line" color="var(--sd-data-red)" />
        </Panel>
      </div>

      <Panel title="Requests still to meet" description="Open requests, soonest first">
        <DataTable
          columns={requestCols}
          rows={ov.data?.requests ?? null}
          loading={loading}
          rowKey={(r) => r.name}
          rowHref={() => routeHash("requests")}
          search={false}
          empty="No open seedling requests."
        />
      </Panel>
    </Frame>
  );
}
