import { useEffect, useState } from "react";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import Pagination, { usePagination } from "../components/Pagination";
import { changeEmployeeRole, EmployeeRoleRow, listEmployeeRoles } from "../services/admin";
import { getRole } from "../services/auth";

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "it", label: "IT" },
  { value: "management", label: "Management" },
  { value: "super_admin", label: "Super Admin" },
];

const ROLE_TONE: Record<string, "slate" | "brand" | "emerald" | "amber" | "rose" | "sky"> = {
  employee: "slate",
  it: "sky",
  management: "brand",
  super_admin: "amber",
};

export default function Roles() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<EmployeeRoleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Visible to it/management/super_admin (backend requires ADMIN_ROLES), but only
  // management/super_admin can actually change a role - matches the backend's stricter
  // APPROVER_ROLES gate on the PATCH itself (changing an existing person's privilege level is
  // more sensitive than the employee-only logins 'it' may create on Add Employee).
  const canChange = getRole() === "management" || getRole() === "super_admin";
  const { page, pageCount, pageRows, setPage, total, pageSize } = usePagination(rows, 12);

  async function load() {
    try {
      setError(null);
      setRows(await listEmployeeRoles(q || undefined));
    } catch {
      setError("Could not load employees.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleChange(row: EmployeeRoleRow, newRole: string) {
    if (newRole === row.role) return;
    setBusyId(row.employee_id);
    setError(null);
    try {
      await changeEmployeeRole(row.employee_id, newRole);
      setRows((prev) =>
        prev.map((r) => (r.employee_id === row.employee_id ? { ...r, role: newRole } : r)),
      );
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not change this employee's role.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Roles"
        description="See and change what each employee can do in the portal."
        count={error ? undefined : rows.length}
        countLabel="employees"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl2 border border-slate-200/70 bg-white p-3 shadow-card">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search employee id or name…"
          className="w-full flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-72 sm:flex-none"
        />
        <button
          onClick={load}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/25 transition-all hover:shadow-md hover:shadow-blue-500/30 active:scale-[0.98]"
        >
          Search
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {!canChange && (
        <p className="mb-4 text-xs text-slate-400">
          View only — only management/super_admin can change a role.
        </p>
      )}
      {rows.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">No employees match.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee Id</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Current Role</th>
                  <th className="px-4 py-3">Change Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.employee_id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.employee_id}</td>
                    <td className="px-4 py-2.5">{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.department ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.designation ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.role ? (
                        <Badge tone={ROLE_TONE[r.role] ?? "slate"}>
                          {ROLE_OPTIONS.find((o) => o.value === r.role)?.label ?? r.role}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-300">No login</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.role && canChange ? (
                        <select
                          value={r.role}
                          disabled={busyId === r.employee_id}
                          onChange={(e) => handleChange(r, e.target.value)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                        >
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-300">{r.role ? "—" : "Needs a login first"}</span>
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
