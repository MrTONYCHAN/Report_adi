import { dashboardApi } from "../adigram-react/server/api.mjs";
import { accessGate } from "../adigram-react/server/access.mjs";

/* Every /api/* request lands here: vercel.json rewrites the whole namespace to
   this one function, so the routing lives in api.mjs rather than in a tree of
   dynamic files. Both layers are built once per warm instance rather than per
   request, so the MongoDB client inside can pool its connections across
   invocations instead of dialling the cluster every call. */
const gate = accessGate();
const dashboard = dashboardApi();

const fail = (res, code, error) => {
  if (res.headersSent) return;
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error }));
};

const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);

/* A rewrite can hand the function either the original path or the destination
   file, depending on how the platform resolved it, so the request path is
   rebuilt from the catch-all param whenever req.url no longer names a route the
   API would recognise. */
function apiPath(req) {
  const [pathname, query] = (req.url || "").split("?");
  const segments = list(req.query?.path).length ? list(req.query.path) : list(req.query?.route);

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/index")) return req.url;
  if (segments.length) return "/api/" + segments.join("/") + (query ? "?" + query : "");
  return "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
}

export default function handler(req, res) {
  req.url = apiPath(req);

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
