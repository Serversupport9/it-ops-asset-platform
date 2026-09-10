import { ReactNode } from "react";

type Tone = "slate" | "brand" | "emerald" | "amber" | "rose";

const TONE_CLASSES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-600",
  brand: "bg-gradient-to-br from-blue-500 to-sky-400 text-white shadow-sm shadow-blue-500/30",
  emerald: "bg-gradient-to-br from-emerald-500 to-emerald-400 text-white shadow-sm shadow-emerald-500/30",
  amber: "bg-gradient-to-br from-accent-500 to-accent-400 text-white shadow-sm shadow-accent-500/30",
  rose: "bg-gradient-to-br from-rose-500 to-rose-400 text-white shadow-sm shadow-rose-500/30",
};

export default function StatCard({
  label,
  value,
  icon,
  tone = "slate",
  hint,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-xl2 border border-slate-200/70 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${TONE_CLASSES[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}
