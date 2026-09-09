import { dashboardApi } from "../adigram-react/server/api.mjs";

/* The dashboard API is a plain (req, res, next) Node handler, so it drops
   straight into a Vercel function. It is built once per warm instance rather
   than per request so the MongoDB client inside it can pool its connections
   across invocations instead of dialling the cluster on every call. */
const api = dashboardApi();

export default function handler(req, res) {
  /* This catch-all owns every /api/* path, and the handler routes on the
     pathname it reads back off req.url. Rebuilding that path from the matched
     segments keeps the routing correct no matter what the platform leaves in
     req.url, and the API never reads the query string. */
  const segments = req.query?.route ?? [];
  req.url = "/api/" + (Array.isArray(segments) ? segments.join("/") : segments);

  return api(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "No such endpoint" }));
  });
}
