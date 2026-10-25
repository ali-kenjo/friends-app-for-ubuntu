// ---------- Settings → AI & privacy → This computer ----------
// What Friends found out about the computer it runs on (server/hardware.js), what that means for local AI, models that
// suit it, and the window you are looking at. The choices (profile, graphics card, battery) are plain settings.
import { api } from "./api.js";
import { getSettings, onSettings } from "./store.js";
import { t, tp, nf } from "./i18n.js";
import { h } from "./h.js";

const $ = (id) => document.getElementById(id);
// (a number with its unit is kept together in right-to-left text)
const gb = (mb, digits = 1) => `\u2066${nf(Math.round((mb / 1024) * 10 ** digits) / 10 ** digits)} GB\u2069`;

const FORM = { laptop: t("Laptop"), desktop: t("Desktop computer"), server: t("Server"), "single-board": t("Single-board computer"), unknown: t("Computer") };
const ENGINE = {
  cuda: t("Your NVIDIA graphics card (CUDA)"),
  rocm: t("Your AMD graphics card (ROCm)"),
  metal: t("Your Mac's graphics (Metal), sharing its memory"),
  gpu: t("Your graphics card"),
  cpu: t("The processor (slower)"),
};
const NOTES = {
  "cpu-only": t("There is no graphics card Friends can use, so local models run on the processor: expect a few words a second. Small models still work well."),
  "on-battery": t("It is on battery, so models aren't kept loaded for long."),
  "single-board": t("A small board: stick to the smallest models, or use a cloud AI for the heavy parts."),
  "memory-limited": t("This runs inside a container with a memory limit, and Friends counts only what it may use."),
  "low-disk": t("There is little free disk space. A model needs room to download."),
};
const ROLES = { general: t("Everyday"), coding: t("Coding"), embeddings: t("Search by meaning") };

function fact(label, value) {
  return [h("dt", { text: label }), h("dd", { text: value })];
}

function render(hw) {
  const gpus = hw.gpus.filter((g) => !(g.shared && !g.unified && g.vramMb === 0 && hw.gpus.some((o) => o !== g && !o.shared)));
  $("device-head").textContent = `${FORM[hw.formFactor] || FORM.unknown} · ${hw.board || hw.cpu.model || hw.os.name}`;
  const rows = [
    ...fact(t("System"), `${hw.os.name} (${hw.os.arch})${hw.container === "wsl" ? `, ${t("in WSL")}` : ""}`),
    ...fact(t("Processor"), `${hw.cpu.model || t("Unknown")} · ${t("{cores} cores, {threads} threads", { cores: hw.cpu.cores, threads: hw.cpu.threads })}`),
    ...fact(t("Memory"), t("{total} ({free} free)", { total: gb(hw.memory.totalMb), free: gb(hw.memory.availableMb) })),
    ...(gpus.length
      ? gpus.flatMap((g) => fact(t("Graphics"), `${g.name} · ${g.unified ? t("shares the memory") : g.shared || !g.vramMb ? t("uses shared memory") : gb(g.vramMb, 0)}`))
      : fact(t("Graphics"), t("No graphics card found"))),
    ...fact(t("Power"), hw.battery.present ? (hw.battery.onBattery ? t("On battery ({n}%)", { n: hw.battery.percent ?? "?" }) : t("Plugged in ({n}%)", { n: hw.battery.percent ?? "?" })) : t("No battery")),
    ...(hw.freeDiskMb !== null ? fact(t("Disk"), t("{size} free for models and data", { size: gb(hw.freeDiskMb, 0) })) : []),
    ...fact(t("Local AI runs on"), ENGINE[hw.fit.engine] || ENGINE.cpu),
  ];
  $("device-facts").replaceChildren(...rows);

  const f = hw.fit;
  const e = hw.effective;
  const sentences = [];
  if (!f.canRunLocal) sentences.push(t("This computer has very little memory to spare, so a cloud AI is the better choice for the heavy parts."));
  else sentences.push(t("Models up to about {n} billion parameters run well here.", { n: f.maxParamsB }));
  sentences.push(t("New local AIs start with a context of {context} tokens and stay loaded for {minutes} minutes; up to {missions} at the same time for missions.", { context: nf(e.contextSize), minutes: e.keepAliveMinutes, missions: tp("{n} mission", "{n} missions", e.missionsAtOnce) }));
  for (const n of f.notes) if (NOTES[n]) sentences.push(NOTES[n]);
  $("device-fit").textContent = sentences.join(" ");

  const picks = $("device-picks");
  const items = ["general", "coding", "embeddings"].map((role) => ({ role, ...hw.suggestions[role] }));
  picks.replaceChildren(
    ...items.map((s) => {
      const status = s.installed ? h("span", { class: "tag good", text: t("Installed") }) : !s.fits ? h("span", { class: "tag warn", text: t("Too big for this computer") }) : h("span", { class: "tag", text: t("Not installed") });
      return h(
        "li",
        { class: "device-pick" },
        h("span", { class: "pick-role", text: ROLES[s.role] }),
        h("span", { class: "pick-model" }, h("strong", { dir: "ltr", text: s.model.replace(/:latest$/, "") }), h("span", { class: "row-desc", text: ` · ${nf(s.gb)} GB` })),
        status,
        !s.installed && s.fits && hw.ollama.running ? h("code", { class: "pick-cmd", dir: "ltr", text: `ollama pull ${s.model}` }) : null
      );
    })
  );
  if (!hw.ollama.running) picks.append(h("li", { class: "device-pick none", text: t("Ollama isn't running, so Friends can't tell what is installed. Start it with: ollama serve") }));
  $("device-profile-desc").textContent = t("Sets the context size and how long a model stays loaded for a new local AI, and how many missions run at once. Right now: {context} tokens, {minutes} minutes, {missions}.", { context: nf(e.contextSize), minutes: e.keepAliveMinutes, missions: tp("{n} mission", "{n} missions", e.missionsAtOnce) });
}

let loading = false;
async function load() {
  if (loading) return;
  loading = true;
  try {
    render(await api.hardware.get());
  } catch (err) {
    $("device-head").textContent = t(err.message);
  } finally {
    loading = false;
  }
}

// ----- The window you are looking at -----
async function browserFacts() {
  const rows = [];
  const coarse = matchMedia("(pointer: coarse)").matches;
  const phone = coarse && Math.min(screen.width, screen.height) < 700;
  rows.push(...fact(t("Window"), `${innerWidth} × ${innerHeight} px · ${t("screen {w} × {h}, scale {n}", { w: screen.width, h: screen.height, n: nf(devicePixelRatio) })}`));
  rows.push(...fact(t("Used with"), phone ? t("A phone or small tablet: touch") : coarse ? t("Touch") : t("Mouse and keyboard")));
  if (navigator.hardwareConcurrency) rows.push(...fact(t("This device's processor"), t("{n} threads", { n: navigator.hardwareConcurrency })));
  if (navigator.deviceMemory) rows.push(...fact(t("This device's memory"), t("about {n} GB", { n: navigator.deviceMemory })));
  let renderer = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    renderer = gl ? (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : t("available")) : "";
    rows.push(...fact(t("3D robot"), gl ? `${t("This window can draw it")}${info ? ` (${renderer})` : ""}` : t("This window can't draw 3D, so a flat face is shown")));
  } catch {
    rows.push(...fact(t("3D robot"), t("This window can't draw 3D, so a flat face is shown")));
  }
  const quality = getSettings()?.robot?.quality || "auto";
  rows.push(...fact(t("Robot quality"), quality === "auto" ? t("Automatic: it lowers itself if this window struggles") : t("Set to {n}", { n: quality })));
  try {
    const battery = await navigator.getBattery?.();
    if (battery) rows.push(...fact(t("This device's power"), battery.charging ? t("Plugged in ({n}%)", { n: Math.round(battery.level * 100) }) : t("On battery ({n}%)", { n: Math.round(battery.level * 100) })));
  } catch {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) rows.push(...fact(t("Motion"), t("This device asks for less motion, and Friends follows it")));
  if (navigator.connection?.saveData) rows.push(...fact(t("Data saver"), t("On")));
  if (phone) rows.push(...fact(t("Good to know"), t("Friends runs on the computer it was started on. A phone or tablet only shows it, so everything above is about that computer.")));
  $("browser-facts").replaceChildren(...rows);
}

$("device-refresh").addEventListener("click", () => {
  load();
  browserFacts();
});
document.addEventListener("friends:subtab", (e) => {
  if (e.detail.name === "device") {
    load();
    browserFacts();
  }
});
document.addEventListener("friends:settings", (e) => {
  if (e.detail.open && e.detail.tab === "ai-control" && document.getElementById("subpane-device").classList.contains("active")) {
    load();
    browserFacts();
  }
});
// A change of profile or of the graphics card shows its effect
let timer = null;
onSettings(() => {
  clearTimeout(timer);
  timer = setTimeout(() => document.getElementById("subpane-device").classList.contains("active") && load(), 700);
});
