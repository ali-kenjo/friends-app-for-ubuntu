// Tests for Mission Bubblewrap (bwrap) Sandbox
// Enforces process, filesystem, and network isolation for mission commands.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const sandbox = require("../server/missions/sandbox");
const toolbelt = require("../server/missions/toolbelt");
const plan = require("../server/missions/plan");
const risk = require("../server/missions/risk");

describe("Missions Bubblewrap Sandbox", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-sb-test-"));
  const workspace = path.join(tempDir, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  // Create a secret file outside workspace
  const outsideSecret = path.join(tempDir, "secret.txt");
  fs.writeFileSync(outsideSecret, "SUPER_SECRET_HOST_DATA_12345");

  // Create a test file inside workspace
  const insideFile = path.join(workspace, "hello.txt");
  fs.writeFileSync(insideFile, "INSIDE_WORKSPACE_CONTENT");

  let testServer;
  let testServerPort;

  before(async () => {
    // Start a simple HTTP server on localhost to test network isolation
    await new Promise((resolve) => {
      testServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("PONG");
      });
      testServer.listen(0, "127.0.0.1", () => {
        testServerPort = testServer.address().port;
        resolve();
      });
    });
  });

  after(() => {
    sandbox.setCustomBwrap(null);
    if (testServer) testServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("sandbox.check() verifies bubblewrap binary and unprivileged user namespaces", () => {
    const chk = sandbox.check();
    assert.strictEqual(typeof chk.ok, "boolean");
    if (!chk.ok) {
      assert.strictEqual(typeof chk.message, "string");
      assert.ok(["missing", "userns", "failed"].includes(chk.reason));
    }
  });

  test("filesystem isolation: cannot read files outside workdir", async () => {
    const chk = sandbox.check();
    if (!chk.ok) {
      console.log("Skipping live bwrap run: bwrap not functional on this host:", chk.message);
      return;
    }

    const res = await sandbox.run({
      command: `cat "${outsideSecret}" 2>&1 || echo "ACCESS_DENIED"`,
      workdir: workspace,
      timeoutMs: 5000,
    });

    assert.ok(!res.output.includes("SUPER_SECRET_HOST_DATA_12345"), "Must not read files outside workdir");
    assert.ok(
      res.output.includes("No such file or directory") || res.output.includes("ACCESS_DENIED"),
      "Outside file should not be accessible"
    );
  });

  test("filesystem isolation: can read and write within workdir", async () => {
    const chk = sandbox.check();
    if (!chk.ok) return;

    const nodeScript = `
      const fs = require('fs');
      const inside = fs.readFileSync('hello.txt', 'utf8');
      fs.writeFileSync('output.txt', inside + ' -> MODIFIED');
      process.stdout.write('SUCCESS');
    `;

    const res = await sandbox.run({
      command: `${process.execPath} -e "${nodeScript.replace(/\n/g, " ")}"`,
      workdir: workspace,
      timeoutMs: 5000,
    });

    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.stdout, "SUCCESS");
    assert.strictEqual(
      fs.readFileSync(path.join(workspace, "output.txt"), "utf8"),
      "INSIDE_WORKSPACE_CONTENT -> MODIFIED"
    );
  });

  test("network isolation: network is blocked by default without shareNet", async () => {
    const chk = sandbox.check();
    if (!chk.ok) return;

    const nodeScript = `
      const http = require('http');
      const req = http.get('http://127.0.0.1:${testServerPort}', { timeout: 1000 }, (res) => {
        process.stdout.write('CONNECTED');
        process.exit(0);
      });
      req.on('error', (err) => {
        process.stderr.write('NET_ERROR:' + err.code);
        process.exit(0);
      });
    `;

    const res = await sandbox.run({
      command: `${process.execPath} -e "${nodeScript.replace(/\n/g, " ")}"`,
      workdir: workspace,
      shareNet: false,
      timeoutMs: 5000,
    });

    assert.ok(!res.stdout.includes("CONNECTED"), "Must not connect to network when shareNet is false");
    assert.ok(
      res.stderr.includes("NET_ERROR:ECONNREFUSED") ||
      res.stderr.includes("NET_ERROR:ENETUNREACH") ||
      res.stderr.includes("NET_ERROR:ETIMEDOUT") ||
      res.stderr.includes("NET_ERROR:EADDRNOTAVAIL"),
      `Expected network error, got: ${res.stderr}`
    );
  });

  test("network isolation: network succeeds when shareNet is true", async () => {
    const chk = sandbox.check();
    if (!chk.ok) return;

    const nodeScript = `
      const http = require('http');
      http.get('http://127.0.0.1:${testServerPort}', (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          process.stdout.write(body);
          process.exit(0);
        });
      }).on('error', (err) => {
        process.stderr.write('FAIL:' + err.message);
        process.exit(1);
      });
    `;

    const res = await sandbox.run({
      command: `${process.execPath} -e "${nodeScript.replace(/\n/g, " ")}"`,
      workdir: workspace,
      shareNet: true,
      timeoutMs: 5000,
    });

    assert.strictEqual(res.exitCode, 0, `Command failed: ${res.stderr}`);
    assert.strictEqual(res.stdout, "PONG");
  });

  test("missing bubblewrap binary causes SandboxError with reason 'missing'", async () => {
    sandbox.setCustomBwrap("definitely-non-existent-bwrap-bin-xyz");
    try {
      const chk = sandbox.check();
      assert.strictEqual(chk.ok, false);
      assert.strictEqual(chk.reason, "missing");

      await assert.rejects(
        sandbox.run({
          command: "echo 1",
          workdir: workspace,
        }),
        (err) => {
          assert.strictEqual(err.name, "SandboxError");
          assert.strictEqual(err.reason, "missing");
          assert.ok(err.message.includes("sudo apt install bubblewrap"));
          return true;
        }
      );
    } finally {
      sandbox.setCustomBwrap(null);
    }
  });

  test("toolbelt runCommand respects internet action and rejects wildcards for network", async () => {
    // Test plan normalization with internet action
    const rawPlan = {
      summary: "Test internet",
      steps: [
        {
          id: "s1",
          title: "Run node script with internet",
          tools: ["run_command"],
          actions: [
            { type: "command", command: "node fetch.js" },
            { type: "internet", reason: "Download dependency" }
          ]
        },
        {
          id: "s2",
          title: "Run node script without internet declaration",
          tools: ["run_command"],
          actions: [
            { type: "command", command: "node *" }
          ]
        }
      ]
    };

    const norm = plan.normalize(rawPlan, {
      roles: ["general", "coding"],
      tools: ["run_command"],
      limits: { maxMinutes: 60, maxSteps: 25, maxCloudCalls: 60 },
      caps: { maxMinutes: 120, maxSteps: 50, maxCloudCalls: 100 }
    });

    assert.strictEqual(norm.steps[0].actions.some(a => a.type === "internet"), true);
    assert.strictEqual(norm.steps[1].actions.some(a => a.type === "internet"), false);

    // Verify covered() handles internet
    const verdict = risk.covered(
      { type: "internet", reason: "API call" },
      [{ type: "internet", reason: "Download dependency" }]
    );
    assert.strictEqual(verdict.ok, true);

    // Verify toolbelt runCommand executes with sandbox.run
    let capturedArgs = null;
    const originalRun = sandbox.run;
    try {
      sandbox.run = async (opts) => {
        capturedArgs = opts;
        return { exitCode: 0, stdout: "OK", stderr: "" };
      };

      const belt = toolbelt.create({
        mission: { id: "m1", workdir: workspace, scope: norm.steps[0].actions },
        settings: { missions: {} },
        signal: new AbortController().signal,
        checkLimits: () => {},
        requestApproval: async () => true,
      });

      // Execute on step 1 (has internet action)
      await belt.execute("run_command", { command: "node fetch.js" }, {
        id: "s1",
        title: "Run node script with internet",
        allowed: new Set(["run_command"]),
        effects: []
      });

      assert.ok(capturedArgs);
      assert.strictEqual(Boolean(capturedArgs.allowNet || capturedArgs.shareNet), true, "s1 has internet action, network must be allowed");

      // Execute on step 2 (has command 'node *' but NO internet action)
      capturedArgs = null;
      await belt.execute("run_command", { command: "node test.js" }, {
        id: "s2",
        title: "Run node script without internet declaration",
        allowed: new Set(["run_command"]),
        effects: []
      });

      assert.ok(capturedArgs);
      assert.strictEqual(Boolean(capturedArgs.allowNet || capturedArgs.shareNet), false, "s2 lacks internet action; wildcard command must not grant network");

    } finally {
      sandbox.run = originalRun;
    }
  });
});
