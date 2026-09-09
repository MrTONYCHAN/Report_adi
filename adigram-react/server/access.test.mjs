import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { accessGate, hashCode, CODE_LENGTH } from "./access.mjs";

const CODE = "0".repeat(CODE_LENGTH);

async function withGate(options, run) {
  const gate = accessGate(options);
  const server = http.createServer((req, res) =>
    gate(req, res, () => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ reached: req.url }));
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = "GET", body, cookie) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
      cookie: response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie"),
    };
  };
  try {
    await run(request);
  } finally {
    server.close();
  }
}

const jar = (setCookie) => String(setCookie).split(";")[0];

test("the default access code opens a session and unlocks the api", () =>
  withGate({}, async (request) => {
    assert.deepEqual((await request("/api/session")).body, { signedIn: false });
    assert.equal((await request("/api/dashboard")).status, 401);

    const signIn = await request("/api/session", "POST", { code: CODE });
    assert.equal(signIn.status, 200);
    assert.deepEqual(signIn.body, { signedIn: true });
    assert.match(signIn.cookie, /HttpOnly/);
    assert.match(signIn.cookie, /SameSite=Strict/);

    const cookie = jar(signIn.cookie);
    assert.deepEqual((await request("/api/session", "GET", null, cookie)).body, {
      signedIn: true,
    });
    const allowed = await request("/api/dashboard", "GET", null, cookie);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.reached, "/api/dashboard");
  }));

test("a wrong or short code is rejected and grants nothing", () =>
  withGate({}, async (request) => {
    for (const code of ["00000001", "0000000", "000000000", "", null, 12345678]) {
      const attempt = await request("/api/session", "POST", { code });
      assert.equal(attempt.status, 401, `code ${JSON.stringify(code)} must be refused`);
      assert.equal(attempt.cookie, null);
    }
  }));

test("signing out clears the session", () =>
  withGate({}, async (request) => {
    const cookie = jar((await request("/api/session", "POST", { code: CODE })).cookie);
    const out = await request("/api/session", "DELETE", null, cookie);
    assert.equal(out.status, 200);
    assert.match(out.cookie, /Max-Age=0/);
  }));

test("a forged or expired cookie does not pass the gate", () =>
  withGate({ secret: "test-secret" }, async (request) => {
    const future = Date.now() + 60_000;
    const past = Date.now() - 1;
    const sign = (value) =>
      crypto.createHmac("sha256", "test-secret").update(String(value)).digest("base64url");

    const forged = `adigrams_access=${future}.notthesignature`;
    assert.equal((await request("/api/dashboard", "GET", null, forged)).status, 401);

    const expired = `adigrams_access=${past}.${sign(past)}`;
    assert.equal((await request("/api/dashboard", "GET", null, expired)).status, 401);

    // The same construction with a live expiry is what a real session looks
    // like, which is what makes the two refusals above meaningful.
    const live = `adigrams_access=${future}.${sign(future)}`;
    assert.equal((await request("/api/dashboard", "GET", null, live)).status, 200);
  }));

test("a session signed for one code does not open a dashboard using another", () =>
  withGate({ verifier: hashCode("13572468") }, async (request) => {
    assert.equal((await request("/api/session", "POST", { code: CODE })).status, 401);
    const signIn = await request("/api/session", "POST", { code: "13572468" });
    assert.equal(signIn.status, 200);
    assert.equal((await request("/api/dashboard", "GET", null, jar(signIn.cookie))).status, 200);
  }));

test("the gate only guards the api and leaves the app shell servable", () =>
  withGate({}, async (request) => {
    for (const path of ["/", "/tasks", "/assets/index.js"]) {
      const response = await request(path);
      assert.equal(response.status, 200);
      assert.equal(response.body.reached, path);
    }
  }));
