import { api } from "./api";

export interface CreateEmployeeLoginPayload {
  employee_id: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  date_of_joining?: string;
  role: string;
}

export interface CreateEmployeeLoginResult {
  employee_id: string;
  role: string;
  employee_created: boolean;
  temporary_password: string;
  warning: string;
}

export async function createEmployeeLogin(
  payload: CreateEmployeeLoginPayload,
): Promise<CreateEmployeeLoginResult> {
  const res = await api.post<CreateEmployeeLoginResult>("/api/v1/admin/employees", payload);
  return res.data;
}

export interface EmployeeRoleRow {
  employee_id: string;
  name: string;
  department: string | null;
  designation: string | null;
  employment_status: string;
  role: string | null;
  login_active: boolean | null;
}

export async function listEmployeeRoles(q?: string): Promise<EmployeeRoleRow[]> {
  const res = await api.get<EmployeeRoleRow[]>("/api/v1/admin/employees", { params: q ? { q } : {} });
  return res.data;
}

export async function changeEmployeeRole(employeeId: string, role: string) {
  const res = await api.patch(`/api/v1/admin/employees/${employeeId}/role`, { role });
  return res.data;
}
