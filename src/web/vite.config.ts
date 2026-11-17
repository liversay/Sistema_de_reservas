import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El navegador habla solo con Vite (5173); /api se reenvía a la API (3000) para que la cookie
// de sesión sea del mismo origen.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: process.env.API_URL ?? "http://localhost:3000", changeOrigin: false } },
  },
});
