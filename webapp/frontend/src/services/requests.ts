import { api } from "./api";

export type DecisionAction =
  | "submitted"
  | "fulfilled"
  | "needs_purchase"
  | "approved"
  | "rejected"
  | "returned"
  | "lost"
  | "written_off";

export interface DecisionLogRow {
  log_id: number;
  request_id: number | null;
  allocation_id: number | null;
  asset_id: string | null;
  employee_id: string;
  employee_name: string | null;
  device_type_id: number | null;
  device_type_name: string | null;
  asset_specification: string | null;
  requested_qty: number | null;
  action: DecisionAction;
  decided_by: string | null;
  notes: string | null;
  request_date: string | null;
  decision_date: string | null;
}

export interface MyRequest {
  request_id: number;
  device_type_name: string;
  requested_qty: number;
  purpose: string | null;
  department: string | null;
  needed_by_date: string | null;
  asset_specification: string | null;
  requested_at: string;
  allocation_id: number | null;
  asset_id: string | null;
  approved_at: string | null;
  returned_at: string | null;
  status: string;
}

export interface DeviceType {
  device_type_id: number;
  name: string;
}

export interface ActiveAsset {
  allocation_id: number;
  asset_id: string;
  device_type_name: string;
  allocated_at: string;
  condition_out: string | null;
  expected_return_date: string | null;
  allocation_status: "active" | "returned";
  returned_at: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  asset_status: string;
  is_high_value: boolean;
  purchase_date: string | null;
  warranty_expiry: string | null;
  office_name: string | null;
}

export interface AvailableAsset {
  asset_id: string;
  qty: number;
  brand: string | null;
  model: string | null;
  office_name: string | null;
  split_from_asset_id: string | null;
}

export interface AssetRow {
  asset_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  asset_status: string;
  is_high_value: boolean;
  device_type_name: string | null;
  office_name: string | null;
  current_employee_id: string | null;
  current_employee_name: string | null;
}

export interface UnfulfilledRequest {
  request_id: number;
  employee_id: string;
  employee_name: string | null;
  device_type_id: number;
  device_type_name: string;
  requested_qty: number;
  purpose: string | null;
  department: string | null;
  needed_by_date: string | null;
  asset_specification: string | null;
  requested_at: string;
}

export async function submitRequest(payload: {
  asset_id: string;
  condition_out?: string;
  expected_return_date?: string;
  notes?: string;
}) {
  const res = await api.post("/api/v1/requests", payload);
  return res.data;
}

export async function submitReturn(payload: {
  asset_id: string;
  employee_id?: string;
  condition_in: string;
  notes?: string;
}) {
  const res = await api.post("/api/v1/returns", payload);
  return res.data;
}

// Lost/Written Off - management/super_admin only (backend also enforces this). Lost leaves the
// asset attributed to the employee (matches the existing data convention); Written Off resets
// custody to the team, like a normal return, but marks the asset retired instead of available.
export async function markLost(assetId: string, notes?: string) {
  const res = await api.post("/api/v1/returns/lost", { asset_id: assetId, notes });
  return res.data;
}

export async function writeOffAsset(assetId: string, conditionIn?: string, notes?: string) {
  const res = await api.post("/api/v1/returns/write-off", {
    asset_id: assetId,
    condition_in: conditionIn,
    notes,
  });
  return res.data;
}

export async function getMyAssets(employeeId?: string): Promise<ActiveAsset[]> {
  const res = await api.get<ActiveAsset[]>("/api/v1/my-assets", {
    params: employeeId ? { employee_id: employeeId } : {},
  });
  return res.data;
}

export async function getDecisions(action?: DecisionAction): Promise<{ total: number; items: DecisionLogRow[] }> {
  const res = await api.get<{ total: number; items: DecisionLogRow[] }>("/api/v1/decisions", {
    params: action ? { action } : {},
  });
  return res.data;
}

export async function getMyRequests(): Promise<MyRequest[]> {
  const res = await api.get<MyRequest[]>("/api/v1/requests/mine");
  return res.data;
}

// Request-level gate (2026-08-28) - approves/rejects the raw asset_requests row before IT ever
// picks a unit, replacing the old allocation-level step above for anything going through this
// flow. See db/migration_2026-08-28_whatsapp_early_approval_gate.sql.
export async function approveAssetRequest(requestId: number) {
  const res = await api.post(`/api/v1/asset-requests/${requestId}/approve`);
  return res.data;
}

export async function rejectAssetRequest(requestId: number, notes?: string) {
  const res = await api.post(`/api/v1/asset-requests/${requestId}/reject`, { notes });
  return res.data;
}


export async function getDeviceTypes(): Promise<DeviceType[]> {
  const res = await api.get<DeviceType[]>("/api/v1/device-types");
  return res.data;
}

export async function submitAssetRequest(payload: {
  device_type_id: number;
  requested_qty: number;
  purpose?: string;
  department?: string;
  needed_by_date?: string;
  asset_specification?: string;
}) {
  const res = await api.post("/api/v1/asset-requests", payload);
  return res.data;
}

export async function getAvailableAssets(deviceTypeId: number): Promise<AvailableAsset[]> {
  const res = await api.get<AvailableAsset[]>("/api/v1/assets/available", {
    params: { device_type_id: deviceTypeId },
  });
  return res.data;
}

export async function getUnfulfilledRequests(): Promise<UnfulfilledRequest[]> {
  const res = await api.get<UnfulfilledRequest[]>("/api/v1/asset-requests/unfulfilled");
  return res.data;
}

export async function fulfillRequest(requestId: number, assetId: string, notes?: string) {
  const res = await api.post(`/api/v1/asset-requests/${requestId}/fulfill`, { asset_id: assetId, notes });
  return res.data;
}

export async function markNeedsPurchase(requestId: number, notes?: string) {
  const res = await api.post(`/api/v1/asset-requests/${requestId}/needs-purchase`, { notes });
  return res.data;
}

export async function searchAssets(
  q?: string,
  isHighValue?: boolean,
): Promise<{ total: number; items: AssetRow[] }> {
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (isHighValue !== undefined) params.is_high_value = String(isHighValue);
  const res = await api.get<{ total: number; items: AssetRow[] }>("/api/v1/assets", { params });
  return res.data;
}

export async function setAssetHighValue(assetId: string, isHighValue: boolean) {
  const res = await api.post(`/api/v1/assets/${assetId}/high-value`, { is_high_value: isHighValue });
  return res.data;
}
