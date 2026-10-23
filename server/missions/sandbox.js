// Bubblewrap (bwrap) Sandbox Engine for Missions (server/missions/sandbox.js)
// Enforces process, filesystem, and network isolation for all mission commands.

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const logger = require("../logger");

class SandboxError extends Error {
  constructor(message, { reason = "failed" } = {}) {
    super(message);
    this.name = "SandboxError";
    this.reason = reason;
  }
}

let customBwrap = null; // For testing

function getBwrapBin() {
  return customBwrap || process.env.FRIENDS_BWRAP_BIN || "bwrap";
}

// Probes system bubblewrap availability and user namespace support
function check() {
  const bin = getBwrapBin();
  try {
    const versionCheck = spawnSync(bin, ["--version"], { stdio: "pipe" });
    if (versionCheck.error) {
      if (versionCheck.error.code === "ENOENT") {
        return {
          ok: false,
          reason: "missing",
          message: "bubblewrap (bwrap) executable was not found.",
        };
      }
      return {
        ok: false,
        reason: "failed",
        message: versionCheck.error.message,
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason: err.code === "ENOENT" ? "missing" : "failed",
      message: err.message,
    };
  }

  // Probe user namespaces creation
  try {
    const probeArgs = [
      "--die-with-parent",
      "--new-session",
      "--unshare-all",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--ro-bind",
      "/usr",
      "/usr",
    ];
    if (fs.existsSync("/bin") && fs.lstatSync("/bin").isSymbolicLink()) {
      probeArgs.push("--symlink", "usr/bin", "/bin");
    } else if (fs.existsSync("/bin")) {
      probeArgs.push("--ro-bind", "/bin", "/bin");
    }
    if (fs.existsSync("/lib") && fs.lstatSync("/lib").isSymbolicLink()) {
      probeArgs.push("--symlink", "usr/lib", "/lib");
    } else if (fs.existsSync("/lib")) {
      probeArgs.push("--ro-bind", "/lib", "/lib");
    }
    if (fs.existsSync("/lib64") && fs.lstatSync("/lib64").isSymbolicLink()) {
      probeArgs.push("--symlink", "usr/lib64", "/lib64");
    } else if (fs.existsSync("/lib64")) {
      probeArgs.push("--ro-bind", "/lib64", "/lib64");
    }
    const trueBin = fs.existsSync("/usr/bin/true")
      ? "/usr/bin/true"
      : fs.existsSync("/bin/true")
      ? "/bin/true"
      : "true";
    probeArgs.push(trueBin);

    const probe = spawnSync(bin, probeArgs, { stdio: "pipe" });

    if (probe.status !== 0) {
      const stderr = probe.stderr?.toString().trim() || "";
      return {
        ok: false,
        reason: "userns",
        message: stderr || "Unprivileged user namespaces are disabled or restricted by AppArmor.",
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason: "userns",
      message: err.message,
    };
  }

  return { ok: true };
}

// Builds the array of bwrap command arguments
function buildBwrapArgs({ workdir, folders = [], allowNet = false, shareNet = false, permissions = {} }) {
  const permitNet = Boolean(allowNet || shareNet);
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-all",
  ];

  if (permitNet) {
    args.push("--share-net");
  }

  args.push(
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    "--ro-bind", "/usr", "/usr"
  );

  // Symlinks for merged /usr
  for (const name of ["bin", "lib", "lib64", "sbin"]) {
    const hostPath = `/${name}`;
    try {
      const stat = fs.lstatSync(hostPath);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(hostPath);
        args.push("--symlink", target, hostPath);
      } else if (stat.isDirectory()) {
        args.push("--ro-bind", hostPath, hostPath);
      }
    } catch {
      // Path doesn't exist on host (e.g. /lib64 on 32-bit arch); skip
    }
  }

  // Safe minimal /etc files
  const etcCandidates = [
    "/etc/resolv.conf",
    "/run/systemd/resolve/stub-resolv.conf",
    "/etc/ssl",
    "/etc/ca-certificates",
    "/etc/hosts",
    "/etc/nsswitch.conf",
    "/etc/passwd",
    "/etc/group",
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    "/etc/ld.so.conf.d",
    "/etc/alternatives",
  ];

  for (const f of etcCandidates) {
    args.push("--ro-bind-try", f, f);
  }

  // Node prefix bind: if Node.js is outside /usr (e.g. nvm in home directory)
  if (process.execPath && !process.execPath.startsWith("/usr")) {
    const nodePrefix = path.resolve(process.execPath, "../..");
    args.push("--ro-bind", nodePrefix, nodePrefix);
  }

  // Mission workdir: full read-write access
  const absWorkdir = path.resolve(workdir);
  args.push("--bind", absWorkdir, absWorkdir);
  args.push("--chdir", absWorkdir);

  // Allowed folders from permissions
  const realHome = os.homedir();
  const friendsData = process.env.FRIENDS_DATA_DIR || path.join(realHome, ".config", "friends");

  const canWrite = Boolean(permissions.files?.create || permissions.files?.edit);
  for (const folder of folders) {
    try {
      const real = fs.realpathSync(folder);
      // Strictly prevent mounting the user's home root or ~/.config/friends
      if (real === realHome || real === friendsData || real.startsWith(friendsData + path.sep)) {
        logger.warn(`Skipping mounting sensitive folder in sandbox: ${real}`);
        continue;
      }
      args.push(canWrite ? "--bind" : "--ro-bind", real, real);
    } catch {}
  }

  return args;
}

// Builds cleaned, scrubbed environment
function buildEnv({ workdir, gitIdentity = {} }) {
  const gitName = process.env.FRIENDS_GIT_NAME || gitIdentity.name || "Friends";
  const gitEmail = process.env.FRIENDS_GIT_EMAIL || gitIdentity.email || "friends@localhost";

  return {
    PATH: process.env.PATH,
    HOME: workdir,
    LANG: "C.UTF-8",
    TERM: "dumb",
    CI: "1",
    NO_COLOR: "1",
    TMPDIR: "/tmp",
    npm_config_cache: path.join(workdir, ".npm-cache"),
    XDG_CACHE_HOME: path.join(workdir, ".cache"),
    GIT_AUTHOR_NAME: gitName,
    GIT_COMMITTER_NAME: gitName,
    GIT_AUTHOR_EMAIL: gitEmail,
    GIT_COMMITTER_EMAIL: gitEmail,
    GIT_TERMINAL_PROMPT: "0",
  };
}

// Runs a shell command inside the bubblewrap sandbox
async function run({
  command,
  workdir,
  folders = [],
  allowNet = false,
  shareNet = false,
  permissions = {},
  gitIdentity = {},
  timeout = 120000,
  timeoutMs,
  signal = null,
  cap = (s) => s,
}) {
  const effectiveTimeout = timeoutMs || timeout || 120000;
  const allowNetwork = Boolean(allowNet || shareNet);

  const probe = check();
  if (!probe.ok) {
    if (probe.reason === "missing") {
      throw new SandboxError(
        "Missions require bubblewrap (bwrap) to run commands in a secure sandbox. Install it with: sudo apt install bubblewrap",
        { reason: "missing" }
      );
    }
    throw new SandboxError(
      `Bubblewrap sandbox cannot create user namespaces (restricted by AppArmor or kernel). Enable unprivileged user namespaces with:\nsudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0\nor configure an AppArmor profile for bwrap.\nDetails: ${probe.message}`,
      { reason: "userns" }
    );
  }

  const bwrapArgs = buildBwrapArgs({ workdir, folders, allowNet: allowNetwork, permissions });
  // Add command to run: bash -c <command>
  bwrapArgs.push("bash", "-c", command);

  const env = buildEnv({ workdir, gitIdentity });
  const started = Date.now();

  return new Promise((resolve) => {
    const bin = getBwrapBin();
    const child = spawn(bin, bwrapArgs, {
      cwd: workdir,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let stdoutText = "";
    let stderrText = "";
    let killed = "";

    const add = (chunk) => {
      out += chunk;
      if (out.length > 200000) out = out.slice(0, 20000) + out.slice(-120000);
    };

    child.stdout.on("data", (c) => {
      const s = c.toString();
      stdoutText += s;
      add(s);
    });
    child.stderr.on("data", (c) => {
      const s = c.toString();
      stderrText += s;
      add(s);
    });

    const kill = (why) => {
      if (killed) return;
      killed = why;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 3000).unref?.();
    };

    const timer = setTimeout(() => kill("timeout"), effectiveTimeout);
    const onAbort = () => kill("stopped");

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    child.on("error", (err) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        resolve({
          error: "bubblewrap (bwrap) executable was not found. Install it with: sudo apt install bubblewrap",
          sandboxError: true,
        });
      } else {
        resolve({ error: `Couldn't run sandbox: ${err.message}` });
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      const result = {
        ok: code === 0 && !killed,
        exitCode: code,
        stdout: cap(stdoutText),
        stderr: cap(stderrText),
        output: cap(out),
        seconds: +((Date.now() - started) / 1000).toFixed(1),
      };

      if (killed === "timeout") {
        result.error = `The command ran longer than ${Math.round(effectiveTimeout / 1000)} seconds and was stopped.`;
      }
      if (killed === "stopped") {
        result.error = "The mission was stopped.";
      }
      resolve(result);
    });
  });
}

module.exports = {
  check,
  buildBwrapArgs,
  buildEnv,
  run,
  SandboxError,
  setBwrapBinForTesting: (bin) => (customBwrap = bin),
  setCustomBwrap: (bin) => (customBwrap = bin),
};
