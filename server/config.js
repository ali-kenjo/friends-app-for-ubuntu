// Where Friends keeps its data, runtime configuration, and safe storage primitives.
const fs = require("fs");
const os = require("os");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
let version = "0.2.0";
try {
  version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || version;
} catch {}

const port = Number(process.env.PORT) || 3000;
// Only this computer can reach Friends. Set HOST=0.0.0.0 to open it up.
const host = process.env.HOST || "127.0.0.1";

// A test never touches your real data: when the test runner starts a process and no folder was chosen,
// it gets a scratch folder of its own (removed again when it ends). Set FRIENDS_DATA_DIR to choose one.
function chooseDataDir() {
  if (process.env.FRIENDS_DATA_DIR) return process.env.FRIENDS_DATA_DIR;
  if (process.env.NODE_TEST_CONTEXT && !process.env.FRIENDS_REAL_DATA_FOR_TESTS) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "friends-test-data-"));
    process.once("exit", () => {
      try {
        fs.rmSync(scratch, { recursive: true, force: true });
      } catch {}
    });
    return scratch;
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "friends");
}

const dataDir = chooseDataDir();

// Write to a temp file first so a crash can't leave a half-written file.
// Files are readable only by the owner (mode 0600, dir 0700).
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function checkStorage() {
  try {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const probe = path.join(dataDir, ".health-probe");
    fs.writeFileSync(probe, "ok", { mode: 0o600 });
    fs.unlinkSync(probe);
    return { ok: true, path: dataDir };
  } catch (err) {
    return { ok: false, path: dataDir, error: err.message };
  }
}

module.exports = {
  version,
  port,
  host,
  dataDir,
  writeJson,
  checkStorage,
};
