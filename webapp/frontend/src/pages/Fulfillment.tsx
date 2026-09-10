import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import Pagination, { usePagination } from "../components/Pagination";
import {
  AvailableAsset,
  fulfillRequest,
  getAvailableAssets,
  getUnfulfilledRequests,
  markNeedsPurchase,
  UnfulfilledRequest,
} from "../services/requests";

export default function Fulfillment() {
  const [rows, setRows] = useState<UnfulfilledRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [assetIdById, setAssetIdById] = useState<Record<number, string>>({});
  const [availableByType, setAvailableByType] = useState<Record<number, AvailableAsset[]>>({});
  const { page, pageCount, pageRows, setPage, total, pageSize } = usePagination(rows, 10);

  async function load() {
    try {
      setRows(await getUnfulfilledRequests());
    } catch {
      setError("Could not load unfulfilled requests.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Which asset rows have spare qty for each device type, so IT isn't picking an asset_id blind -
  // a bundle row (qty > 1, e.g. 7 mobiles on one row) can be partially fulfilled; Portal - Fulfill
  // Asset Request splits it automatically (the design notes open item 1). Fetched once per device type
  // seen on this page, refreshed whenever the unfulfilled list reloads (a prior fulfillment may
  // have changed remaining qty).
  useEffect(() => {
    const typeIds = Array.from(new Set(rows.map((r) => r.device_type_id)));
    typeIds.forEach((id) => {
      getAvailableAssets(id)
        .then((assets) => setAvailableByType((prev) => ({ ...prev, [id]: assets })))
        .catch(() => {
          /* non-fatal - IT can still type an asset_id manually */
        });
    });
  }, [rows]);

  async function handleFulfill(requestId: number) {
    const assetId = (assetIdById[requestId] || "").trim();
    if (!assetId) {
      setError("Enter an Asset Id to fulfill this request.");
      return;
    }
    setBusyId(requestId);
    setError(null);
    try {
      await fulfillRequest(requestId, assetId);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not fulfill request.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleNeedsPurchase(requestId: number) {
    setBusyId(requestId);
    setError(null);
    try {
      await markNeedsPurchase(requestId);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not mark as needs purchase.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Fulfill Requests"
        description="Pick a specific available asset for each request, or flag it for purchase if nothing's in stock. Fulfilled requests move to Approvals for final sign-off."
        count={error ? undefined : rows.length}
        countLabel="pending"
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {rows.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">Nothing waiting on fulfillment.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Device Type</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Purpose / Dept</th>
                  <th className="px-4 py-3">Specification</th>
                  <th className="px-4 py-3">Needed by</th>
                  <th className="px-4 py-3">Assign Asset Id</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.request_id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{r.request_id}</td>
                    <td className="px-4 py-2.5">{r.device_type_name}</td>
                    <td className="px-4 py-2.5">{r.requested_qty}</td>
                    <td className="px-4 py-2.5">
                      {r.employee_name} <span className="text-slate-400">({r.employee_id})</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.purpose}
                      {r.department ? ` · ${r.department}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.asset_specification ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.needed_by_date ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <input
                        value={assetIdById[r.request_id] ?? ""}
                        onChange={(e) =>
                          setAssetIdById((prev) => ({ ...prev, [r.request_id]: e.target.value }))
                        }
                        placeholder="IT0123"
                        list={`avail-${r.device_type_id}`}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                      <datalist id={`avail-${r.device_type_id}`}>
                        {(availableByType[r.device_type_id] ?? []).map((a) => (
                          <option key={a.asset_id} value={a.asset_id}>
                            {a.qty} available{a.brand ? ` · ${a.brand}` : ""}
                            {a.model ? ` ${a.model}` : ""}
                            {a.office_name ? ` · ${a.office_name}` : ""}
                          </option>
                        ))}
                      </datalist>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {r.device_type_id in availableByType
                          ? availableByType[r.device_type_id]!.length > 0
                            ? `${availableByType[r.device_type_id]!.length} asset row(s) available — picking one with more than ${r.requested_qty} splits it automatically`
                            : "no available assets of this type — try Needs purchase"
                          : "loading available assets…"}
                      </p>
                    </td>
                    <td className="space-x-2 px-4 py-2.5">
                      <button
                        disabled={busyId === r.request_id}
                        onClick={() => handleFulfill(r.request_id)}
                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                      >
                        Assign
                      </button>
                      <button
                        disabled={busyId === r.request_id}
                        onClick={() => handleNeedsPurchase(r.request_id)}
                        className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                      >
                        Needs purchase
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
