import { dashboardApi } from "../adigram-react/server/api.mjs";
import { accessGate } from "../adigram-react/server/access.mjs";

/* The dashboard API is a plain (req, res, next) Node handler, so it drops
   straight into a Vercel function. Both layers are built once per warm instance
   rather than per request, so the MongoDB client inside can pool its
   connections across invocations instead of dialling the cluster every call. */
const gate = accessGate();
const dashboard = dashboardApi();

const fail = (res, code, error) => {
  if (res.headersSent) return;
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error }));
};

export default function handler(req, res) {
  /* Both layers route on the pathname they read off req.url, which the platform
     already sets to the requested path. Reconstructing it from the catch-all's
     matched segments is only a fallback for a runtime that does not: doing it
     unconditionally would rewrite a correct URL into "/api/" whenever req.query
     is absent, and every route would stop matching. */
  const [pathname] = (req.url || "").split("?");
  if (!pathname.startsWith("/api/")) {
    const segments = req.query?.route ?? [];
    req.url = "/api/" + (Array.isArray(segments) ? segments.join("/") : segments);
  }

  try {
    return gate(req, res, () =>
      dashboard(req, res, () => fail(res, 404, `No such endpoint: ${req.url}`)),
    );
  } catch (error) {
    // A throw here would surface as the platform's own crash page, which says
    // nothing about which layer failed.
    return fail(res, 500, `The API failed to handle the request: ${error.message}`);
  }
}
