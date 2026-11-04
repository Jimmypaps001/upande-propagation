import { useState } from "react";
import { Frame } from "@/components/Frame";
import { Panel } from "@/components/Panel";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { TogglePill } from "@/components/TogglePill";
import { traceability } from "@/lib/api";
import { useFarm } from "@/lib/farm";
import { useCrop, useHref } from "@/lib/crops";
import { useLoad } from "@/lib/use-load";
import { qty, shortDate } from "@/lib/format";

type Row = Record<string, unknown>;

/** The Propagation Traceability script report, run through Frappe's own runner so it can never drift from the desk's. */
export function Traceability() {
  const { farm } = useFarm();
  const { cropKey } = useCrop();
  const href = useHref();
  const [completed, setCompleted] = useState(false);
  const r = useLoad(
    () => traceability({ ...(farm ? { company: farm } : {}), ...(cropKey ? { crop: cropKey } : {}), include_completed: completed ? 1 : 0 }),
    [farm, cropKey, completed],
  );
  const columns: Column<Row>[] = (r.data?.columns ?? []).map((c) => ({
    key: c.fieldname,
    label: c.label,
    align: c.fieldtype === "Int" || c.fieldtype === "Currency" ? ("right" as const) : undefined,
    render: (row: Row) => {
      const v = row[c.fieldname];
      if (v == null || v === "") return "—";
      if (c.fieldtype === "Date") return shortDate(String(v));
      if (c.fieldtype === "Int") return qty(Number(v));
      if (c.fieldtype === "Currency") return qty(Number(v), 2);
      if (c.fieldname === "status") return <StatusPill text={String(v)} />;
      if (c.fieldname === "document" && row.document_type === "Propagation Batch") {
        return <a className="no-underline hover:underline" href={href("batches", String(v))}>{String(v)}</a>;
      }
      return String(v);
    },
  }));

  return (
    <Frame
      view="traceability"
      description="Each batch followed from the budwood it came from to the plants that left: every document that touched it, in order."
      controls={<TogglePill pressed={completed} onPressedChange={setCompleted}>Include completed</TogglePill>}
      loading={r.loading}
      hasData={!!r.data}
      error={r.error}
      onRefresh={r.reload}
    >
      <Panel title="Propagation traceability" description="Up to the 20 newest batches are traced per run">
        <DataTable columns={columns} rows={(r.data?.result as Row[]) ?? null} loading={r.loading} rowKey={(x, i) => `${i}-${String(x.document)}`} empty="Nothing to trace yet." tall />
      </Panel>
    </Frame>
  );
}
