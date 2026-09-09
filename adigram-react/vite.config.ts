import { defineConfig, loadEnv, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath, URL } from "node:url";
import { dashboardApi } from "./server/api.mjs";
import { accessGate } from "./server/access.mjs";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "MONGODB_");
  const dashboard = dashboardApi({ uri: env["MONGODB_URI"], dbName: env["MONGODB_DB"] });
  const gate = accessGate();
  // Dev and preview sit behind the same access gate as production, so the
  // sign-in screen is exercised in development rather than only after deploy.
  const api: Connect.NextHandleFunction = (req, res, next) =>
    gate(req, res, () => dashboard(req, res, next));
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
