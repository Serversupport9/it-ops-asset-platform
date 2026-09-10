import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import {
  IconAlertTriangle,
  IconBox,
  IconCheckSquare,
  IconLayers,
  IconList,
  IconTag,
} from "../components/icons";
import { DashboardSummary, getDashboardSummary } from "../services/dashboard";
import { getMetabaseEmbedUrl } from "../services/metabase";

export default function Dashboard() {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    getMetabaseEmbedUrl()
      .then(setEmbedUrl)
      .catch(() => setEmbedError("Could not load the dashboard. Try again shortly."));
    getDashboardSummary()
      .then(setSummary)
      .catch(() => setSummaryError("Could not load summary stats."));
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader title="IT Ops Summary" description="Live snapshot of assets, requests, and risk flags." />

      {summaryError && <p className="mb-4 text-sm text-red-600">{summaryError}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Asset Units"
          value={summary ? summary.total_asset_units : "—"}
          icon={<IconLayers className="h-5 w-5" />}
          tone="brand"
          hint="Sum of qty across all rows"
        />
        <StatCard
          label="Available"
          value={summary ? summary.available_count : "—"}
          icon={<IconBox className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label="In Use"
          value={summary ? summary.in_use_count : "—"}
          icon={<IconBox className="h-5 w-5" />}
          tone="slate"
        />
        <StatCard
          label="Pending Return"
          value={summary ? summary.pending_return_count : "—"}
          icon={<IconBox className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="High Value Assets"
          value={summary ? summary.high_value_count : "—"}
          icon={<IconTag className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Unfulfilled Requests"
          value={summary ? summary.unfulfilled_requests : "—"}
          icon={<IconList className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Pending Approvals"
          value={summary ? summary.pending_approvals : "—"}
          icon={<IconCheckSquare className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Open Risk Flags"
          value={summary ? summary.open_rental_risk + summary.open_offboarding_risk : "—"}
          icon={<IconAlertTriangle className="h-5 w-5" />}
          tone="rose"
          hint={summary ? `${summary.open_rental_risk} rental · ${summary.open_offboarding_risk} offboarding` : undefined}
        />
      </div>

      <div className="rounded-xl2 border border-slate-200 bg-white p-2 shadow-card sm:p-3">
        <div className="mb-1 flex items-center justify-between px-2 pt-1">
          <h2 className="text-sm font-semibold text-slate-700">Full Reporting Dashboard</h2>
        </div>
        {embedError && <p className="px-2 py-6 text-sm text-red-600">{embedError}</p>}
        {!embedError && !embedUrl && <p className="px-2 py-6 text-sm text-slate-500">Loading dashboard…</p>}
        {embedUrl && (
          <iframe
            src={embedUrl}
            title="IT Ops Daily & Weekly Summary"
            className="h-[75vh] w-full rounded-lg"
            allowTransparency
          />
        )}
      </div>
    </div>
  );
}
