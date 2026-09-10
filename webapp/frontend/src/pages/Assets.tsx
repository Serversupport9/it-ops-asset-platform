import { useEffect, useState } from "react";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import Pagination, { usePagination } from "../components/Pagination";
import { AssetRow, searchAssets, setAssetHighValue } from "../services/requests";

const STATUS_TONE: Record<string, "slate" | "emerald" | "amber" | "rose"> = {
  available: "emerald",
  in_use: "slate",
  pending_return: "amber",
  damaged: "rose",
  under_repair: "amber",
  retired: "slate",
  lost: "rose",
};

export default function Assets() {
  const [q, setQ] = useState("");
  const [highValueOnly, setHighValueOnly] = useState(false);
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { page, pageCount, pageRows, setPage, total, pageSize } = usePagination(rows, 12);

  async function load() {
    try {
      setError(null);
      const { total: apiTotal, items } = await searchAssets(q || undefined, highValueOnly || undefined);
      setRows(items);
      setTotalCount(apiTotal);
    } catch {
      setError("Could not load assets.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highValueOnly]);

  async function handleToggle(row: AssetRow) {
    setBusyId(row.asset_id);
    setError(null);
    try {
      const next = !row.is_high_value;
      await setAssetHighValue(row.asset_id, next);
      setRows((prev) =>
        prev.map((r) => (r.asset_id === row.asset_id ? { ...r, is_high_value: next } : r)),
      );
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not update this asset.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Assets"
        description="Search any asset and mark it high value — flagged assets get extra attention in offboarding and rental-risk checks."
        count={error ? undefined : totalCount}
        countLabel={highValueOnly ? "high value" : "total"}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl2 border border-slate-200/70 bg-white p-3 shadow-card">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search asset id, brand, model, serial…"
          className="w-full flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-72 sm:flex-none"
        />
        <button
          onClick={load}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/25 transition-all hover:shadow-md hover:shadow-blue-500/30 active:scale-[0.98]"
        >
          Search
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={highValueOnly}
            onChange={(e) => setHighValueOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          High value only
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {rows.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">No assets match.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Asset Id</th>
                  <th className="px-4 py-3">Device Type</th>
                  <th className="px-4 py-3">Brand / Model</th>
                  <th className="px-4 py-3">Office</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Held By</th>
                  <th className="px-4 py-3">High Value</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.asset_id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.asset_id}</td>
                    <td className="px-4 py-2.5">{r.device_type_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.brand ?? "—"} {r.model ?? ""}
                    </td>
                    <td className="px-4 py-2.5">{r.office_name ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[r.asset_status] ?? "slate"}>{r.asset_status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.current_employee_name
                        ? `${r.current_employee_name} (${r.current_employee_id})`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.is_high_value ? <Badge tone="amber">High value</Badge> : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        disabled={busyId === r.asset_id}
                        onClick={() => handleToggle(r)}
                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                      >
                        {r.is_high_value ? "Unmark" : "Mark high value"}
                      </button>
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
