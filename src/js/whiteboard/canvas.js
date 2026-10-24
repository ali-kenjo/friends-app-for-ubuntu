// ---------- 2D Vector Whiteboard Canvas Engine ----------
// Dual-buffer pressure-sensitive interactive canvas with zoom/pan,
// shape geometry, multilingual text shaping, and progressive stroke timing.
import {
  createStroke,
  createShape,
  createText,
  createSticky,
  createChecklist,
  createTable,
  createDiagram,
  getBoundingBox,
  hitTest,
  moveItem,
  removeItem,
  createUndoStack,
  pushUndoAction,
  undo as modelUndo,
  redo as modelRedo,
} from "./model.mjs";
import { robotSound } from "../robot/sound.js";

export class WhiteboardCanvas {
  constructor({
    container,
    document: doc,
    onDocumentChange = () => {},
    onActiveToolChange = () => {},
    onZoomChange = () => {},
    soundEnabled = true,
  }) {
    this.container = container;
    this.doc = doc;
    this.onDocumentChange = onDocumentChange;
    this.onActiveToolChange = onActiveToolChange;
    this.onZoomChange = onZoomChange;
    this.soundEnabled = soundEnabled;

    this.undoStack = createUndoStack();

    // Viewport transform
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    // Tool state
    this.activeTool = "pen"; // select | pan | pen | highlighter | eraser | shape | text | sticky | checklist | table | diagram | laser
    this.activeShape = "rect"; // rect | circle | ellipse | triangle | star | arrow
    this.strokeColor = "#1e293b";
    this.strokeSize = 3;
    this.fillColor = "transparent";

    // Laser pointer trail
    this.laserPoints = [];
    this.laserTimer = null;

    // Pointer tracking
    this.isPointerDown = false;
    this.activePointerId = null;
    this.currentStrokePoints = [];
    this.dragStart = { x: 0, y: 0 };
    this.selectedItemIds = new Set();
    this.isDraggingSelection = false;
    this.isSpacePanning = false;

    // Create DOM layers
    this.initDOM();
    this.bindEvents();
    this.resize();
    this.render();
  }

  initDOM() {
    this.container.classList.add("whiteboard-viewport");
    this.container.style.position = "relative";
    this.container.style.overflow = "hidden";
    this.container.style.userSelect = "none";
    this.container.style.touchAction = "none";

    // Background Canvas (Grid / Dots / Lines)
    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.className = "whiteboard-layer whiteboard-bg-layer";
    this.bgCanvas.style.position = "absolute";
    this.bgCanvas.style.top = "0";
    this.bgCanvas.style.left = "0";
    this.bgCanvas.style.pointerEvents = "none";
    this.bgCtx = this.bgCanvas.getContext("2d");

    // Main Interactive Vector Canvas
    this.mainCanvas = document.createElement("canvas");
    this.mainCanvas.className = "whiteboard-layer whiteboard-main-layer";
    this.mainCanvas.style.position = "absolute";
    this.mainCanvas.style.top = "0";
    this.mainCanvas.style.left = "0";
    this.mainCtx = this.mainCanvas.getContext("2d");

    // Draft / Overlay Canvas (Active Strokes, Selection marquee, Laser)
    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.className = "whiteboard-layer whiteboard-overlay-layer";
    this.overlayCanvas.style.position = "absolute";
    this.overlayCanvas.style.top = "0";
    this.overlayCanvas.style.left = "0";
    this.overlayCanvas.style.pointerEvents = "none";
    this.overlayCtx = this.overlayCanvas.getContext("2d");

    this.container.appendChild(this.bgCanvas);
    this.container.appendChild(this.mainCanvas);
    this.container.appendChild(this.overlayCanvas);
  }

  setDocument(newDoc) {
    this.doc = newDoc;
    this.selectedItemIds.clear();
    this.render();
  }

  getActivePage() {
    if (!this.doc || !Array.isArray(this.doc.pages) || this.doc.pages.length === 0) {
      return null;
    }
    const idx = Math.max(0, Math.min(this.doc.pages.length - 1, this.doc.activePageIndex || 0));
    return this.doc.pages[idx];
  }

  setTool(tool) {
    this.activeTool = tool;
    this.selectedItemIds.clear();
    this.updateCursor();
    this.onActiveToolChange(tool);
    this.renderOverlay();
  }

  setShape(shape) {
    this.activeShape = shape;
    this.setTool("shape");
  }

  setColor(hex) {
    this.strokeColor = hex;
  }

  setSize(size) {
    this.strokeSize = Math.max(1, Math.min(48, Number(size) || 3));
  }

  updateCursor() {
    if (this.activeTool === "pan" || this.isSpacePanning) {
      this.container.style.cursor = this.isPointerDown ? "grabbing" : "grab";
    } else if (this.activeTool === "select") {
      this.container.style.cursor = "default";
    } else if (this.activeTool === "laser") {
      this.container.style.cursor = "crosshair";
    } else if (this.activeTool === "eraser") {
      this.container.style.cursor = "cell";
    } else if (this.activeTool === "text") {
      this.container.style.cursor = "text";
    } else {
      this.container.style.cursor = "crosshair";
    }
  }

  // Coordinate transforms: Screen (DOM) -> Model virtual space (1600x1000 base)
  screenToModel(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const mx = (sx - this.panX) / this.zoom;
    const my = (sy - this.panY) / this.zoom;
    return { x: mx, y: my };
  }

  modelToScreen(modelX, modelY) {
    const sx = modelX * this.zoom + this.panX;
    const sy = modelY * this.zoom + this.panY;
    return { x: sx, y: sy };
  }

  resize() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    const dpr = window.devicePixelRatio || 1;

    for (const canvas of [this.bgCanvas, this.mainCanvas, this.overlayCanvas]) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);
    }

    this.width = w;
    this.height = h;
    this.render();
  }

  // Zooming & Centering
  setZoom(z, centerX = this.width / 2, centerY = this.height / 2) {
    const clamped = Math.max(0.15, Math.min(5.0, z));
    const factor = clamped / this.zoom;
    this.panX = centerX - (centerX - this.panX) * factor;
    this.panY = centerY - (centerY - this.panY) * factor;
    this.zoom = clamped;
    this.onZoomChange(this.zoom);
    this.render();
  }

  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.onZoomChange(this.zoom);
    this.render();
  }

  fitToContent() {
    const page = this.getActivePage();
    if (!page || !page.items || page.items.length === 0) {
      this.resetZoom();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of page.items) {
      const b = getBoundingBox(it);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!isFinite(minX)) {
      this.resetZoom();
      return;
    }

    const padding = 60;
    const contentW = Math.max(100, maxX - minX + padding * 2);
    const contentH = Math.max(100, maxY - minY + padding * 2);
    const fitZ = Math.min(this.width / contentW, this.height / contentH, 2.0);
    this.zoom = Math.max(0.2, fitZ);
    this.panX = (this.width - (maxX + minX) * this.zoom) / 2;
    this.panY = (this.height - (maxY + minY) * this.zoom) / 2;
    this.onZoomChange(this.zoom);
    this.render();
  }

  // User input event listeners
  bindEvents() {
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);

    this.container.addEventListener("pointerdown", this.boundPointerDown);
    window.addEventListener("pointermove", this.boundPointerMove);
    window.addEventListener("pointerup", this.boundPointerUp);
    window.addEventListener("pointercancel", this.boundPointerUp);
    this.container.addEventListener("wheel", this.boundWheel, { passive: false });
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  destroy() {
    this.container.removeEventListener("pointerdown", this.boundPointerDown);
    window.removeEventListener("pointermove", this.boundPointerMove);
    window.removeEventListener("pointerup", this.boundPointerUp);
    window.removeEventListener("pointercancel", this.boundPointerUp);
    this.container.removeEventListener("wheel", this.boundWheel);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.laserTimer) clearInterval(this.laserTimer);
  }

  onKeyDown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
      return;
    }
    if (e.code === "Space" && !this.isSpacePanning) {
      this.isSpacePanning = true;
      this.updateCursor();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedItemIds.size > 0) {
        this.deleteSelection();
      }
    } else if (e.key === "Escape") {
      this.selectedItemIds.clear();
      this.render();
    }
  }

  onKeyUp(e) {
    if (e.code === "Space" && this.isSpacePanning) {
      this.isSpacePanning = false;
      this.updateCursor();
    }
  }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom centered at mouse cursor
      const rect = this.container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = -e.deltaY * 0.002;
      const newZoom = this.zoom * Math.exp(delta);
      this.setZoom(newZoom, cx, cy);
    } else {
      // 2-finger pan
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
      this.render();
    }
  }

  onPointerDown(e) {
    if (e.button === 1 || this.isSpacePanning || this.activeTool === "pan") {
      this.isPointerDown = true;
      this.activePointerId = e.pointerId;
      this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      this.updateCursor();
      return;
    }

    if (e.button !== 0) return; // left click only

    this.isPointerDown = true;
    this.activePointerId = e.pointerId;
    const m = this.screenToModel(e.clientX, e.clientY);
    this.dragStart = { x: m.x, y: m.y };

    if (this.activeTool === "select") {
      const page = this.getActivePage();
      const clickedItem = page ? hitTest(page, m.x, m.y) : null;
      if (clickedItem) {
        if (!e.shiftKey && !this.selectedItemIds.has(clickedItem.id)) {
          this.selectedItemIds.clear();
        }
        this.selectedItemIds.add(clickedItem.id);
        this.isDraggingSelection = true;
      } else {
        if (!e.shiftKey) this.selectedItemIds.clear();
      }
      this.render();
      return;
    }

    if (this.activeTool === "pen" || this.activeTool === "highlighter") {
      const p = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
      this.currentStrokePoints = [{ x: m.x, y: m.y, p, t: 0 }];
      this.strokeStartT = Date.now();
      if (this.soundEnabled) robotSound.play("marker");
      return;
    }

    if (this.activeTool === "eraser") {
      this.eraseAt(m.x, m.y);
      if (this.soundEnabled) robotSound.play("eraser");
      return;
    }

    if (this.activeTool === "laser") {
      this.laserPoints = [{ x: m.x, y: m.y, t: Date.now() }];
      this.startLaserTimer();
      return;
    }

    if (this.activeTool === "text") {
      this.promptAddText(m.x, m.y);
      return;
    }

    if (this.activeTool === "sticky") {
      this.addStickyAt(m.x, m.y);
      return;
    }

    if (this.activeTool === "checklist") {
      this.addChecklistAt(m.x, m.y);
      return;
    }

    if (this.activeTool === "table") {
      this.addTableAt(m.x, m.y);
      return;
    }

    if (this.activeTool === "diagram") {
      this.addDiagramAt(m.x, m.y);
      return;
    }
  }

  onPointerMove(e) {
    if (!this.isPointerDown) {
      if (this.activeTool === "laser") {
        const m = this.screenToModel(e.clientX, e.clientY);
        this.laserPoints.push({ x: m.x, y: m.y, t: Date.now() });
        this.startLaserTimer();
        this.renderOverlay();
      }
      return;
    }

    if (this.isSpacePanning || this.activeTool === "pan" || e.buttons === 4) {
      this.panX = e.clientX - this.dragStart.x;
      this.panY = e.clientY - this.dragStart.y;
      this.render();
      return;
    }

    const m = this.screenToModel(e.clientX, e.clientY);

    if (this.activeTool === "select" && this.isDraggingSelection) {
      const dx = m.x - this.dragStart.x;
      const dy = m.y - this.dragStart.y;
      this.dragStart = { x: m.x, y: m.y };
      const page = this.getActivePage();
      if (page) {
        for (const id of this.selectedItemIds) {
          moveItem(page, id, dx, dy);
        }
        this.render();
      }
      return;
    }

    if (this.activeTool === "pen" || this.activeTool === "highlighter") {
      const p = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
      const t = Date.now() - this.strokeStartT;
      this.currentStrokePoints.push({ x: m.x, y: m.y, p, t });
      this.renderOverlay();
      return;
    }

    if (this.activeTool === "eraser") {
      this.eraseAt(m.x, m.y);
      return;
    }

    if (this.activeTool === "laser") {
      this.laserPoints.push({ x: m.x, y: m.y, t: Date.now() });
      this.renderOverlay();
      return;
    }

    if (this.activeTool === "shape") {
      this.renderOverlayPreviewShape(m.x, m.y);
    }
  }

  onPointerUp(e) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    this.activePointerId = null;
    this.isDraggingSelection = false;
    this.updateCursor();

    const m = this.screenToModel(e.clientX, e.clientY);

    if (this.activeTool === "pen" || this.activeTool === "highlighter") {
      if (this.currentStrokePoints.length > 1) {
        const page = this.getActivePage();
        if (page) {
          const isHighlighter = this.activeTool === "highlighter";
          const stroke = createStroke({
            points: this.currentStrokePoints,
            color: isHighlighter ? "#fef08a" : this.strokeColor,
            size: isHighlighter ? 18 : this.strokeSize,
            opacity: isHighlighter ? 0.45 : 1,
            author: "user",
          });
          page.items.push(stroke);
          pushUndoAction(this.undoStack, { type: "add_item", pageId: page.id, item: stroke });
          this.commitDocumentChange();
        }
      }
      this.currentStrokePoints = [];
      this.render();
      return;
    }

    if (this.activeTool === "shape") {
      const w = Math.abs(m.x - this.dragStart.x);
      const h = Math.abs(m.y - this.dragStart.y);
      if (w > 8 || h > 8) {
        const left = Math.min(this.dragStart.x, m.x);
        const top = Math.min(this.dragStart.y, m.y);
        const page = this.getActivePage();
        if (page) {
          const shapeItem = createShape({
            shapeType: this.activeShape,
            x: left,
            y: top,
            width: w,
            height: h,
            strokeColor: this.strokeColor,
            fillColor: this.fillColor,
            strokeWidth: this.strokeSize,
            author: "user",
          });
          page.items.push(shapeItem);
          pushUndoAction(this.undoStack, { type: "add_item", pageId: page.id, item: shapeItem });
          this.commitDocumentChange();
        }
      }
      this.overlayCtx.clearRect(0, 0, this.width, this.height);
      this.render();
    }
  }

  eraseAt(mx, my, radius = 24) {
    const page = this.getActivePage();
    if (!page || !page.items) return;
    const initialLen = page.items.length;
    page.items = page.items.filter((it) => {
      const b = getBoundingBox(it);
      const overlaps = mx >= b.minX - radius && mx <= b.maxX + radius && my >= b.minY - radius && my <= b.maxY + radius;
      return !overlaps;
    });
    if (page.items.length !== initialLen) {
      this.commitDocumentChange();
      this.render();
    }
  }

  promptAddText(x, y) {
    const text = window.prompt("Write text, markdown, or KaTeX formula ($...$):");
    if (!text || !text.trim()) return;
    const page = this.getActivePage();
    if (!page) return;
    const item = createText({
      text: text.trim(),
      x,
      y,
      fontSize: 22,
      color: this.strokeColor,
      author: "user",
    });
    page.items.push(item);
    pushUndoAction(this.undoStack, { type: "add_item", pageId: page.id, item });
    this.commitDocumentChange();
    this.setTool("select");
    this.render();
  }

  addStickyAt(x, y) {
    const text = window.prompt("Sticky note content:");
    if (!text || !text.trim()) return;
    const page = this.getActivePage();
    if (!page) return;
    const item = createSticky({
      text: text.trim(),
      x,
      y,
      color: "#fef3c7",
      author: "user",
    });
    page.items.push(item);
    if (this.soundEnabled) robotSound.play("sticky");
    pushUndoAction(this.undoStack, { type: "add_item", pageId: page.id, item });
    this.commitDocumentChange();
    this.setTool("select");
    this.render();
  }

  addChecklistAt(x, y) {
    const title = window.prompt("Checklist title:", "Sprint Tasks");
    if (title === null) return;
    const page = this.getActivePage();
    if (!page) return;
    const item = createChecklist({
      title: title || "Checklist",
      items: [{ text: "First task", checked: false }, { text: "Second task", checked: false }],
      x,
      y,
      author: "user",
    });
    page.items.push(item);
    pushUndoAction(this.undoStack, { type: "add_item", pageId: page.id, item });
    this.commitDocumentChange();
    this.setTool("select");
    this.render();
  }

  addTableAt(x, y) {
    const page = this.getActivePage();
    if (!page) return;
    const item = createTable({
      headers: ["Column A", "Column B", "Column C"],
      rows: [["Value 1", "Value 2", "Value 3"], ["Value 4", "Value 5", "Value 6"]],
      x,
      y,
      author: "user",
    });
    page.items.push(item);
    pushUndoAction(this.undoStack, { type: "add_item", pageId: page.id, item });
    this.commitDocumentChange();
    this.setTool("select");
    this.render();
  }

  addDiagramAt(x, y) {
    const code = window.prompt("Mermaid diagram code:", "graph TD; A[Idea] --> B[Implementation]; B --> C[Release]");
    if (!code || !code.trim()) return;
    const page = this.getActivePage();
    if (!page) return;
    const item = createDiagram({
      syntax: "mermaid",
      code: code.trim(),
      x,
      y,
      author: "user",
    });
    page.items.push(item);
    pushUndoAction(this.undoStack, { type: "add_item", pageId: page.id, item });
    this.commitDocumentChange();
    this.setTool("select");
    this.render();
  }

  deleteSelection() {
    const page = this.getActivePage();
    if (!page) return;
    for (const id of this.selectedItemIds) {
      removeItem(page, id);
    }
    this.selectedItemIds.clear();
    this.commitDocumentChange();
    this.render();
  }

  undo() {
    modelUndo(this.doc, this.undoStack);
    this.commitDocumentChange();
    this.render();
  }

  redo() {
    modelRedo(this.doc, this.undoStack);
    this.commitDocumentChange();
    this.render();
  }

  commitDocumentChange() {
    this.doc.updatedAt = Date.now();
    this.onDocumentChange(this.doc);
  }

  // Laser Pointer Animation Loop
  startLaserTimer() {
    if (this.laserTimer) return;
    this.laserTimer = setInterval(() => {
      const now = Date.now();
      this.laserPoints = this.laserPoints.filter((pt) => now - pt.t < 1200);
      this.renderOverlay();
      if (this.laserPoints.length === 0) {
        clearInterval(this.laserTimer);
        this.laserTimer = null;
      }
    }, 32);
  }

  // Rendering Layers
  render() {
    this.renderBackground();
    this.renderMain();
    this.renderOverlay();
  }

  renderBackground() {
    const ctx = this.bgCtx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const bgType = this.doc?.settings?.background || "grid";
    if (bgType === "none") return;

    const baseSize = Number(this.doc?.settings?.gridSize) || 28;
    const step = baseSize * this.zoom;
    if (step < 8) return; // avoid dense rendering when zoomed out

    const startX = ((this.panX % step) + step) % step;
    const startY = ((this.panY % step) + step) % step;

    if (bgType === "dots") {
      ctx.fillStyle = this.doc?.settings?.gridColor || "#cbd5e1";
      for (let x = startX; x < w; x += step) {
        for (let y = startY; y < h; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, 1.2 * Math.min(this.zoom, 1.5)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (bgType === "lines") {
      ctx.strokeStyle = this.doc?.settings?.gridColor || "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = startY; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    } else {
      // Default grid
      ctx.strokeStyle = this.doc?.settings?.gridColor || "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = startX; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = startY; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }
  }

  renderMain() {
    const ctx = this.mainCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    const page = this.getActivePage();
    if (!page || !Array.isArray(page.items)) return;

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    for (const item of page.items) {
      this.drawItem(ctx, item);
      if (this.selectedItemIds.has(item.id)) {
        this.drawSelectionHandle(ctx, item);
      }
    }

    ctx.restore();
  }

  drawItem(ctx, item) {
    const type = item.type || item.kind;

    if (type === "stroke" && Array.isArray(item.points) && item.points.length > 0) {
      ctx.save();
      ctx.strokeStyle = item.color || "#1e293b";
      ctx.lineWidth = item.size || 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = item.opacity || 1;
      ctx.beginPath();
      const p0 = item.points[0];
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < item.points.length; i++) {
        const pt = item.points[i];
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.restore();
    } else if (type === "shape") {
      ctx.save();
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 120;
      const h = item.height || 80;
      const stroke = item.strokeColor || item.stroke || "#3b82f6";
      const fill = item.fillColor || item.fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = item.strokeWidth ?? 2;
      ctx.globalAlpha = item.opacity || 1;

      if (item.shapeType === "circle" || item.shapeType === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        if (fill && fill !== "none" && fill !== "transparent") {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (item.strokeWidth !== 0 && stroke !== "none") ctx.stroke();
      } else if (item.shapeType === "triangle") {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        if (fill && fill !== "none") {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        ctx.stroke();
      } else {
        // Default rect
        if (fill && fill !== "none" && fill !== "transparent") {
          ctx.fillStyle = fill;
          ctx.fillRect(x, y, w, h);
        }
        if (item.strokeWidth !== 0 && stroke !== "none") {
          ctx.strokeRect(x, y, w, h);
        }
      }

      if (item.label) {
        ctx.fillStyle = "#1e293b";
        ctx.font = `bold 14px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.label, x + w / 2, y + h / 2);
      }
      ctx.restore();
    } else if (type === "text") {
      ctx.save();
      const x = item.x || 0;
      const y = item.y || 0;
      const fSize = item.fontSize || 22;
      ctx.fillStyle = item.color || "#1e293b";
      ctx.font = `${item.handwriting ? "italic " : ""}${fSize}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Detect Arabic script for RTL text alignment
      const isArabic = /[\u0600-\u06FF]/.test(item.text);
      if (isArabic) {
        ctx.direction = "rtl";
        ctx.textAlign = "right";
      }

      ctx.fillText(item.text || "", x, y);
      ctx.restore();
    } else if (type === "sticky") {
      ctx.save();
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 160;
      const h = item.height || 160;
      ctx.fillStyle = item.color || "#fef3c7";
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = 8;
      ctx.fillRect(x, y, w, h);
      ctx.shadowColor = "transparent";

      ctx.fillStyle = "#1e293b";
      ctx.font = "14px sans-serif";
      ctx.fillText(item.text || "", x + 10, y + 14);
      ctx.restore();
    } else if (type === "checklist") {
      ctx.save();
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 220;
      const h = item.height || 140;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.08)";
      ctx.shadowBlur = 4;
      ctx.fillRect(x, y, w, h);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#cbd5e1";
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(item.title || "Checklist", x + 12, y + 12);

      ctx.font = "13px sans-serif";
      let curY = y + 36;
      for (const chk of item.items || []) {
        ctx.fillText(`[${chk.checked ? "✓" : " "}] ${chk.text || ""}`, x + 14, curY);
        curY += 22;
      }
      ctx.restore();
    } else if (type === "table") {
      ctx.save();
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 320;
      const h = item.height || 180;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#94a3b8";
      ctx.strokeRect(x, y, w, h);

      // Header row
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(x, y, w, 32);
      ctx.strokeRect(x, y, w, 32);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 13px sans-serif";
      const cols = item.headers?.length || 1;
      const colW = w / cols;
      item.headers?.forEach((hTitle, i) => {
        ctx.fillText(hTitle, x + i * colW + 8, y + 8);
      });

      ctx.font = "12px sans-serif";
      item.rows?.forEach((row, rIdx) => {
        const rowY = y + 32 + rIdx * 28;
        row.forEach((cell, cIdx) => {
          ctx.fillText(cell, x + cIdx * colW + 8, rowY + 6);
        });
      });
      ctx.restore();
    } else if (type === "diagram") {
      ctx.save();
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 340;
      const h = item.height || 220;
      ctx.fillStyle = "#e0e7ff";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#6366f1";
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "#3730a3";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(`📊 Diagram (${item.syntax || "mermaid"})`, x + 10, y + 10);
      ctx.font = "12px monospace";
      ctx.fillText((item.code || "").slice(0, 60), x + 10, y + 34);
      ctx.restore();
    }
  }

  drawSelectionHandle(ctx, item) {
    const b = getBoundingBox(item);
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(b.minX - 4, b.minY - 4, b.width + 8, b.height + 8);

    // 4 Corner resize handles
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    const handleSize = 6;
    for (const [hx, hy] of [
      [b.minX - 4, b.minY - 4],
      [b.maxX + 4, b.minY - 4],
      [b.minX - 4, b.maxY + 4],
      [b.maxX + 4, b.maxY + 4],
    ]) {
      ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
    }
    ctx.restore();
  }

  renderOverlay() {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Active drawing stroke
    if (this.currentStrokePoints.length > 1) {
      ctx.save();
      ctx.translate(this.panX, this.panY);
      ctx.scale(this.zoom, this.zoom);

      const isHighlighter = this.activeTool === "highlighter";
      ctx.strokeStyle = isHighlighter ? "#fef08a" : this.strokeColor;
      ctx.lineWidth = isHighlighter ? 18 : this.strokeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = isHighlighter ? 0.45 : 1;

      ctx.beginPath();
      ctx.moveTo(this.currentStrokePoints[0].x, this.currentStrokePoints[0].y);
      for (let i = 1; i < this.currentStrokePoints.length; i++) {
        ctx.lineTo(this.currentStrokePoints[i].x, this.currentStrokePoints[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Laser pointer fading trail
    if (this.laserPoints.length > 0) {
      ctx.save();
      ctx.translate(this.panX, this.panY);
      ctx.scale(this.zoom, this.zoom);

      const now = Date.now();
      for (const pt of this.laserPoints) {
        const age = now - pt.t;
        const alpha = Math.max(0, 1 - age / 1200);
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  renderOverlayPreviewShape(curX, curY) {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const left = Math.min(this.dragStart.x, curX);
    const top = Math.min(this.dragStart.y, curY);
    const w = Math.abs(curX - this.dragStart.x);
    const h = Math.abs(curY - this.dragStart.y);

    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeSize;
    ctx.setLineDash([4, 4]);

    if (this.activeShape === "circle" || this.activeShape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(left, top, w, h);
    }

    ctx.restore();
  }
}
