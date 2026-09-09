import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardApi } from "./api.mjs";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const api = dashboardApi();
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};
http
  .createServer((req, res) =>
    api(req, res, () => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const url = new URL(req.url, "http://localhost");
      let requested;
      try {
        requested = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      let file = path.resolve(root, "." + requested);
      // `root` carries a trailing separator that path.resolve strips, so "/" used
      // to resolve to the directory itself and fail this guard with a 403. The
      // directory is compared separately from anything nested beneath it.
      const rootDir = path.resolve(root);
      if (file !== rootDir && !file.startsWith(rootDir + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (path.extname(requested) || requested.startsWith("/api/")) {
          res.writeHead(404);
          res.end();
          return;
        }
        file = path.join(root, "index.html");
      }
      if (!fs.existsSync(file)) {
        res.writeHead(503);
        res.end("Build the dashboard first.");
        return;
      }
      res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
    }),
  )
  .listen(Number(process.env.PORT) || 5174, "127.0.0.1", () =>
    console.log("Dashboard: http://127.0.0.1:" + (process.env.PORT || 5174)),
  );
