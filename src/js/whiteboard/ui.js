// ---------- Whiteboard Multi-view UI Controller ----------
// Manages Full View, Dockable Side Panel, Pop-out Window, Toolbar,
// Page Thumbnails, Board Switcher, Version Snapshots, and Exports.
import { WhiteboardCanvas } from "./canvas.js";
import { createDocument, createPage, documentToText } from "./model.mjs";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";

class WhiteboardUI {
  constructor() {
    this.canvas = null;
    this.doc = null;
    this.activeBoardId = null;
    this.saveTimeout = null;
    this.dockOpen = false;

    // Cross-window local broadcast synchronization
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("friends_whiteboard_sync");
      this.channel.onmessage = (e) => {
        if (e.data?.type === "doc_updated" && e.data.doc?.id === this.doc?.id) {
          this.doc = e.data.doc;
          this.canvas?.setDocument(this.doc);
          this.updatePageList();
          this.updateHeader();
        }
      };
    }

    this.init();
  }

  async init() {
    this.root = document.getElementById("view-whiteboard");
    if (!this.root) return;

    this.container = document.getElementById("whiteboard-viewport-container");
    if (!this.container) return;

    // Load active whiteboard document
    await this.loadActiveBoard();

    // Initialize 2D vector canvas
    this.canvas = new WhiteboardCanvas({
      container: this.container,
      document: this.doc,
      onDocumentChange: (doc) => this.handleDocumentChange(doc),
      onActiveToolChange: (tool) => this.updateToolbarActive(tool),
      onZoomChange: (z) => this.updateZoomDisplay(z),
      soundEnabled: true,
    });

    this.bindToolbar();
    this.bindHeaderActions();
    this.bindPageControls();
    this.bindModals();
    this.bindStreamListener();

    this.updateHeader();
    this.updatePageList();
  }

  async loadActiveBoard(boardId = null) {
    try {
      const url = boardId ? `/api/whiteboards/${encodeURIComponent(boardId)}` : "/api/whiteboards/active";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.doc = data.whiteboard || data;
        this.activeBoardId = this.doc.id;
        return;
      }
    } catch {}

    // Fallback default board if offline or API unavailable
    this.doc = createDocument({ title: "Main Whiteboard" });
    this.activeBoardId = this.doc.id;
  }

  handleDocumentChange(updatedDoc) {
    this.doc = updatedDoc;
    this.updatePageList();
    this.broadcastDocUpdate();

    // Debounced auto-save to server
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveToServer(), 600);
  }

  async saveToServer() {
    if (!this.doc || !this.doc.id) return;
    try {
      await fetch(`/api/whiteboards/${encodeURIComponent(this.doc.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.doc),
      });
    } catch (err) {
      console.warn("Whiteboard auto-save failed:", err.message);
    }
  }

  broadcastDocUpdate() {
    if (this.channel && this.doc) {
      this.channel.postMessage({ type: "doc_updated", doc: this.doc });
    }
  }

  bindStreamListener() {
    // Listen for live whiteboard SSE events emitted by AI tools
    document.addEventListener("friends:whiteboard", (e) => {
      const evt = e.detail;
      if (!evt || !evt.type) return;

      if (evt.type === "item_created" && evt.item) {
        const page = this.canvas?.getActivePage();
        if (page && page.id === evt.pageId) {
          page.items.push(evt.item);
          this.canvas.render();
          this.updatePageList();
        }
      } else if (evt.type === "board_cleared") {
        this.loadActiveBoard(this.activeBoardId).then(() => {
          this.canvas?.setDocument(this.doc);
        });
      } else if (evt.type === "point_at") {
        this.canvas?.laserPoints?.push({ x: evt.x, y: evt.y, t: Date.now() });
        this.canvas?.startLaserTimer?.();
      }
    });
  }

  // Header and View switching
  updateHeader() {
    const titleEl = document.getElementById("whiteboard-title-text");
    if (titleEl && this.doc) {
      titleEl.textContent = this.doc.title === "Main Whiteboard" ? t("Main Whiteboard") : (this.doc.title || t("Whiteboard"));
    }
    const page = this.canvas?.getActivePage();
    const subEl = document.getElementById("whiteboard-subtitle-text");
    if (subEl && page) {
      subEl.textContent = `${page.name} • ${page.items?.length || 0} ${t("items")}`;
    }
  }

  bindHeaderActions() {
    // Switch boards button
    document.getElementById("wb-btn-boards")?.addEventListener("click", () => this.openBoardsModal());

    // Revision history button
    document.getElementById("wb-btn-history")?.addEventListener("click", () => this.openHistoryModal());

    // Export button & dropdown
    const exportBtn = document.getElementById("wb-btn-export");
    const exportMenu = document.getElementById("wb-export-menu");
    exportBtn?.addEventListener("click", () => {
      if (exportMenu) exportMenu.hidden = !exportMenu.hidden;
    });

    document.getElementById("wb-export-png")?.addEventListener("click", () => this.exportPNG());
    document.getElementById("wb-export-svg")?.addEventListener("click", () => this.exportSVG());
    document.getElementById("wb-export-pdf")?.addEventListener("click", () => this.exportPDF());
    document.getElementById("wb-export-md")?.addEventListener("click", () => this.exportNotesVault());

    // Pop-out standalone window
    document.getElementById("wb-btn-popout")?.addEventListener("click", () => this.openPopoutWindow());

    // Dock toggle button
    document.getElementById("wb-btn-dock")?.addEventListener("click", () => this.toggleDock());
  }

  bindToolbar() {
    // Tool buttons
    const toolBtns = this.root.querySelectorAll("[data-wb-tool]");
    toolBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.wbTool;
        this.canvas.setTool(tool);
        this.updateToolbarActive(tool);
      });
    });

    // Shape selectors
    const shapeBtns = this.root.querySelectorAll("[data-wb-shape]");
    shapeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const shp = btn.dataset.wbShape;
        this.canvas.setShape(shp);
        this.updateToolbarActive("shape");
      });
    });

    // Color swatches
    const colorBtns = this.root.querySelectorAll("[data-wb-color]");
    colorBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        colorBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.canvas.setColor(btn.dataset.wbColor);
      });
    });

    // Stroke size selectors
    const sizeBtns = this.root.querySelectorAll("[data-wb-size]");
    sizeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        sizeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.canvas.setSize(Number(btn.dataset.wbSize) || 3);
      });
    });

    // Undo / Redo
    document.getElementById("wb-tool-undo")?.addEventListener("click", () => this.canvas.undo());
    document.getElementById("wb-tool-redo")?.addEventListener("click", () => this.canvas.redo());

    // Clear active page
    document.getElementById("wb-tool-clear")?.addEventListener("click", () => {
      if (window.confirm(t("Are you sure you want to clear this page?"))) {
        const page = this.canvas.getActivePage();
        if (page) {
          page.items = [];
          this.handleDocumentChange(this.doc);
          this.canvas.render();
          announce(t("Whiteboard cleared"));
        }
      }
    });

    // Zoom buttons
    document.getElementById("wb-zoom-in")?.addEventListener("click", () => this.canvas.setZoom(this.canvas.zoom * 1.25));
    document.getElementById("wb-zoom-out")?.addEventListener("click", () => this.canvas.setZoom(this.canvas.zoom / 1.25));
    document.getElementById("wb-zoom-reset")?.addEventListener("click", () => this.canvas.resetZoom());
    document.getElementById("wb-zoom-fit")?.addEventListener("click", () => this.canvas.fitToContent());

    // Grid toggle
    const gridBtn = document.getElementById("wb-tool-grid");
    gridBtn?.addEventListener("click", () => {
      const styles = ["grid", "dots", "lines", "none"];
      const cur = this.doc.settings?.background || "grid";
      const next = styles[(styles.indexOf(cur) + 1) % styles.length];
      if (!this.doc.settings) this.doc.settings = {};
      this.doc.settings.background = next;
      this.handleDocumentChange(this.doc);
      this.canvas.renderBackground();
      gridBtn.title = `${t("Grid")}: ${next}`;
    });
  }

  updateToolbarActive(tool) {
    const toolBtns = this.root.querySelectorAll("[data-wb-tool]");
    toolBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.wbTool === tool);
    });
  }

  updateZoomDisplay(z) {
    const zoomText = document.getElementById("wb-zoom-level");
    if (zoomText) {
      zoomText.textContent = `${Math.round(z * 100)}%`;
    }
  }

  // Page Controls & Thumbnails
  bindPageControls() {
    document.getElementById("wb-add-page-btn")?.addEventListener("click", () => {
      const newPage = createPage({ name: `Page ${this.doc.pages.length + 1}` });
      this.doc.pages.push(newPage);
      this.doc.activePageIndex = this.doc.pages.length - 1;
      this.handleDocumentChange(this.doc);
      this.canvas.setDocument(this.doc);
      this.updateHeader();
      this.updatePageList();
    });
  }

  updatePageList() {
    const list = document.getElementById("wb-pages-list");
    if (!list || !this.doc || !Array.isArray(this.doc.pages)) return;

    list.innerHTML = "";
    this.doc.pages.forEach((page, idx) => {
      const active = (this.doc.activePageIndex || 0) === idx;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `wb-page-tab ${active ? "active" : ""}`;
      btn.innerHTML = `<span class="wb-page-num">${idx + 1}</span><span class="wb-page-name">${page.name}</span><span class="wb-page-badge">${page.items?.length || 0}</span>`;
      btn.addEventListener("click", () => {
        this.doc.activePageIndex = idx;
        this.handleDocumentChange(this.doc);
        this.canvas.setDocument(this.doc);
        this.updateHeader();
        this.updatePageList();
      });
      list.appendChild(btn);
    });
  }

  // Modals: Board Switcher & Snapshots
  bindModals() {
    document.getElementById("wb-boards-close")?.addEventListener("click", () => {
      document.getElementById("wb-boards-modal").hidden = true;
    });

    document.getElementById("wb-history-close")?.addEventListener("click", () => {
      document.getElementById("wb-history-modal").hidden = true;
    });

    document.getElementById("wb-boards-new")?.addEventListener("click", async () => {
      const title = window.prompt(t("New whiteboard title:"), t("Untitled Board"));
      if (!title || !title.trim()) return;
      const newDoc = createDocument({ title: title.trim() });
      try {
        await fetch("/api/whiteboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newDoc),
        });
        await this.loadActiveBoard(newDoc.id);
        this.canvas.setDocument(this.doc);
        document.getElementById("wb-boards-modal").hidden = true;
        this.updateHeader();
        this.updatePageList();
      } catch {}
    });
  }

  async openBoardsModal() {
    const modal = document.getElementById("wb-boards-modal");
    const list = document.getElementById("wb-boards-list");
    if (!modal || !list) return;

    modal.hidden = false;
    list.innerHTML = `<div class="wb-loading">${t("Loading whiteboards...")}</div>`;

    try {
      const res = await fetch("/api/whiteboards");
      if (!res.ok) throw new Error();
      const boards = await res.json();
      list.innerHTML = "";
      if (!boards || boards.length === 0) {
        list.innerHTML = `<div class="wb-empty">${t("No whiteboards found.")}</div>`;
        return;
      }

      for (const b of boards) {
        const item = document.createElement("div");
        item.className = `wb-board-item ${b.id === this.doc.id ? "active" : ""}`;
        item.innerHTML = `
          <div class="wb-board-info">
            <span class="wb-board-title">${b.title}</span>
            <span class="wb-board-meta">${b.pageCount} ${t("pages")} • ${b.itemCount} ${t("items")} • ${new Date(b.updatedAt).toLocaleDateString()}</span>
          </div>
          <div class="wb-board-actions">
            <button type="button" class="btn small btn-open">${t("Open")}</button>
            <button type="button" class="btn small btn-copy" title="${t("Duplicate")}">📋</button>
            <button type="button" class="btn small btn-delete" title="${t("Delete")}">🗑</button>
          </div>
        `;

        item.querySelector(".btn-open").addEventListener("click", async () => {
          await this.loadActiveBoard(b.id);
          this.canvas.setDocument(this.doc);
          modal.hidden = true;
          this.updateHeader();
          this.updatePageList();
        });

        item.querySelector(".btn-copy").addEventListener("click", async () => {
          await fetch(`/api/whiteboards/${encodeURIComponent(b.id)}/duplicate`, { method: "POST" });
          this.openBoardsModal();
        });

        item.querySelector(".btn-delete").addEventListener("click", async () => {
          if (window.confirm(t("Delete this whiteboard permanently?"))) {
            await fetch(`/api/whiteboards/${encodeURIComponent(b.id)}`, { method: "DELETE" });
            this.openBoardsModal();
          }
        });

        list.appendChild(item);
      }
    } catch {
      list.innerHTML = `<div class="wb-error">${t("Failed to load whiteboards.")}</div>`;
    }
  }

  async openHistoryModal() {
    const modal = document.getElementById("wb-history-modal");
    const list = document.getElementById("wb-history-list");
    if (!modal || !list || !this.doc) return;

    modal.hidden = false;
    list.innerHTML = `<div class="wb-loading">${t("Loading snapshots...")}</div>`;

    try {
      const res = await fetch(`/api/whiteboards/${encodeURIComponent(this.doc.id)}/history`);
      if (!res.ok) throw new Error();
      const history = await res.json();
      list.innerHTML = "";
      if (!history || history.length === 0) {
        list.innerHTML = `<div class="wb-empty">${t("No revision snapshots yet.")}</div>`;
        return;
      }

      for (const snap of history) {
        const item = document.createElement("div");
        item.className = "wb-history-item";
        item.innerHTML = `
          <span>${new Date(snap.timestamp).toLocaleString()}</span>
          <button type="button" class="btn small">${t("Restore")}</button>
        `;
        item.querySelector("button").addEventListener("click", async () => {
          if (window.confirm(t("Restore this version?"))) {
            await fetch(`/api/whiteboards/${encodeURIComponent(this.doc.id)}/history/${encodeURIComponent(snap.versionId)}/restore`, { method: "POST" });
            await this.loadActiveBoard(this.doc.id);
            this.canvas.setDocument(this.doc);
            modal.hidden = true;
            this.updateHeader();
            this.updatePageList();
          }
        });
        list.appendChild(item);
      }
    } catch {
      list.innerHTML = `<div class="wb-error">${t("Failed to load history snapshots.")}</div>`;
    }
  }

  // Multi-view: Dock and Pop-out
  toggleDock() {
    this.dockOpen = !this.dockOpen;
    const dockEl = document.getElementById("whiteboard-dock-panel");
    if (dockEl) {
      dockEl.hidden = !this.dockOpen;
      dockEl.classList.toggle("open", this.dockOpen);
    }
    const btn = document.getElementById("wb-btn-dock");
    if (btn) btn.classList.toggle("active", this.dockOpen);
  }

  openPopoutWindow() {
    const url = `${window.location.origin}${window.location.pathname}#whiteboard-popout`;
    window.open(url, "FriendsWhiteboardPopout", "width=1280,height=850,menubar=no,toolbar=no");
  }

  // Exports (W.9)
  async exportPNG() {
    if (!this.canvas) return;
    const off = document.createElement("canvas");
    off.width = 1600;
    off.height = 1000;
    const ctx = off.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1600, 1000);

    const page = this.canvas.getActivePage();
    if (page && page.items) {
      for (const it of page.items) {
        this.canvas.drawItem(ctx, it);
      }
    }

    const a = document.createElement("a");
    a.download = `${this.doc.title || "whiteboard"}.png`;
    a.href = off.toDataURL("image/png");
    a.click();
    announce(t("Exported PNG"));
  }

  exportSVG() {
    const page = this.canvas.getActivePage();
    if (!page) return;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">\n`;
    svg += `<rect width="1600" height="1000" fill="#ffffff"/>\n`;

    for (const it of page.items || []) {
      const type = it.type || it.kind;
      if (type === "stroke" && it.points?.length) {
        const d = it.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
        svg += `<path d="${d}" stroke="${it.color || "#1e293b"}" stroke-width="${it.size || 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`;
      } else if (type === "shape") {
        if (it.shapeType === "circle" || it.shapeType === "ellipse") {
          svg += `<ellipse cx="${(it.x || 0) + (it.width || 100) / 2}" cy="${(it.y || 0) + (it.height || 100) / 2}" rx="${(it.width || 100) / 2}" ry="${(it.height || 100) / 2}" fill="${it.fillColor || "none"}" stroke="${it.strokeColor || "#3b82f6"}" stroke-width="${it.strokeWidth || 2}"/>\n`;
        } else {
          svg += `<rect x="${it.x || 0}" y="${it.y || 0}" width="${it.width || 120}" height="${it.height || 80}" fill="${it.fillColor || "none"}" stroke="${it.strokeColor || "#3b82f6"}" stroke-width="${it.strokeWidth || 2}"/>\n`;
        }
      } else if (type === "text") {
        svg += `<text x="${it.x || 0}" y="${(it.y || 0) + (it.fontSize || 20)}" font-family="sans-serif" font-size="${it.fontSize || 20}" fill="${it.color || "#1e293b"}">${it.text || ""}</text>\n`;
      } else if (type === "sticky") {
        svg += `<rect x="${it.x || 0}" y="${it.y || 0}" width="${it.width || 160}" height="${it.height || 160}" fill="${it.color || "#fef3c7"}" rx="4"/>\n`;
        svg += `<text x="${(it.x || 0) + 12}" y="${(it.y || 0) + 24}" font-family="sans-serif" font-size="14" fill="#1e293b">${it.text || ""}</text>\n`;
      }
    }
    svg += `</svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.download = `${this.doc.title || "whiteboard"}.svg`;
    a.href = URL.createObjectURL(blob);
    a.click();
    announce(t("Exported SVG"));
  }

  exportPDF() {
    window.print();
  }

  exportNotesVault() {
    if (!this.doc) return;
    const text = documentToText(this.doc);
    const blob = new Blob([text], { type: "text/markdown" });
    const a = document.createElement("a");
    a.download = `${this.doc.title || "whiteboard"}.md`;
    a.href = URL.createObjectURL(blob);
    a.click();
    announce(t("Exported to Markdown"));
  }
}

export const whiteboardUI = new WhiteboardUI();
