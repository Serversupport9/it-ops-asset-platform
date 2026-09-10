import { useState } from "react";
import PageHeader from "../components/PageHeader";
import { createEmployeeLogin, CreateEmployeeLoginResult } from "../services/admin";
import { getRole } from "../services/auth";

const emptyForm = {
  employee_id: "",
  name: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  date_of_joining: "",
  role: "employee",
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-[13px] font-medium text-slate-700";

export default function AddEmployee() {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateEmployeeLoginResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 'it' can only ever create employee-role logins (backend enforces this too, rule against
  // privilege escalation) - hide the other options rather than let them pick and get a 403.
  const canGrantElevatedRoles = getRole() === "management" || getRole() === "super_admin";

  function update<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const payload = {
        ...form,
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        department: form.department.trim() || undefined,
        designation: form.designation.trim() || undefined,
        date_of_joining: form.date_of_joining || undefined,
      };
      const res = await createEmployeeLogin(payload);
      setResult(res);
      setForm(emptyForm);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not create the login.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!result) return;
    await navigator.clipboard.writeText(result.temporary_password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <PageHeader
        title="Add Employee"
        description="Onboarding is reactive here — create a login when someone first needs an asset, then share the password with them yourself. If the employee_id already exists, only a new login is created; their existing details aren't touched."
      />

      {result && (
        <div className="mb-4 rounded-xl2 border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-800">
            Login created for {result.employee_id} ({result.role})
            {result.employee_created ? " — new employee record created too." : ""}
          </p>
          <p className="mt-2 text-slate-700">Temporary password (shown once, not stored anywhere):</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded-md border border-emerald-200 bg-white px-2 py-1 font-mono text-sm">
              {result.temporary_password}
            </code>
            <button
              onClick={copyPassword}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{result.warning}</p>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl2 border border-slate-200 bg-white p-6 shadow-card">
        <div>
          <label className={labelClass}>Employee ID</label>
          <input
            required
            value={form.employee_id}
            onChange={(e) => update("employee_id", e.target.value)}
            placeholder="IPACxxxx"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Name</label>
          <input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">Ignored if employee_id already exists.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input value={form.phone} onChange={(e) => update("phone", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Designation</label>
            <input
              value={form.designation}
              onChange={(e) => update("designation", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Date of joining</label>
            <input
              type="date"
              value={form.date_of_joining}
              onChange={(e) => update("date_of_joining", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Portal role</label>
            <select value={form.role} onChange={(e) => update("role", e.target.value)} className={inputClass}>
              <option value="employee">Employee (self-service only)</option>
              {canGrantElevatedRoles && (
                <>
                  <option value="it">IT (full visibility, no approve/reject)</option>
                  <option value="management">Management (full access + approve/reject)</option>
                  <option value="super_admin">Super Admin</option>
                </>
              )}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {busy ? "Creating…" : "Create login"}
        </button>
      </form>
    </div>
  );
}
