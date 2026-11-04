import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Empty } from "@/components/Panel";

/** The categorical palette, in the order charts take it (the SCP tokens). */
export const SERIES = [
  "var(--sd-data-green)",
  "var(--sd-data-cyan)",
  "var(--sd-data-amber)",
  "var(--sd-data-purple)",
  "var(--sd-data-pink)",
  "var(--sd-data-indigo)",
];

const AXIS = { fontSize: 11, fill: "var(--sd-quiet)" } as const;
const TIP = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--sd-line)",
    boxShadow: "var(--sd-shadow-2)",
    fontSize: 12,
  },
} as const;

const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US");

/** A vertical bar chart. */
export function Bars({ data, x, y, label, height = 260, color = SERIES[0] }: { data: Array<Record<string, unknown>>; x: string; y: string; label: string; height?: number; color?: string }) {
  if (!data.length || data.every((d) => !Number(d[y]))) return <Empty>Nothing recorded yet.</Empty>;
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--sd-line)" />
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={false} interval={data.length > 14 ? "preserveStartEnd" : 0} minTickGap={8} tickFormatter={(v) => (String(v).length > 11 ? `${String(v).slice(0, 10)}…` : String(v))} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={n} width={68} />
          <Tooltip {...TIP} formatter={(v) => n(v)} cursor={{ fill: "var(--sd-bg-soft)" }} />
          <Bar dataKey={y} name={label} fill={color} radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A horizontal bar chart, for a funnel read top to bottom. */
export function HBars({ data, name, value, label, height = 260 }: { data: Array<Record<string, unknown>>; name: string; value: string; label: string; height?: number }) {
  if (!data.length || data.every((d) => !Number(d[value]))) return <Empty>Nothing recorded yet.</Empty>;
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--sd-line)" />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={n} />
          <YAxis type="category" dataKey={name} tick={AXIS} tickLine={false} axisLine={false} width={120} />
          <Tooltip {...TIP} formatter={(v) => n(v)} cursor={{ fill: "var(--sd-bg-soft)" }} />
          <Bar dataKey={value} name={label} radius={[0, 6, 6, 0]} maxBarSize={26}>
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES[0]} fillOpacity={1 - i * 0.12} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A donut with a legend. */
export function Donut({ data, name, value, label, height = 260 }: { data: Array<Record<string, unknown>>; name: string; value: string; label: string; height?: number }) {
  const rows = data.filter((d) => Number(d[value]) > 0);
  if (!rows.length) return <Empty>Nothing recorded yet.</Empty>;
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey={value} nameKey={name} innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
            {rows.map((_, i) => (
              <Cell key={i} fill={SERIES[i % SERIES.length]} />
            ))}
          </Pie>
          <Tooltip {...TIP} formatter={(v) => n(v)} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A daily series as an area (volume) or a line (a rate of loss). */
export function Series({ data, x, y, label, kind = "area", color = SERIES[0], height = 260 }: { data: Array<Record<string, unknown>>; x: string; y: string; label: string; kind?: "area" | "line"; color?: string; height?: number }) {
  if (!data.length || data.every((d) => !Number(d[y]))) return <Empty>Nothing recorded yet.</Empty>;
  const short = (v: unknown) => String(v).slice(5);
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "area" ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--sd-line)" />
            <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} minTickGap={24} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={n} width={68} />
            <Tooltip {...TIP} formatter={(v) => n(v)} />
            <Area type="monotone" dataKey={y} name={label} stroke={color} fill={color} fillOpacity={0.16} strokeWidth={2} />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--sd-line)" />
            <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} minTickGap={24} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={n} width={68} />
            <Tooltip {...TIP} formatter={(v) => n(v)} />
            <Line type="monotone" dataKey={y} name={label} stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
