import crypto from "node:crypto";

/* The dashboard sits behind an 8-digit access code. The code itself is never
   stored: what ships is a PBKDF2-SHA256 verifier, so reading this file or the
   deployed bundle does not reveal it. The default verifier below is the one for
   the initial code; set DASHBOARD_ACCESS_CODE (or a pre-computed
   DASHBOARD_ACCESS_VERIFIER) in the environment to change it without a rebuild.

   The gate is deliberately a separate middleware rather than part of the API
   handler, so the same composition guards the Vite dev server, the local Node
   server and the Vercel function, and so api.mjs stays a pure data layer. */

export const CODE_LENGTH = 8;
const ITERATIONS = 210_000;
const KEY_BYTES = 32;
const DEFAULT_VERIFIER =
  "pbkdf2-sha256$210000$w5JQaFNB94R+wVn48c04rg==$1aH3fqRsT6SJrVbhsBlTW6Mqkqd4HlU0kqjp9IS1MtE=";
const SESSION_HOURS = 12;
const COOKIE = "adigrams_access";

const b64 = (buffer) => buffer.toString("base64");

export function hashCode(code, salt = crypto.randomBytes(16), iterations = ITERATIONS) {
  const derived = crypto.pbkdf2Sync(String(code), salt, iterations, KEY_BYTES, "sha256");
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(derived)}`;
}

function parseVerifier(value) {
  const [scheme, iterations, salt, hash] = String(value).split("$");
  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !hash)
    throw new Error("Access verifier must look like pbkdf2-sha256$iterations$salt$hash");
  return {
    iterations: Number(iterations),
    salt: Buffer.from(salt, "base64"),
    hash: Buffer.from(hash, "base64"),
  };
}

/* Comparing digests rather than the codes keeps the check constant-time even
   when the two candidates differ in length. */
function matches(code, verifier) {
  const { iterations, salt, hash } = verifier;
  const candidate = crypto.pbkdf2Sync(String(code), salt, iterations, hash.length, "sha256");
  return crypto.timingSafeEqual(candidate, hash);
}

function cookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

/* The session is a signed expiry rather than a stored record. Serverless
   instances come and go and share no memory, so anything held in a process
   would log people out at random; a signature every instance can recompute
   from the same secret does not. */
function sign(expiry, secret) {
  return crypto.createHmac("sha256", secret).update(String(expiry)).digest("base64url");
}

function valid(token, secret) {
  const [expiry, signature] = String(token || "").split(".");
  if (!expiry || !signature || !Number.isFinite(Number(expiry))) return false;
  if (Number(expiry) < Date.now()) return false;
  const expected = Buffer.from(sign(expiry, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function readBody(req, limit = 4096) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.reject(new Error("Request body is not valid JSON"));
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const json = (res, code, payload, headers = {}) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
};

export function accessGate(options = {}) {
  const source =
    options.verifier ||
    process.env.DASHBOARD_ACCESS_VERIFIER ||
    (process.env.DASHBOARD_ACCESS_CODE && hashCode(process.env.DASHBOARD_ACCESS_CODE)) ||
    DEFAULT_VERIFIER;
  const verifier = parseVerifier(source);
  /* Falling back to a secret derived from the verifier keeps sessions valid
     across instances without demanding a second environment variable, while
     still never being the verifier itself. */
  const secret =
    options.secret ||
    process.env.DASHBOARD_SESSION_SECRET ||
    crypto.createHmac("sha256", "adigrams-session").update(verifier.hash).digest();

  const cookieFor = (req, value, maxAge) => {
    const https = req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket?.encrypted);
    return [
      `${COOKIE}=${value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${maxAge}`,
      https ? "Secure" : null,
    ]
      .filter(Boolean)
      .join("; ");
  };

  const signedIn = (req) => valid(cookies(req.headers?.cookie)[COOKIE], secret);

  return async function gate(req, res, next) {
    const [pathname] = (req.url || "").split("?");
    if (!pathname.startsWith("/api/")) return next();

    if (pathname === "/api/session") {
      if (req.method === "GET") return json(res, 200, { signedIn: signedIn(req) });

      if (req.method === "DELETE")
        return json(res, 200, { signedIn: false }, { "Set-Cookie": cookieFor(req, "", 0) });

      if (req.method === "POST") {
        let body;
        try {
          body = await readBody(req);
        } catch {
          return json(res, 400, { error: "The access code could not be read." });
        }
        const code = typeof body.code === "string" ? body.code : "";
        // PBKDF2 runs even on a malformed code so a wrong length is not
        // measurably faster to reject than a wrong code.
        const ok = matches(code, verifier) && code.length === CODE_LENGTH;
        if (!ok) return json(res, 401, { error: "That access code is not correct." });

        const expiry = Date.now() + SESSION_HOURS * 3600 * 1000;
        const token = `${expiry}.${sign(expiry, secret)}`;
        return json(
          res,
          200,
          { signedIn: true },
          { "Set-Cookie": cookieFor(req, token, SESSION_HOURS * 3600) },
        );
      }
      return json(res, 405, { error: "Use GET, POST or DELETE" });
    }

    if (!signedIn(req)) return json(res, 401, { error: "Enter the access code to continue." });
    return next();
  };
}
