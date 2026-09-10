import { useEffect, useState } from "react";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import Pagination, { usePagination } from "../components/Pagination";
import { getMyRequests, MyRequest } from "../services/requests";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted — awaiting IT",
  needs_purchase: "Needs purchase",
  pending: "Fulfilled — awaiting approval",
  active: "Active",
  rejected: "Rejected",
  returned: "Returned",
};

const STATUS_TONE: Record<string, "slate" | "brand" | "emerald" | "amber" | "rose" | "sky"> = {
  submitted: "sky",
  needs_purchase: "amber",
  pending: "amber",
  active: "emerald",
  rejected: "rose",
  returned: "slate",
};

export default function MyRequests() {
  const [rows, setRows] = useState<MyRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { page, pageCount, pageRows, setPage, total, pageSize } = usePagination(rows, 10);

  useEffect(() => {
    getMyRequests()
      .then(setRows)
      .catch(() => setError("Could not load your requests."));
  }, []);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="My Requests"
        description="Everything you've requested or returned, and where it stands."
        count={error ? undefined : rows.length}
        countLabel="total"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && rows.length === 0 && (
        <div className="rounded-xl2 border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">No requests yet.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Device Type</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Purpose / Dept</th>
                  <th className="px-4 py-3">Specification</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.request_id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{r.request_id}</td>
                    <td className="px-4 py-2.5">{r.device_type_name}</td>
                    <td className="px-4 py-2.5">{r.requested_qty}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.purpose}
                      {r.department ? ` · ${r.department}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.asset_specification ?? "—"}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.asset_id ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(r.requested_at).toLocaleString()}</td>
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
