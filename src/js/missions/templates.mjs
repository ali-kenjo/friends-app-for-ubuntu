// Mission Templates Gallery, Custom Templates, and Import/Export
import api from "../api.js";
import { say } from "../i18n.js";

export function renderGallery({ onSelectTemplate, onImport }) {
  const container = document.createElement("div");
  container.className = "mission-templates-gallery";

  let activeFilter = "all";
  let templates = [];

  const header = document.createElement("div");
  header.className = "mission-templates-header flex items-center justify-between gap-4 mb-4";
  header.innerHTML = `
    <div>
      <h3 class="text-lg font-semibold">${say("Mission Templates")}</h3>
      <p class="text-sm text-neutral-500">${say("Start from a curated template or import your own.")}</p>
    </div>
    <div class="flex items-center gap-2">
      <label class="btn btn-secondary text-sm cursor-pointer flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        <span>${say("Import")}</span>
        <input type="file" accept=".json,.mission-template.json" class="hidden template-file-input" />
      </label>
    </div>
  `;

  const filterBar = document.createElement("div");
  filterBar.className = "mission-templates-filter flex flex-wrap gap-1.5 mb-4";

  const cardsContainer = document.createElement("div");
  cardsContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5";

  async function loadTemplates() {
    try {
      const res = await api.missionTemplates.list();
      templates = res.templates || [];
      renderFilters();
      renderCards();
    } catch (err) {
      cardsContainer.innerHTML = `<div class="col-span-full p-4 text-center text-red-500">${say("Couldn't load templates")}: ${err.message}</div>`;
    }
  }

  function renderFilters() {
    filterBar.innerHTML = "";
    const allTags = new Set(["all"]);
    templates.forEach((t) => (t.tags || []).forEach((tag) => allTags.add(tag)));

    for (const tag of allTags) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `px-2.5 py-1 text-xs rounded-full border transition-colors ${
        activeFilter === tag
          ? "bg-primary-600 text-white border-primary-600"
          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-transparent hover:border-neutral-300 dark:hover:border-neutral-700"
      }`;
      btn.textContent = tag === "all" ? say("All") : tag;
      btn.addEventListener("click", () => {
        activeFilter = tag;
        renderFilters();
        renderCards();
      });
      filterBar.appendChild(btn);
    }
  }

  function renderCards() {
    cardsContainer.innerHTML = "";
    const filtered = templates.filter((t) => activeFilter === "all" || (t.tags && t.tags.includes(activeFilter)));

    if (!filtered.length) {
      cardsContainer.innerHTML = `<div class="col-span-full p-6 text-center text-neutral-400">${say("No templates found in this category.")}</div>`;
      return;
    }

    for (const t of filtered) {
      const card = document.createElement("div");
      card.className = "card p-4 flex flex-col justify-between hover:shadow-md transition-shadow border border-neutral-200 dark:border-neutral-800 rounded-lg";
      card.innerHTML = `
        <div>
          <div class="flex items-start justify-between gap-2 mb-2">
            <h4 class="font-medium text-base text-neutral-900 dark:text-neutral-100">${t.title}</h4>
            <div class="flex items-center gap-1">
              ${t.builtin ? `<span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500">${say("Built-in")}</span>` : `<span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-950 text-primary-600">${say("Custom")}</span>`}
            </div>
          </div>
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mb-3 line-clamp-3">${t.description}</p>
          <div class="flex flex-wrap gap-1 mb-4">
            ${(t.tags || []).map((tag) => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">#${tag}</span>`).join("")}
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <button type="button" class="btn-use-template btn btn-primary text-xs py-1 px-3 w-full">${say("Use template")}</button>
          <button type="button" class="btn-export-template btn btn-secondary text-xs py-1 px-2" title="${say("Export JSON")}">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          </button>
        </div>
      `;

      card.querySelector(".btn-use-template").addEventListener("click", () => {
        onSelectTemplate?.(t);
      });

      card.querySelector(".btn-export-template").addEventListener("click", async () => {
        try {
          const res = await api.missionTemplates.export(t.id);
          const blob = new Blob([res.json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${t.id}.mission-template.json`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          alert(`${say("Export failed")}: ${err.message}`);
        }
      });

      cardsContainer.appendChild(card);
    }
  }

  const fileInput = header.querySelector(".template-file-input");
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = await api.missionTemplates.import(text);
      await loadTemplates();
      onImport?.(imported);
    } catch (err) {
      alert(`${say("Import failed")}: ${err.message}`);
    } finally {
      fileInput.value = "";
    }
  });

  container.appendChild(header);
  container.appendChild(filterBar);
  container.appendChild(cardsContainer);

  loadTemplates();
  return container;
}
