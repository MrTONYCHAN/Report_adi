import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath, URL } from "node:url";
import { dashboardApi } from "./server/api.mjs";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REPORT_");
  const api = dashboardApi(env["REPORT_SOURCE"]);
  return {
    plugins: [
      {
        name: "readiness-data",
        configureServer(server) {
          server.middlewares.use(api);
        },
        configurePreviewServer(server) {
          server.middlewares.use(api);
        },
      },
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
  };
});
