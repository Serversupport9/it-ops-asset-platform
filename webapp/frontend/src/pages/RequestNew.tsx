import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { DeviceType, getDeviceTypes, submitAssetRequest } from "../services/requests";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-[13px] font-medium text-slate-700";

export default function RequestNew() {
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [deviceTypeId, setDeviceTypeId] = useState("");
  const [assetSpecification, setAssetSpecification] = useState("");
  const [qty, setQty] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [department, setDepartment] = useState("");
  const [neededByDate, setNeededByDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getDeviceTypes()
      .then((types) => {
        setDeviceTypes(types);
        if (types.length > 0) setDeviceTypeId(String(types[0].device_type_id));
      })
      .catch(() => setError("Could not load device types."));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitAssetRequest({
        device_type_id: Number(deviceTypeId),
        requested_qty: Number(qty),
        purpose: purpose || undefined,
        department: department || undefined,
        needed_by_date: neededByDate || undefined,
        asset_specification: assetSpecification || undefined,
      });
      navigate("/requests/mine");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <PageHeader
        title="Request an Asset"
        description="Tell us what you need — IT will assign a specific unit (or arrange a purchase) and route it for approval."
      />
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl2 border border-slate-200 bg-white p-6 shadow-card">
        <div>
          <label className={labelClass}>Device Type</label>
          <select
            value={deviceTypeId}
            onChange={(e) => setDeviceTypeId(e.target.value)}
            className={inputClass}
            required
          >
            {deviceTypes.map((dt) => (
              <option key={dt.device_type_id} value={dt.device_type_id}>
                {dt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Asset Specification</label>
          <textarea
            value={assetSpecification}
            onChange={(e) => setAssetSpecification(e.target.value)}
            placeholder="e.g. HP / i7 / 16GB RAM / 512GB SSD / dedicated graphics card"
            rows={3}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Quantity</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className={labelClass}>Purpose</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. replacement for damaged laptop"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Department</label>
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Needed by</label>
          <input
            type="date"
            value={neededByDate}
            onChange={(e) => setNeededByDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || deviceTypes.length === 0}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {submitting ? "Submitting…" : "Submit request"}
        </button>
      </form>
    </div>
  );
}
