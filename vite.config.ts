import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "https://analysis.systimus.in",
        changeOrigin: true,
      },
      "/ws": {
        target: "wss://analysis.systimus.in",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
