import { useEffect, useState } from "react";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import Pagination, { usePagination } from "../components/Pagination";
import { getRole } from "../services/auth";
import {
  approveAssetRequest,
  DecisionAction,
  DecisionLogRow,
  getDecisions,
  rejectAssetRequest,
} from "../services/requests";

const TABS: { label: string; action: DecisionAction | undefined }[] = [
  { label: "Submitted", action: "submitted" },
  { label: "Fulfilled (legacy)", action: "fulfilled" },
  { label: "Approved", action: "approved" },
  { label: "Rejected", action: "rejected" },
  { label: "Needs Purchase", action: "needs_purchase" },
  { label: "Returned", action: "returned" },
  { label: "Lost", action: "lost" },
  { label: "Written Off", action: "written_off" },
  { label: "All", action: undefined },
];

const ACTION_LABEL: Record<DecisionAction, string> = {
  submitted: "Submitted",
  fulfilled: "Pending",
  needs_purchase: "Needs Purchase",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned",
  lost: "Lost",
  written_off: "Written Off",
};

const ACTION_TONE: Record<DecisionAction, "slate" | "brand" | "emerald" | "amber" | "rose" | "sky"> = {
  submitted: "sky",
  fulfilled: "amber",
  needs_purchase: "amber",
  approved: "emerald",
  rejected: "rose",
  returned: "slate",
  lost: "rose",
  written_off: "slate",
};

export default function Approvals() {
  const [activeTab, setActiveTab] = useState<DecisionAction | undefined>("submitted");
  const [rows, setRows] = useState<DecisionLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // "it" has full visibility into this page but cannot decide - backend also enforces this
  // (require_role on /approve and /reject), this just avoids offering buttons that would 403.
  const canDecide = getRole() === "management" || getRole() === "super_admin";
  const { page, pageCount, pageRows, setPage, total, pageSize } = usePagination(rows, 12);

  async function load(action: DecisionAction | undefined) {
    setError(null);
    try {
      const { total: apiTotal, items } = await getDecisions(action);
      setRows(items);
      setTotalCount(apiTotal);
    } catch {
      setError("Could not load requests.");
    }
  }

  useEffect(() => {
    load(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Current request-level gate - approves/rejects the raw request before IT picks a unit.
  async function handleApproveRequest(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await approveAssetRequest(id);
      await load(activeTab);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not approve.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectRequest(id: number) {
    const reason = window.prompt("Reason for rejecting this request?") ?? undefined;
    setBusyId(id);
    setError(null);
    try {
      await rejectAssetRequest(id, reason);
      await load(activeTab);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not reject.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Approvals"
        description="Review requests, approve or reject, and track the full decision history."
        count={error ? undefined : totalCount}
        countLabel="in this view"
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl2 border border-slate-200 bg-white p-1.5 shadow-card">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(tab.action)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              activeTab === tab.action
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {rows.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">Nothing here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Device Type</th>
                  <th className="px-4 py-3">Specification</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Decided</th>
                  <th className="px-4 py-3">Decided By</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.log_id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{r.allocation_id ?? r.request_id}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Badge>
                    </td>
                    <td className="px-4 py-2.5">{r.device_type_name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.asset_specification ?? "—"}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.asset_id ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.employee_name} <span className="text-slate-400">({r.employee_id})</span>
                    </td>
                    <td className="px-4 py-2.5">{r.requested_qty}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.request_date ? new Date(r.request_date).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.decision_date ? new Date(r.decision_date).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.decided_by ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.notes ?? "—"}</td>
                    <td className="space-x-2 px-4 py-2.5">
                      {r.action === "submitted" && r.request_id !== null && canDecide && (
                        <>
                          <button
                            disabled={busyId === r.request_id}
                            onClick={() => handleApproveRequest(r.request_id as number)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busyId === r.request_id}
                            onClick={() => handleRejectRequest(r.request_id as number)}
                            className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.action === "submitted" && !canDecide && (
                        <span className="text-xs text-slate-400">View only</span>
                      )}
                      {r.action === "fulfilled" && (
                        <span className="text-xs text-slate-400">
                          {r.allocation_id !== null ? "Legacy step — no longer actionable" : "View only"}
                        </span>
                      )}
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
