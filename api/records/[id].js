import handler from "../index.js";

export default function recordHandler(req, res) {
  const id = req.query?.id || (req.url || "").split("?")[0].split("/").pop();
  req.url = `/api/records/${id}`;
  return handler(req, res);
}
