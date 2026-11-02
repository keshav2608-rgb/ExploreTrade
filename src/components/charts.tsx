"use client";

/**
 * Recharts wrappers. Each chart has a text summary next to it (SRS §8.4)
 * so the key values are available without the picture.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmtInr = (v: number) => "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

export function PriceChart({ data, label }: { data: Array<{ t: string; close: number }>; label: string }) {
  if (data.length === 0) return null;
  const first = data[0].close, last = data[data.length - 1].close;
  const change = ((last - first) / first) * 100;
  return (
    <figure>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b6fe3" stopOpacity={0.25} /><stop offset="100%" stopColor="#3b6fe3" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtDate} tick={{ fontSize: 11 }} minTickGap={32} />
            <YAxis domain={["auto", "auto"]} tickFormatter={fmtInr} tick={{ fontSize: 11 }} width={70} />
            <Tooltip formatter={(v: number) => [fmtInr(v), "Close"]} labelFormatter={(l) => new Date(String(l)).toLocaleDateString("en-IN", { dateStyle: "medium" })} />
            <Area type="monotone" dataKey="close" stroke="#3b6fe3" fill="url(#g)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-ink-muted">
        {label}: {data.length} daily closes from {fmtDate(data[0].t)} to {fmtDate(data[data.length - 1].t)}, first {fmtInr(first)}, last {fmtInr(last)} ({change >= 0 ? "+" : ""}{change.toFixed(1)}%).
      </figcaption>
    </figure>
  );
}

export function PortfolioChart({ data }: { data: Array<{ t: string; marketValue: number; investedValue: number }> }) {
  if (data.length === 0) return null;
  return (
    <figure>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtDate} tick={{ fontSize: 11 }} minTickGap={32} />
            <YAxis domain={["auto", "auto"]} tickFormatter={fmtInr} tick={{ fontSize: 11 }} width={70} />
            <Tooltip formatter={(v: number, n: string) => [fmtInr(v), n === "marketValue" ? "Market value" : "Invested"]} labelFormatter={(l) => new Date(String(l)).toLocaleDateString("en-IN", { dateStyle: "medium" })} />
            <Area type="monotone" dataKey="investedValue" stroke="#9ca3af" fill="#f3f4f6" strokeWidth={1} dot={false} />
            <Area type="monotone" dataKey="marketValue" stroke="#3b6fe3" fill="#dbe6fe" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-ink-muted">
        {data.length} daily valuations; latest market value {fmtInr(data[data.length - 1].marketValue)} against {fmtInr(data[data.length - 1].investedValue)} invested.
      </figcaption>
    </figure>
  );
}

const PALETTE = ["#3b6fe3", "#15803d", "#b45309", "#7c3aed", "#0e7490", "#be185d", "#4d7c0f", "#6b7280", "#1d4ed8", "#9f1239"];

export function AllocationChart({ data, title }: { data: Array<{ label: string; value: number; percent: number }>; title: string }) {
  if (data.length === 0) return null;
  const top = data.slice(0, 9);
  const rest = data.slice(9);
  const series = rest.length ? [...top, { label: "Other", value: rest.reduce((a, r) => a + r.value, 0), percent: rest.reduce((a, r) => a + r.percent, 0) }] : top;
  return (
    <figure className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
      <div className="h-40">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={series} dataKey="value" nameKey="label" innerRadius={45} outerRadius={70} paddingAngle={1}>
              {series.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number, _n, p) => [`${fmtInr(v)} (${(p.payload as { percent: number }).percent.toFixed(1)}%)`, (p.payload as { label: string }).label]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm">
        <div className="mb-1 font-medium">{title}</div>
        <ul className="space-y-0.5">
          {series.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="flex-1">{s.label}</span><span className="num text-ink-muted">{s.percent.toFixed(1)}%</span></li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

export function ContributorsChart({ data }: { data: Array<{ label: string; value: number }> }) {
  if (data.length === 0) return null;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" tickFormatter={fmtInr} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => [fmtInr(v), "Day change"]} />
          <Bar dataKey="value">{data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? "#15803d" : "#b91c1c"} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
