import { dashboardApi } from "../adigram-react/server/api.mjs";
import { accessGate } from "../adigram-react/server/access.mjs";

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
  const segments = req.query?.route
    ? Array.isArray(req.query.route)
      ? req.query.route
      : [req.query.route]
    : [];

  if (segments.length > 0) {
    req.url = "/api/" + segments.join("/");
  } else {
    const [pathname] = (req.url || "").split("?");
    if (!pathname.startsWith("/api/")) {
      req.url = "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
    }
  }

  try {
    return gate(req, res, () =>
      dashboard(req, res, () => fail(res, 404, `No such endpoint: ${req.url}`)),
    );
  } catch (error) {
    return fail(res, 500, `The API failed to handle the request: ${error.message}`);
  }
}
