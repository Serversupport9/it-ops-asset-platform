import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getRole } from "../services/auth";
import { ActiveAsset, getMyAssets, markLost, submitReturn, writeOffAsset } from "../services/requests";

const ADMIN_ROLES = ["it", "management", "super_admin"];
const APPROVER_ROLES = ["management", "super_admin"];

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-[13px] font-medium text-slate-700";

export default function ReturnNew() {
  const canActOnBehalf = ADMIN_ROLES.includes(getRole() ?? "");
  // Lost/Written Off are consequential inventory-register decisions, not routine self-service -
  // same access tier as Approve/Reject, not the wider "it" visibility tier.
  const canMarkLostOrWrittenOff = APPROVER_ROLES.includes(getRole() ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [assets, setAssets] = useState<ActiveAsset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [condition, setCondition] = useState("Good");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function loadAssets(forEmployeeId?: string) {
    setLoadingAssets(true);
    setError(null);
    try {
      // getMyAssets now also includes recently-returned allocations (so My Assets can show a
      // return date) - only offer what's still active here, or someone could try to return an
      // asset a second time.
      const list = (await getMyAssets(forEmployeeId)).filter((a) => a.allocation_status === "active");
      setAssets(list);
      setAssetId(list.length > 0 ? list[0].asset_id : "");
    } catch {
      setAssets([]);
      setError("Could not load assets.");
    } finally {
      setLoadingAssets(false);
    }
  }

  useEffect(() => {
    // Always load on mount, blank employeeId correctly resolves to "my own assets" server-side
    // regardless of role - admin roles can still re-fetch for someone else via the onBlur below.
    // Previously only non-admin roles loaded here, so an admin landing on this page to return
    // their OWN asset saw a stuck "No active assets" dropdown until they clicked into and out of
    // the (optional-looking) Employee Id field - found live during the 2026-08-28 audit.
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!assetId) {
      setError("Select an asset to return.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitReturn({
        asset_id: assetId,
        employee_id: canActOnBehalf ? employeeId || undefined : undefined,
        condition_in: condition,
        notes,
      });
      navigate("/requests/mine");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not submit return.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkLost() {
    if (!assetId) {
      setError("Select an asset first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await markLost(assetId, notes);
      navigate("/approvals");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not mark asset lost.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWriteOff() {
    if (!assetId) {
      setError("Select an asset first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await writeOffAsset(assetId, condition, notes);
      navigate("/approvals");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not write off asset.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <PageHeader title="Return an Asset" />
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl2 border border-slate-200 bg-white p-6 shadow-card">
        {canActOnBehalf && (
          <div>
            <label className={labelClass}>Employee Id</label>
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              onBlur={() => loadAssets(employeeId || undefined)}
              placeholder="IPACxxxx — leave blank to return your own asset"
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Asset</label>
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            disabled={loadingAssets || assets.length === 0}
            className={inputClass}
            required
          >
            {assets.length === 0 ? (
              <option value="">{loadingAssets ? "Loading…" : "No active assets"}</option>
            ) : (
              assets.map((a) => (
                <option key={a.asset_id} value={a.asset_id}>
                  {a.asset_id} — {a.device_type_name}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className={labelClass}>Condition on return</label>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputClass}>
            <option>Good</option>
            <option>Fair</option>
            <option>Damaged</option>
            <option>Not Working</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={3} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !assetId}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {submitting ? "Submitting…" : "Submit return"}
        </button>

        {canMarkLostOrWrittenOff && (
          <div className="flex gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleMarkLost}
              disabled={submitting || !assetId}
              className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              Mark Lost
            </button>
            <button
              type="button"
              onClick={handleWriteOff}
              disabled={submitting || !assetId}
              className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              Write Off
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
