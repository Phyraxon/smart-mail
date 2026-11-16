import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
    host: "127.0.0.1",
    proxy: { "/api": { target: process.env.SMART_MAIL_API ?? "http://127.0.0.1:3000", changeOrigin: false } },
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: { target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13" },
});
