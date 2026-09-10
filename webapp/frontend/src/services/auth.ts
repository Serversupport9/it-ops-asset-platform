import { api } from "./api";

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
}

export async function login(employeeId: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams();
  body.set("username", employeeId);
  body.set("password", password);

  const response = await api.post<LoginResponse>("/api/v1/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  localStorage.setItem("access_token", response.data.access_token);
  localStorage.setItem("refresh_token", response.data.refresh_token);
  localStorage.setItem("role", response.data.role);
  return response.data;
}

export function logout(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("role");
}

export function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem("access_token"));
}

export function getRole(): string | null {
  return localStorage.getItem("role");
}
