import { useEffect, useState } from "react";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import Pagination, { usePagination } from "../components/Pagination";
import { ActiveAsset, getMyAssets } from "../services/requests";

const STATUS_TONE: Record<string, "slate" | "emerald" | "amber" | "rose"> = {
  available: "emerald",
  in_use: "slate",
  pending_return: "amber",
  damaged: "rose",
  under_repair: "amber",
  retired: "slate",
  lost: "rose",
};

export default function MyAssets() {
  const [rows, setRows] = useState<ActiveAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { page, pageCount, pageRows, setPage, total, pageSize } = usePagination(rows, 10);

  useEffect(() => {
    getMyAssets()
      .then(setRows)
      .catch(() => setError("Could not load your assets."));
  }, []);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="My Assets"
        description="What's currently assigned to you, plus what you've recently returned to IT."
        count={error ? undefined : rows.length}
        countLabel="total"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && rows.length === 0 && (
        <div className="rounded-xl2 border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">Nothing assigned to you right now.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Asset Id</th>
                  <th className="px-4 py-3">Device Type</th>
                  <th className="px-4 py-3">Brand / Model</th>
                  <th className="px-4 py-3">Serial No.</th>
                  <th className="px-4 py-3">Office</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assignment</th>
                  <th className="px-4 py-3">High Value</th>
                  <th className="px-4 py-3">Condition Out</th>
                  <th className="px-4 py-3">Allocated</th>
                  <th className="px-4 py-3">Return Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.allocation_id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.asset_id}</td>
                    <td className="px-4 py-2.5">{r.device_type_name}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.brand ?? "—"} {r.model ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.serial_number ?? "—"}</td>
                    <td className="px-4 py-2.5">{r.office_name ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[r.asset_status] ?? "slate"}>{r.asset_status}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.allocation_status === "active" ? "emerald" : "slate"}>
                        {r.allocation_status === "active" ? "With you" : "Returned"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.is_high_value ? <Badge tone="amber">High value</Badge> : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.condition_out ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.allocated_at ? new Date(r.allocated_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.returned_at ? new Date(r.returned_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
