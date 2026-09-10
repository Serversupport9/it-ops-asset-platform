import { api } from "./api";

export async function requestPasswordReset(employeeId: string): Promise<string> {
  const response = await api.post<{ message: string }>("/api/v1/auth/password-reset/request", {
    employee_id: employeeId,
  });
  return response.data.message;
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<string> {
  const response = await api.post<{ message: string }>("/api/v1/auth/password-reset/confirm", {
    token,
    new_password: newPassword,
  });
  return response.data.message;
}
