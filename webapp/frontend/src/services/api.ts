import axios from "axios";

// Empty (same-origin) by default - every call site already includes the full "/api/v1/..."
// path (matching FastAPI's own route prefix), and nginx (see nginx.conf.template) proxies
// "/api/" straight through to the backend at container-start time. This means the built JS
// bundle never has an environment-specific URL baked in, so one built image works unchanged
// across dev/staging/prod. VITE_API_BASE_URL remains available to override for `npm run dev`
// outside Docker (see vite.config.ts).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
