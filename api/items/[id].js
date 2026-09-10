import handler from "../index.js";

export default function itemHandler(req, res) {
  const id = req.query?.id || (req.url || "").split("?")[0].split("/").pop();
  req.url = `/api/items/${id}`;
  return handler(req, res);
}
