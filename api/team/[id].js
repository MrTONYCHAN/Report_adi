import handler from "../index.js";

export default function teamHandler(req, res) {
  const id = req.query?.id || (req.url || "").split("?")[0].split("/").pop();
  req.url = `/api/team/${id}`;
  return handler(req, res);
}
