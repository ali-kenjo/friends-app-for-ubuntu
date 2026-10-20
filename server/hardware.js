// What this computer is, so Friends can fit itself to it: the processor, memory, graphics card(s), the operating system,
// whether it is a laptop, a desktop, a server, a single-board computer or a container, and whether it is on battery.
// From that it works out a "budget" (how much memory a local AI model may use and still run well), a tier name, and
// sensible defaults (context size, how long to keep a model loaded). Nothing here leaves the computer.
//
// Works on Linux (including Raspberry Pi, WSL and Docker), macOS (Apple Silicon and Intel) and Windows. Every probe is
// optional: a missing tool or a failing command only means less is known. Tests give probe() a fake `sys` for each kind
// of machine; FRIENDS_FAKE_HARDWARE='{"memory":{"totalMb":8192}}' changes parts of the real profile.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const MB = 1024 * 1024;
const round = (n) => Math.round(n);

// ---------- Talking to the machine (replaceable in tests) ----------
function run(cmd, args = [], timeout = 4000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * MB }, (err, out) => resolve(err ? null : String(out)));
    } catch {
      resolve(null);
    }
  });
}

const realSys = () => ({
  platform: process.platform,
  arch: process.arch,
  release: os.release(),
  cpus: () => os.cpus(),
  totalmem: () => os.totalmem(),
  freemem: () => os.freemem(),
  readFile: (p) => {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
  readdir: (p) => {
    try {
      return fs.readdirSync(p);
    } catch {
      return [];
    }
  },
  exists: (p) => fs.existsSync(p),
  freeDiskMb: (p) => {
    try {
      const s = fs.statfsSync(p);
      return round((s.bavail * s.bsize) / MB);
    } catch {
      return null;
    }
  },
  run,
  env: process.env,
});

// ---------- Small parsers ----------
const num = (text) => {
  const n = Number(String(text ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

function vendorOf(name = "", pciVendor = "") {
  const text = `${name} ${pciVendor}`.toLowerCase();
  if (/nvidia|geforce|quadro|tesla|rtx|gtx|0x10de/.test(text)) return "nvidia";
  if (/\bamd\b|radeon|advanced micro|ati\b|0x1002|instinct/.test(text)) return "amd";
  if (/intel|arc\b|iris|uhd|0x8086/.test(text)) return "intel";
  if (/apple|\bm[1-9]\b/.test(text)) return "apple";
  return "other";
}

// nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,driver_version --format=csv,noheader,nounits
function parseNvidiaSmi(out) {
  return String(out || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, total, used, free, driver] = line.split(",").map((s) => s.trim());
      const totalMb = num(total);
      if (!name || !totalMb) return null;
      return { vendor: "nvidia", name, vramMb: totalMb, usedMb: num(used) ?? 0, freeMb: num(free) ?? totalMb - (num(used) ?? 0), shared: false, driver: driver || "", usable: true };
    })
    .filter(Boolean);
}

// rocm-smi --showproductname --showmeminfo vram --json: { card0: { "Card series": "...", "VRAM Total Memory (B)": "..." } }
function parseRocmSmi(out) {
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const pick = (card, re) => Object.entries(card).find(([k]) => re.test(k))?.[1];
  return Object.entries(data)
    .filter(([k, v]) => /^card\d+/i.test(k) && v && typeof v === "object")
    .map(([, card]) => {
      const total = num(pick(card, /vram total memory/i));
      const used = num(pick(card, /vram total used memory/i)) ?? 0;
      const name = String(pick(card, /card (series|model)|product name/i) || "AMD graphics card");
      if (!total) return null;
      const totalMb = round(total / MB);
      return { vendor: "amd", name, vramMb: totalMb, usedMb: round(used / MB), freeMb: totalMb - round(used / MB), shared: totalMb < 2048, driver: "", usable: totalMb >= 2048 };
    })
    .filter(Boolean);
}

// lspci -mm: 00:02.0 "VGA compatible controller" "Intel Corporation" "TigerLake-H GT1 [UHD Graphics]" -r01 ...
function parseLspci(out) {
  const found = [];
  for (const line of String(out || "").split("\n")) {
    const parts = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    if (parts.length >= 3 && /VGA|3D controller|Display controller/i.test(parts[0])) {
      const device = (parts[2].match(/\[(.+)\]/) || [])[1] || parts[2];
      found.push({ vendor: vendorOf(parts[1], parts[1]), name: `${parts[1].replace(/ Corporation| Inc\.| \[AMD\/ATI\]|\[AMD\/ATI\]/g, "").replace(/Advanced Micro Devices,?/, "AMD").trim()} ${device}`.trim() });
    }
  }
  return found;
}

// The Windows probe prints one JSON document (see WINDOWS_SCRIPT)
function parseWindows(out) {
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const gpus = list(data.gpu)
    .filter((g) => g?.Name && !/basic display|remote|virtual|microsoft/i.test(g.Name))
    .map((g) => {
      const vendor = vendorOf(g.Name);
      // AdapterRAM is a 32-bit number: 4 GB or more shows as 4095 MB or less, and nvidia-smi gives the real number
      const vramMb = g.AdapterRAM > 0 ? round(g.AdapterRAM / MB) : 0;
      const integrated = vendor === "intel" || (vendor === "amd" && /graphics$|vega|radeon\(tm\) graphics/i.test(g.Name) && vramMb < 2048);
      return { vendor, name: g.Name, vramMb: integrated ? 0 : vramMb, usedMb: 0, freeMb: integrated ? 0 : vramMb, shared: integrated, driver: g.DriverVersion || "", usable: !integrated && vramMb >= 2048, approximate: !integrated };
    });
  const chassis = list(data.chassis).map(Number);
  const battery = list(data.battery)[0];
  return {
    cpu: data.cpu ? { model: String(data.cpu.Name || "").trim(), cores: num(data.cpu.NumberOfCores), threads: num(data.cpu.NumberOfLogicalProcessors) } : null,
    gpus,
    chassis,
    battery: battery ? { present: true, onBattery: Number(battery.BatteryStatus) === 1, percent: num(battery.EstimatedChargeRemaining) } : { present: false, onBattery: false, percent: null },
  };
}

const WINDOWS_SCRIPT =
  "$o=@{};" +
  "$o.cpu=Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors;" +
  "$o.gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion);" +
  "$o.battery=@(Get-CimInstance Win32_Battery | Select-Object BatteryStatus,EstimatedChargeRemaining);" +
  "$o.chassis=@((Get-CimInstance Win32_SystemEnclosure).ChassisTypes);" +
  "$o | ConvertTo-Json -Depth 4 -Compress";

// ---------- Probes ----------
async function cpuInfo(sys, windows) {
  const list = sys.cpus() || [];
  const info = { model: (list[0]?.model || "").replace(/\s+/g, " ").trim(), threads: list.length || 1, cores: list.length || 1, mhz: list[0]?.speed || 0 };
  if (sys.platform === "linux") {
    const text = sys.readFile("/proc/cpuinfo") || "";
    if (!info.model) info.model = (text.match(/^(?:model name|Model|Hardware)\s*:\s*(.+)$/im) || [])[1]?.trim() || "";
    const perSocket = num((text.match(/^cpu cores\s*:\s*(\d+)/im) || [])[1]);
    const sockets = new Set([...text.matchAll(/^physical id\s*:\s*(\d+)/gim)].map((m) => m[1])).size || 1;
    if (perSocket) info.cores = perSocket * sockets;
  } else if (sys.platform === "darwin") {
    const physical = num(await sys.run("sysctl", ["-n", "hw.physicalcpu"]));
    const logical = num(await sys.run("sysctl", ["-n", "hw.logicalcpu"]));
    if (physical) info.cores = physical;
    if (logical) info.threads = logical;
    const brand = String((await sys.run("sysctl", ["-n", "machdep.cpu.brand_string"])) || "").trim();
    if (brand) info.model = brand;
  } else if (sys.platform === "win32" && windows?.cpu) {
    if (windows.cpu.model) info.model = windows.cpu.model;
    if (windows.cpu.cores) info.cores = windows.cpu.cores;
    if (windows.cpu.threads) info.threads = windows.cpu.threads;
  }
  info.cores = Math.min(info.cores, info.threads);
  info.arch = sys.arch;
  return info;
}

function memoryInfo(sys) {
  let totalMb = round(sys.totalmem() / MB);
  let availableMb = round(sys.freemem() / MB);
  let limitMb = null;
  if (sys.platform === "linux") {
    const meminfo = sys.readFile("/proc/meminfo") || "";
    const avail = num((meminfo.match(/MemAvailable:\s+(\d+) kB/) || [])[1]);
    if (avail) availableMb = round(avail / 1024);
    // A container's own limit (cgroup v2, then v1)
    const v2 = (sys.readFile("/sys/fs/cgroup/memory.max") || "").trim();
    const v1 = (sys.readFile("/sys/fs/cgroup/memory/memory.limit_in_bytes") || "").trim();
    const raw = num(v2 && v2 !== "max" ? v2 : v1);
    if (raw && raw < totalMb * MB * 0.98 && raw > 64 * MB) limitMb = round(raw / MB);
  }
  if (limitMb) {
    totalMb = Math.min(totalMb, limitMb);
    availableMb = Math.min(availableMb, totalMb);
  }
  return { totalMb, availableMb, limitMb };
}

async function gpuInfo(sys, windows) {
  const gpus = [];
  const nvidia = parseNvidiaSmi(await sys.run("nvidia-smi", ["--query-gpu=name,memory.total,memory.used,memory.free,driver_version", "--format=csv,noheader,nounits"]));
  gpus.push(...nvidia);

  if (sys.platform === "darwin") {
    if (sys.arch === "arm64") {
      const brand = String((await sys.run("sysctl", ["-n", "machdep.cpu.brand_string"])) || "Apple silicon").trim();
      gpus.push({ vendor: "apple", name: `${brand} GPU`, vramMb: 0, usedMb: 0, freeMb: 0, shared: true, unified: true, driver: "", usable: true });
    } else {
      const text = await sys.run("system_profiler", ["SPDisplaysDataType", "-json"], 8000);
      try {
        for (const g of JSON.parse(text).SPDisplaysDataType || []) {
          const vram = num(String(g.spdisplays_vram || g.spdisplays_vram_shared || "").replace(/[^\d.]/g, ""));
          const vramMb = vram ? (/GB/i.test(g.spdisplays_vram || "") ? vram * 1024 : vram) : 0;
          const vendor = vendorOf(g.sppci_model, g.spdisplays_vendor);
          const integrated = vendor === "intel" || /shared/i.test(String(g.spdisplays_vram_shared || ""));
          gpus.push({ vendor, name: g.sppci_model || "Graphics", vramMb: integrated ? 0 : vramMb, usedMb: 0, freeMb: integrated ? 0 : vramMb, shared: integrated, driver: "", usable: false });
        }
      } catch {}
    }
  } else if (sys.platform === "win32") {
    for (const g of windows?.gpus || []) {
      const real = nvidia.find((n) => n.vendor === g.vendor && g.vendor === "nvidia");
      if (!real) gpus.push(g);
    }
  } else if (sys.platform === "linux") {
    if (!gpus.some((g) => g.vendor === "amd")) {
      const rocm = parseRocmSmi(await sys.run("rocm-smi", ["--showproductname", "--showmeminfo", "vram", "--json"]));
      gpus.push(...rocm);
    }
    // What is on the PCI bus, for names and for cards the tools above don't know (integrated graphics)
    const named = parseLspci(await sys.run("lspci", ["-mm"]));
    for (const dir of sys.readdir("/sys/class/drm").filter((d) => /^card\d+$/.test(d))) {
      const base = `/sys/class/drm/${dir}/device`;
      const pci = (sys.readFile(`${base}/vendor`) || "").trim();
      const total = num(sys.readFile(`${base}/mem_info_vram_total`));
      const used = num(sys.readFile(`${base}/mem_info_vram_used`)) ?? 0;
      const vendor = vendorOf("", pci);
      if (vendor === "nvidia" || (vendor === "amd" && gpus.some((g) => g.vendor === "amd"))) continue; // already known
      if (vendor === "other" && !total) continue;
      const label = named.find((n) => n.vendor === vendor)?.name || (sys.readFile(`${base}/product_name`) || "").trim() || `${vendor === "intel" ? "Intel" : vendor === "amd" ? "AMD" : "Graphics"} graphics`;
      if (gpus.some((g) => g.name === label)) continue;
      const totalMb = total ? round(total / MB) : 0;
      const shared = vendor === "intel" || totalMb < 2048;
      gpus.push({ vendor, name: label, vramMb: shared ? 0 : totalMb, usedMb: shared ? 0 : round(used / MB), freeMb: shared ? 0 : totalMb - round(used / MB), shared, driver: "", usable: !shared && totalMb >= 2048 });
    }
    if (!gpus.length) for (const n of named) gpus.push({ vendor: n.vendor, name: n.name, vramMb: 0, usedMb: 0, freeMb: 0, shared: true, driver: "", usable: false });
  }
  return gpus;
}

async function batteryInfo(sys, windows) {
  if (sys.platform === "linux") {
    const supplies = sys.readdir("/sys/class/power_supply");
    const bat = supplies.find((d) => /^BAT/i.test(d));
    if (!bat) return { present: false, onBattery: false, percent: null };
    const status = (sys.readFile(`/sys/class/power_supply/${bat}/status`) || "").trim();
    const percent = num(sys.readFile(`/sys/class/power_supply/${bat}/capacity`));
    return { present: true, onBattery: /discharging/i.test(status), percent };
  }
  if (sys.platform === "darwin") {
    const out = (await sys.run("pmset", ["-g", "batt"])) || "";
    if (!/InternalBattery/i.test(out)) return { present: false, onBattery: false, percent: null };
    return { present: true, onBattery: /Battery Power/i.test(out), percent: num((out.match(/(\d+)%/) || [])[1]) };
  }
  if (sys.platform === "win32") return windows?.battery || { present: false, onBattery: false, percent: null };
  return { present: false, onBattery: false, percent: null };
}

async function distro(sys) {
  if (sys.platform === "linux") {
    const text = sys.readFile("/etc/os-release") || "";
    return (text.match(/^PRETTY_NAME="?([^"\n]+)"?/m) || [])[1] || "Linux";
  }
  if (sys.platform === "darwin") return `macOS ${String((await sys.run("sw_vers", ["-productVersion"])) || "").trim()}`.trim();
  if (sys.platform === "win32") return `Windows ${sys.release}`;
  return sys.platform;
}

// "laptop", "desktop", "server", "single-board" or "unknown"; and whether it is inside Docker or WSL
async function formFactor(sys, { battery, windows }) {
  const env = sys.env || {};
  let container = "none";
  if (sys.exists("/.dockerenv") || sys.exists("/run/.containerenv") || env.FRIENDS_IN_DOCKER) container = "docker";
  else if (sys.platform === "linux" && /microsoft|wsl/i.test(sys.readFile("/proc/version") || "")) container = "wsl";

  let kind = "unknown";
  if (sys.platform === "linux") {
    const board = (sys.readFile("/proc/device-tree/model") || "").replace(/\0/g, "").trim();
    const chassis = num(sys.readFile("/sys/class/dmi/id/chassis_type"));
    if (board) kind = "single-board";
    else if ([8, 9, 10, 14, 30, 31, 32].includes(chassis)) kind = "laptop";
    else if ([17, 23, 25, 28].includes(chassis)) kind = "server";
    else if ([3, 4, 5, 6, 7, 13, 15, 16, 24, 35, 36].includes(chassis)) kind = "desktop";
    else if (battery.present) kind = "laptop";
    else if (container === "docker") kind = "unknown";
    else if (chassis) kind = "desktop";
    return { kind, container, board };
  }
  if (sys.platform === "darwin") {
    const model = String((await sys.run("sysctl", ["-n", "hw.model"])) || "").trim();
    kind = /book/i.test(model) ? "laptop" : /mac(mini|pro|studio)|imac/i.test(model.replace(/[, ]/g, "")) ? "desktop" : battery.present ? "laptop" : "desktop";
    return { kind, container, board: "" };
  }
  if (sys.platform === "win32") {
    const types = windows?.chassis || [];
    if (types.some((c) => [8, 9, 10, 14, 30, 31, 32].includes(c)) || battery.present) kind = "laptop";
    else if (types.some((c) => [17, 23, 25, 28].includes(c))) kind = "server";
    else kind = "desktop";
    return { kind, container, board: "" };
  }
  return { kind, container, board: "" };
}

// ---------- What it means for local AI ----------
// The memory a local model may use and still run well:
//   a graphics card with its own memory: that memory, minus a margin for the desktop
//   Apple silicon: the share of its shared memory the GPU may use (about two thirds)
//   anything else: half the memory, on the processor (slow)
const TIERS = [
  { id: "tiny", belowMb: 2560 },
  { id: "small", belowMb: 4608 },
  { id: "medium", belowMb: 7168 },
  { id: "large", belowMb: 12288 },
  { id: "xl", belowMb: 20480 },
  { id: "xxl", belowMb: Infinity },
];

function tierOf(budgetMb) {
  return TIERS.find((t) => budgetMb < t.belowMb).id;
}

function fit(profile) {
  const { memory, gpus, battery } = profile;
  const card = gpus.filter((g) => g.usable && !g.shared && g.vramMb > 0).sort((a, b) => b.vramMb - a.vramMb)[0];
  const apple = gpus.find((g) => g.unified);
  let budgetMb;
  let engine; // where models run
  const notes = [];
  if (card) {
    budgetMb = Math.max(0, card.vramMb - 448);
    engine = card.vendor === "nvidia" ? "cuda" : card.vendor === "amd" ? "rocm" : "gpu";
  } else if (apple) {
    budgetMb = round(memory.totalMb * (memory.totalMb > 36 * 1024 ? 0.75 : 0.66)) - 1024;
    engine = "metal";
  } else {
    const cap = Math.min(memory.totalMb * 0.5, memory.availableMb * 0.8);
    // On the processor a model is as slow as it is big: past about 4 GB of weights a reply takes minutes, however much memory there is
    budgetMb = Math.min(4608, Math.max(0, round(cap) - 512));
    engine = "cpu";
    notes.push("cpu-only");
  }
  budgetMb = Math.max(0, round(budgetMb));
  if (battery.onBattery) notes.push("on-battery");
  if (profile.formFactor === "single-board") notes.push("single-board");
  if (profile.container !== "none" && memory.limitMb) notes.push("memory-limited");
  if (profile.freeDiskMb !== null && profile.freeDiskMb < 8192) notes.push("low-disk");
  const tier = tierOf(budgetMb);
  const speed = engine === "cpu" ? "slow" : engine === "metal" ? "good" : "fast";
  // The memory a model's context takes grows with it: a small budget gets a short one, the processor too (it is slow to fill)
  const contextSize = engine === "cpu" ? 4096 : budgetMb >= 12288 ? 16384 : budgetMb >= 5120 ? 8192 : 4096;
  const keepAliveMinutes = battery.onBattery || budgetMb < 4608 || engine === "cpu" ? 5 : 30;
  // How many missions may run at once without the computer feeling it
  const missionsAtOnce = memory.totalMb >= 24 * 1024 && profile.cpu.threads >= 12 ? 3 : memory.totalMb >= 12 * 1024 && profile.cpu.threads >= 6 ? 2 : 1;
  // A model with a billion parameters takes about 0.62 GB at the usual 4-bit size; the rest of the budget is for its context
  const maxParamsB = Math.max(0, Math.floor((budgetMb * 0.9) / 1024 / 0.62));
  return { budgetMb, tier, engine, speed, canRunLocal: budgetMb >= 1536, maxParamsB, contextSize, keepAliveMinutes, missionsAtOnce, notes, card: card ? { name: card.name, vramMb: card.vramMb } : null };
}

// What a local AI may ask of this computer, by the profile in Settings (auto follows what the computer is):
// the context size and keep-alive of a new Ollama AI, and how many missions run at once.
function effective(profile, device = {}) {
  const f = profile.fit;
  const mode = device.profile || "auto";
  if (mode === "light") return { contextSize: 4096, keepAliveMinutes: 5, missionsAtOnce: 1, mode };
  if (mode === "balanced") return { contextSize: Math.min(8192, Math.max(4096, f.contextSize)), keepAliveMinutes: 15, missionsAtOnce: Math.min(2, f.missionsAtOnce), mode };
  if (mode === "performance") return { contextSize: f.budgetMb >= 8192 ? 16384 : Math.max(8192, f.contextSize), keepAliveMinutes: 60, missionsAtOnce: Math.min(4, f.missionsAtOnce + 1), mode };
  return { contextSize: f.contextSize, keepAliveMinutes: f.keepAliveMinutes, missionsAtOnce: f.missionsAtOnce, mode: "auto" };
}

// ---------- The profile ----------
async function probe(sys = realSys(), { dataDir = null } = {}) {
  const windows = sys.platform === "win32" ? parseWindows(await sys.run("powershell", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], 10000)) : null;
  const safe = (promise, fallback) => promise.catch(() => fallback);
  const [cpu, gpus, battery, osName] = await Promise.all([
    safe(cpuInfo(sys, windows), { model: "", threads: 1, cores: 1, mhz: 0, arch: sys.arch }),
    safe(gpuInfo(sys, windows), []),
    safe(batteryInfo(sys, windows), { present: false, onBattery: false, percent: null }),
    safe(distro(sys), sys.platform),
  ]);
  let memory;
  try {
    memory = memoryInfo(sys);
  } catch {
    memory = { totalMb: 0, availableMb: 0, limitMb: null };
  }
  const form = await safe(formFactor(sys, { battery, windows }), { kind: "unknown", container: "none", board: "" });
  const profile = {
    os: { platform: sys.platform, name: osName, arch: sys.arch, release: sys.release },
    cpu,
    memory,
    gpus,
    battery,
    formFactor: form.kind,
    board: form.board,
    container: form.container,
    freeDiskMb: dataDir ? sys.freeDiskMb?.(dataDir) ?? null : null,
    detectedAt: Date.now(),
  };
  profile.fit = fit(profile);
  return profile;
}

// FRIENDS_FAKE_GPU (the one vram.js reads) and FRIENDS_FAKE_HARDWARE change parts of the profile (tests, and trying a
// smaller computer)
function withFake(profile) {
  if (process.env.FRIENDS_FAKE_GPU) {
    let gpus = [];
    if (process.env.FRIENDS_FAKE_GPU !== "none") {
      try {
        const f = JSON.parse(process.env.FRIENDS_FAKE_GPU);
        gpus = [{ vendor: f.vendor || "nvidia", name: f.name || "Fake GPU", vramMb: f.totalMb, usedMb: f.usedMb ?? 0, freeMb: f.totalMb - (f.usedMb ?? 0), shared: false, driver: "", usable: true }];
      } catch {}
    }
    profile = { ...profile, gpus };
    profile.fit = fit(profile);
  }
  if (!process.env.FRIENDS_FAKE_HARDWARE) return profile;
  try {
    const fake = JSON.parse(process.env.FRIENDS_FAKE_HARDWARE);
    const merged = { ...profile, ...fake, os: { ...profile.os, ...fake.os }, cpu: { ...profile.cpu, ...fake.cpu }, memory: { ...profile.memory, ...fake.memory }, battery: { ...profile.battery, ...fake.battery }, gpus: fake.gpus || profile.gpus };
    merged.fit = fit(merged);
    return merged;
  } catch {
    return profile;
  }
}

let cached = null;
let pending = null;

// The profile, looked up once (it takes about a second) and kept for ten minutes. Battery and free memory change, so
// live() refreshes those cheaply.
async function get({ fresh = false } = {}) {
  if (cached && !fresh && Date.now() - cached.detectedAt < 10 * 60 * 1000) return cached;
  pending ||= probe(realSys(), { dataDir: require("./config").dataDir })
    .then((p) => (cached = withFake(p)))
    .finally(() => (pending = null));
  return pending;
}

// Free memory and the battery right now (the rest of the profile as it was)
async function live() {
  const base = await get();
  const sys = realSys();
  const memory = memoryInfo(sys);
  const battery = await batteryInfo(sys, null);
  const profile = withFake({ ...base, memory: { ...base.memory, availableMb: memory.availableMb }, battery: sys.platform === "win32" ? base.battery : battery });
  return profile;
}

// What was found, without looking again (null until the first get())
const last = () => cached;
const reset = () => {
  cached = null;
  pending = null;
};

module.exports = { get, live, last, reset, probe, fit, effective, tierOf, TIERS, parseNvidiaSmi, parseRocmSmi, parseLspci, parseWindows, vendorOf, realSys };
