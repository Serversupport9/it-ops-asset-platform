import { api } from "./api";

export interface DashboardSummary {
  total_asset_units: number;
  available_count: number;
  in_use_count: number;
  pending_return_count: number;
  high_value_count: number;
  unfulfilled_requests: number;
  pending_approvals: number;
  open_rental_risk: number;
  open_offboarding_risk: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const res = await api.get<DashboardSummary>("/api/v1/dashboard/summary");
  return res.data;
}
