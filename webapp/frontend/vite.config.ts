import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mirrors nginx.conf.template's /api/ proxy for `npm run dev` outside Docker - call sites
    // already include the full "/api/v1/..." path (matching FastAPI's own route prefix), so
    // this forwards unchanged rather than stripping "/api".
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
