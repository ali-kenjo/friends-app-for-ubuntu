// What Friends knows about the computer it runs on: probed with a fake machine for every kind it should recognise
// (a gaming laptop, an AMD desktop, an Intel-only ultrabook, a Raspberry Pi, a Mac with Apple silicon, an Intel Mac,
// Windows, a limited Docker container, WSL), and the sizes of local model each can take.
const { test, describe } = require("node:test");
const assert = require("node:assert");
const hardware = require("../server/hardware");

const GB = 1024 * 1024 * 1024;

// A fake machine: files, folders and what commands print
function machine({ platform = "linux", arch = "x64", cpuModel = "Fake CPU", threads = 8, totalGb = 16, freeGb = 10, files = {}, dirs = {}, commands = {}, env = {} } = {}) {
  return {
    platform,
    arch,
    release: "1.0",
    env,
    cpus: () => Array.from({ length: threads }, () => ({ model: cpuModel, speed: 3000 })),
    totalmem: () => totalGb * GB,
    freemem: () => freeGb * GB,
    readFile: (p) => (p in files ? files[p] : null),
    readdir: (p) => dirs[p] || [],
    exists: (p) => p in files || p in dirs,
    freeDiskMb: () => 200000,
    run: async (cmd, args = []) => {
      const key = [cmd, ...args].join(" ");
      const hit = Object.entries(commands).find(([k]) => key === k || key.startsWith(k));
      return hit ? hit[1] : null;
    },
  };
}

const NVIDIA_QUERY = "nvidia-smi --query-gpu";
const LSPCI_INTEL = '00:02.0 "VGA compatible controller" "Intel Corporation" "TigerLake-H GT1 [UHD Graphics]" -r01 "Dell" "Device"\n';

describe("Recognising the machine", () => {
  test("a laptop with an NVIDIA card: the card, the battery and the memory it can use for models", async () => {
    const p = await hardware.probe(
      machine({
        cpuModel: "Intel(R) Core(TM) i5-10300H CPU @ 2.50GHz",
        files: {
          "/proc/cpuinfo": "model name\t: Intel(R) Core(TM) i5-10300H\ncpu cores\t: 4\nphysical id\t: 0\n",
          "/proc/meminfo": "MemAvailable:    9400000 kB\n",
          "/etc/os-release": 'PRETTY_NAME="Ubuntu 26.04.1 LTS"\n',
          "/sys/class/dmi/id/chassis_type": "10\n",
          "/sys/class/power_supply/BAT0/status": "Discharging\n",
          "/sys/class/power_supply/BAT0/capacity": "73\n",
        },
        dirs: { "/sys/class/power_supply": ["AC", "BAT0"], "/sys/class/drm": [] },
        commands: { [NVIDIA_QUERY]: "NVIDIA GeForce GTX 1660 Ti with Max-Q Design, 6144, 400, 5700, 595.99\n", lspci: LSPCI_INTEL },
      })
    );
    assert.strictEqual(p.formFactor, "laptop");
    assert.strictEqual(p.os.name, "Ubuntu 26.04.1 LTS");
    assert.strictEqual(p.cpu.cores, 4);
    assert.strictEqual(p.cpu.threads, 8);
    assert.strictEqual(p.memory.availableMb, Math.round(9400000 / 1024));
    assert.deepStrictEqual(p.battery, { present: true, onBattery: true, percent: 73 });
    assert.strictEqual(p.gpus[0].vendor, "nvidia");
    assert.strictEqual(p.gpus[0].vramMb, 6144);
    assert.strictEqual(p.fit.engine, "cuda");
    assert.strictEqual(p.fit.budgetMb, 6144 - 448);
    assert.strictEqual(p.fit.tier, "medium");
    assert.strictEqual(p.fit.contextSize, 8192);
    assert.strictEqual(p.fit.keepAliveMinutes, 5, "on battery a model isn't kept loaded long");
    assert.ok(p.fit.notes.includes("on-battery"));
    assert.ok(p.fit.canRunLocal);
  });

  test("an AMD desktop: ROCm's numbers, a big card, a larger tier", async () => {
    const rocm = JSON.stringify({ card0: { "Card Series": "Radeon RX 7900 XTX", "VRAM Total Memory (B)": String(24 * GB), "VRAM Total Used Memory (B)": String(1 * GB) } });
    const p = await hardware.probe(machine({ totalGb: 64, freeGb: 50, threads: 16, files: { "/sys/class/dmi/id/chassis_type": "3\n" }, commands: { "rocm-smi": rocm } }));
    assert.strictEqual(p.formFactor, "desktop");
    assert.strictEqual(p.gpus[0].vendor, "amd");
    assert.strictEqual(p.gpus[0].vramMb, 24576);
    assert.strictEqual(p.fit.engine, "rocm");
    assert.strictEqual(p.fit.tier, "xxl");
    assert.strictEqual(p.fit.contextSize, 16384);
    assert.strictEqual(p.fit.missionsAtOnce, 3);
  });

  test("an ultrabook with only Intel graphics: the processor does the work, so the budget is memory, and slow", async () => {
    const p = await hardware.probe(
      machine({
        totalGb: 8,
        freeGb: 4,
        files: { "/sys/class/dmi/id/chassis_type": "10\n", "/sys/class/drm/card0/device/vendor": "0x8086\n" },
        dirs: { "/sys/class/drm": ["card0", "card0-eDP-1"], "/sys/class/power_supply": ["BAT0"] },
        commands: { lspci: LSPCI_INTEL },
      })
    );
    assert.strictEqual(p.gpus.length, 1);
    assert.strictEqual(p.gpus[0].vendor, "intel");
    assert.strictEqual(p.gpus[0].usable, false);
    assert.match(p.gpus[0].name, /UHD Graphics/);
    assert.strictEqual(p.fit.engine, "cpu");
    assert.strictEqual(p.fit.speed, "slow");
    assert.ok(p.fit.notes.includes("cpu-only"));
    assert.strictEqual(p.fit.contextSize, 4096);
    assert.ok(["tiny", "small"].includes(p.fit.tier), p.fit.tier);
    // plenty of memory doesn't help the processor: a big computer without a card is still limited to small models
    const big = await hardware.probe(machine({ totalGb: 64, freeGb: 50, threads: 16, files: { "/sys/class/dmi/id/chassis_type": "3\n" } }));
    assert.strictEqual(big.fit.engine, "cpu");
    assert.ok(big.fit.budgetMb <= 4608 && big.fit.maxParamsB <= 6, `${big.fit.budgetMb} MB, ${big.fit.maxParamsB}B`);
  });

  test("a Raspberry Pi is a single-board computer with a small budget", async () => {
    const p = await hardware.probe(machine({ arch: "arm64", totalGb: 4, freeGb: 2.5, threads: 4, files: { "/proc/device-tree/model": "Raspberry Pi 5 Model B Rev 1.0\0" } }));
    assert.strictEqual(p.formFactor, "single-board");
    assert.strictEqual(p.board, "Raspberry Pi 5 Model B Rev 1.0");
    assert.strictEqual(p.fit.engine, "cpu");
    assert.ok(p.fit.notes.includes("single-board"));
    assert.strictEqual(p.fit.missionsAtOnce, 1);
  });

  test("a Mac with Apple silicon: the memory is shared, and the GPU may use about two thirds", async () => {
    const p = await hardware.probe(
      machine({
        platform: "darwin",
        arch: "arm64",
        totalGb: 32,
        freeGb: 20,
        threads: 12,
        commands: { "sysctl -n machdep.cpu.brand_string": "Apple M2 Pro\n", "sysctl -n hw.physicalcpu": "10\n", "sysctl -n hw.logicalcpu": "12\n", "sysctl -n hw.model": "MacBookPro18,1\n", "pmset -g batt": "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1) 98%; charged; 0:00 remaining\n", "sw_vers": "15.1\n" },
      })
    );
    assert.strictEqual(p.cpu.model, "Apple M2 Pro");
    assert.strictEqual(p.cpu.cores, 10);
    assert.strictEqual(p.formFactor, "laptop");
    assert.strictEqual(p.os.name, "macOS 15.1");
    assert.strictEqual(p.gpus[0].vendor, "apple");
    assert.strictEqual(p.fit.engine, "metal");
    assert.strictEqual(p.fit.budgetMb, Math.round(32 * 1024 * 0.66) - 1024);
    assert.strictEqual(p.fit.tier, "xxl", "about 20 GB of the 32 GB: a 27B model fits");
    assert.deepStrictEqual(p.battery, { present: true, onBattery: false, percent: 98 });
  });

  test("an Intel Mac with a discrete Radeon is still treated as the processor's job", async () => {
    const system = JSON.stringify({ SPDisplaysDataType: [{ sppci_model: "Intel UHD Graphics 630", spdisplays_vram_shared: "1536 MB" }, { sppci_model: "AMD Radeon Pro 5500M", spdisplays_vram: "8 GB" }] });
    const p = await hardware.probe(machine({ platform: "darwin", arch: "x64", totalGb: 16, freeGb: 8, commands: { "sysctl -n hw.model": "iMac20,1\n", "system_profiler": system } }));
    assert.strictEqual(p.formFactor, "desktop");
    assert.deepStrictEqual(p.gpus.map((g) => g.vendor), ["intel", "amd"]);
    assert.strictEqual(p.fit.engine, "cpu", "Ollama doesn't use an Intel Mac's Radeon");
  });

  test("Windows: one PowerShell question gives the processor, the cards, the battery and the kind of machine", async () => {
    const json = JSON.stringify({
      cpu: { Name: "AMD Ryzen 7 7840HS", NumberOfCores: 8, NumberOfLogicalProcessors: 16 },
      gpu: [{ Name: "AMD Radeon(TM) Graphics", AdapterRAM: 536870912, DriverVersion: "31.0" }, { Name: "NVIDIA GeForce RTX 4060 Laptop GPU", AdapterRAM: 4293918720, DriverVersion: "32.0" }],
      battery: [{ BatteryStatus: 1, EstimatedChargeRemaining: 55 }],
      chassis: [10],
    });
    const p = await hardware.probe(
      machine({ platform: "win32", totalGb: 32, freeGb: 18, threads: 16, commands: { powershell: json, [NVIDIA_QUERY]: "NVIDIA GeForce RTX 4060 Laptop GPU, 8188, 900, 7288, 560.94\n" } })
    );
    assert.strictEqual(p.cpu.model, "AMD Ryzen 7 7840HS");
    assert.strictEqual(p.cpu.cores, 8);
    assert.strictEqual(p.formFactor, "laptop");
    assert.deepStrictEqual(p.battery, { present: true, onBattery: true, percent: 55 });
    const nvidia = p.gpus.find((g) => g.vendor === "nvidia");
    assert.strictEqual(nvidia.vramMb, 8188, "nvidia-smi's number replaces the 32-bit one Windows reports");
    assert.ok(p.gpus.find((g) => g.vendor === "amd").shared, "the Ryzen's graphics are integrated");
    assert.strictEqual(p.fit.engine, "cuda");
  });

  test("a Docker container with a memory limit counts only what it may use", async () => {
    const p = await hardware.probe(machine({ totalGb: 64, freeGb: 40, files: { "/.dockerenv": "", "/sys/fs/cgroup/memory.max": String(4 * GB) + "\n", "/proc/meminfo": "MemAvailable: 39000000 kB\n" } }));
    assert.strictEqual(p.container, "docker");
    assert.strictEqual(p.memory.totalMb, 4096);
    assert.ok(p.memory.availableMb <= 4096);
    assert.ok(p.fit.notes.includes("memory-limited"));
    assert.ok(p.fit.budgetMb < 3000);
  });

  test("WSL is noticed", async () => {
    const p = await hardware.probe(machine({ files: { "/proc/version": "Linux version 5.15.90.1-microsoft-standard-WSL2" } }));
    assert.strictEqual(p.container, "wsl");
  });

  test("a probe that fails on its own doesn't break the rest", async () => {
    const sys = machine({ totalGb: 8 });
    sys.readdir = () => {
      throw new Error("nope");
    };
    const p = await hardware.probe(sys);
    assert.strictEqual(p.memory.totalMb, 8192);
    assert.deepStrictEqual(p.gpus, []);
    assert.strictEqual(p.fit.engine, "cpu");
  });
});

describe("Sizes of model", () => {
  test("the tier comes from the budget", () => {
    const cases = [[1000, "tiny"], [3000, "small"], [5700, "medium"], [9000, "large"], [16000, "xl"], [40000, "xxl"]];
    for (const [mb, tier] of cases) assert.strictEqual(hardware.tierOf(mb), tier, `${mb} MB`);
  });

  test("with too little memory it says local models are out of reach", async () => {
    const p = await hardware.probe(machine({ totalGb: 2, freeGb: 1, threads: 2 }));
    assert.strictEqual(p.fit.canRunLocal, false);
    assert.strictEqual(p.fit.tier, "tiny");
  });

  test("the parsers read what the tools print", () => {
    const [g] = hardware.parseNvidiaSmi("NVIDIA GeForce RTX 3090, 24576, 100, 24476, 550.1\n");
    assert.strictEqual(g.vramMb, 24576);
    assert.strictEqual(g.freeMb, 24476);
    assert.deepStrictEqual(hardware.parseNvidiaSmi("garbage"), []);
    assert.deepStrictEqual(hardware.parseRocmSmi("null"), []);
    assert.deepStrictEqual(hardware.parseRocmSmi("not json"), []);
    assert.strictEqual(hardware.parseWindows("nope"), null);
    assert.strictEqual(hardware.vendorOf("GeForce RTX 4090"), "nvidia");
    assert.strictEqual(hardware.vendorOf("", "0x1002"), "amd");
    assert.strictEqual(hardware.vendorOf("Apple M3 GPU"), "apple");
  });

  test("FRIENDS_FAKE_HARDWARE changes parts of the real profile (for trying a smaller computer)", async () => {
    process.env.FRIENDS_FAKE_HARDWARE = JSON.stringify({ memory: { totalMb: 4096, availableMb: 2048 }, gpus: [] });
    try {
      hardware.reset();
      const p = await hardware.get({ fresh: true });
      assert.strictEqual(p.memory.totalMb, 4096);
      assert.strictEqual(p.fit.engine, "cpu");
    } finally {
      delete process.env.FRIENDS_FAKE_HARDWARE;
      hardware.reset();
    }
  });
});
