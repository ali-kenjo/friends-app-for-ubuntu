// Tests for Local API Key and Session Authentication (server/auth.js)
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { WebSocket } = require("ws");

describe("Local API Key and Session Authentication", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-session-test-"));
  process.env.FRIENDS_DATA_DIR = tempDir;
  process.env.FRIENDS_REQUIRE_AUTH = "1";
  process.env.LOG_LEVEL = "error";

  const auth = require("../server/auth");
  const { start } = require("../server/server");

  let server;
  let baseUrl;
  let token;

  before(async () => {
    token = auth.getToken();
    server = start(0, "127.0.0.1", { requireAuth: true });
    await new Promise((resolve) => {
      if (server.listening) resolve();
      else server.on("listening", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    delete process.env.FRIENDS_REQUIRE_AUTH;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("generates a 32-byte (64 hex characters) token in dataDir with mode 0600", () => {
    assert.strictEqual(typeof token, "string");
    assert.strictEqual(token.length, 64);
    assert.match(token, /^[a-f0-9]{64}$/i);

    const tokenPath = path.join(tempDir, "session-token");
    assert.ok(fs.existsSync(tokenPath), "session-token file must exist");
    const stat = fs.statSync(tokenPath);
    // Mode should be 0600 (read/write by owner only)
    const mode = stat.mode & 0o777;
    assert.strictEqual(mode, 0o600, `Expected mode 0600, got ${mode.toString(8)}`);
    assert.strictEqual(fs.readFileSync(tokenPath, "utf8").trim(), token);
  });

  test("whitelisted endpoints (/api/health and /healthz) succeed without auth", async () => {
    const res1 = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.status, "ok");

    const res2 = await fetch(`${baseUrl}/healthz`);
    assert.strictEqual(res2.status, 200);
  });

  test("unauthenticated requests to /api/* return 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
  });

  test("POST /api/session rejects invalid token with 401", async () => {
    const res = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid-token-12345" }),
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, "Invalid session token.");
  });

  test("POST /api/session exchanges valid token for HttpOnly SameSite=Strict cookie", async () => {
    const res = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);

    const cookieHeader = res.headers.get("set-cookie");
    assert.ok(cookieHeader, "Must set Set-Cookie header");
    assert.ok(cookieHeader.includes(`friends_session=${token}`));
    assert.ok(cookieHeader.includes("HttpOnly"));
    assert.ok(cookieHeader.includes("SameSite=Strict"));
  });

  test("requests to /api/* with valid session cookie succeed", async () => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      headers: {
        Cookie: `friends_session=${token}`,
      },
    });
    assert.strictEqual(res.status, 200);
    const settings = await res.json();
    assert.ok(settings && typeof settings === "object");
  });

  test("requests to /api/* with Authorization: Bearer <token> succeed", async () => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.strictEqual(res.status, 200);
  });

  test("WebSocket /api/live rejects unauthenticated connection with 401", async () => {
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/live";
    await assert.rejects(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl, {
          headers: {
            Origin: baseUrl,
          },
        });
        ws.on("open", () => {
          ws.close();
          resolve();
        });
        ws.on("unexpected-response", (req, res) => {
          assert.strictEqual(res.statusCode, 401);
          reject(new Error(`Server returned ${res.statusCode}`));
        });
        ws.on("error", (err) => reject(err));
      }),
      /Server returned 401/
    );
  });

  test("WebSocket /api/live accepts connection with valid session cookie", async () => {
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/live";
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Cookie: `friends_session=${token}`,
          Origin: baseUrl,
        },
      });
      ws.on("open", () => {
        ws.close();
        resolve();
      });
      ws.on("error", (err) => reject(err));
    });
  });

  test("static files (index.html) do not require authentication", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes('id="auth-gate"'));
  });
});
