// How the computer is doing: processor, memory, disks, the graphics card's temperature, failing services.
// The system_status tool of missions and the "watch my laptop" alerts use this. Everything is read-only.
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

const run = (cmd, args, timeout = 4000) =>
  new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve(err ? "" : String(stdout))));

// Processor use over a short moment, in percent
async function cpuPercent(ms = 250) {
  const sample = () => os.cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + Object.values(c.times).reduce((x, y) => x + y, 0) }), { idle: 0, total: 0 });
  const a = sample();
  await new Promise((r) => setTimeout(r, ms));
  const b = sample();
  const total = b.total - a.total;
  return total > 0 ? Math.round(((total - (b.idle - a.idle)) / total) * 100) : 0;
}

function memory() {
  let available = os.freemem();
  try {
    const m = fs.readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+) kB/);
    if (m) available = Number(m[1]) * 1024;
  } catch {}
  const total = os.totalmem();
  return { totalGb: +(total / 1e9).toFixed(1), availableGb: +(available / 1e9).toFixed(1), usedPercent: Math.round(((total - available) / total) * 100) };
}

// Disks that hold files: [{ mount, usedPercent, freeGb, totalGb }]
async function disks() {
  const out = await run("df", ["-P", "-B1", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs", "-x", "overlay", "-x", "efivarfs"]);
  return out
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((p) => p.length >= 6 && /^\d+$/.test(p[1]))
    .map((p) => ({ mount: p.slice(5).join(" "), usedPercent: Number(p[4].replace("%", "")), freeGb: +(Number(p[3]) / 1e9).toFixed(1), totalGb: +(Number(p[1]) / 1e9).toFixed(1) }))
    .filter((d) => d.totalGb >= 1 && !/^\/(snap|boot\/efi|run)/.test(d.mount));
}

// NVIDIA: temperature, memory and use; null when there's no such card or no nvidia-smi
async function gpu() {
  const out = await run("nvidia-smi", ["--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"]);
  const line = out.split("\n").find(Boolean);
  if (!line) return null;
  const [name, temp, util, used, total] = line.split(",").map((s) => s.trim());
  return { name, temperatureC: Number(temp), utilizationPercent: Number(util), memoryUsedMb: Number(used), memoryTotalMb: Number(total) };
}

async function failedServices() {
  const names = new Set();
  for (const args of [["--failed", "--no-legend", "--plain", "--no-pager"], ["--user", "--failed", "--no-legend", "--plain", "--no-pager"]]) {
    for (const line of (await run("systemctl", args)).split("\n")) {
      const name = line.trim().split(/\s+/)[0];
      if (name && /\.(service|socket|timer|mount)$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

// Everything in one go. only: a list of parts (cpu, memory, disks, gpu, services) to look at
async function snapshot(only = null) {
  const want = (k) => !only || only.includes(k);
  const [cpu, d, g, services] = await Promise.all([want("cpu") ? cpuPercent() : null, want("disks") ? disks() : null, want("gpu") ? gpu() : null, want("services") ? failedServices() : null]);
  const out = { time: new Date().toISOString(), uptimeHours: +(os.uptime() / 3600).toFixed(1), load: os.loadavg().map((n) => +n.toFixed(2)) };
  if (want("cpu")) out.cpuPercent = cpu;
  if (want("memory")) out.memory = memory();
  if (want("disks")) out.disks = d;
  if (want("gpu")) out.gpu = g;
  if (want("services")) out.failedServices = services;
  return out;
}

// What is worth a warning in a snapshot (the thresholds are what's usual; a mission can set its own)
function problems(snap, limits = {}) {
  const t = { cpu: 90, memory: 90, disk: 90, gpuTemp: 85, ...limits };
  const found = [];
  if (snap.cpuPercent >= t.cpu) found.push(`The processor is at ${snap.cpuPercent}%`);
  if (snap.memory?.usedPercent >= t.memory) found.push(`Memory is ${snap.memory.usedPercent}% used (${snap.memory.availableGb} GB free)`);
  for (const d of snap.disks || []) if (d.usedPercent >= t.disk) found.push(`${d.mount} is ${d.usedPercent}% full (${d.freeGb} GB free)`);
  if (snap.gpu && snap.gpu.temperatureC >= t.gpuTemp) found.push(`The graphics card is at ${snap.gpu.temperatureC}°C`);
  if (snap.failedServices?.length) found.push(`Failing services: ${snap.failedServices.join(", ")}`);
  return found;
}

module.exports = { snapshot, problems, cpuPercent, memory, disks, gpu, failedServices };
