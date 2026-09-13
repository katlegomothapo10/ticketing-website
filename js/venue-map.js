/* ============================================================
   TICKETING APP — VENUE MAP ENGINE
   File: venue-map.js
   Purpose: Render venue, handle pan/zoom, track selection
   Exposes: window.VenueMap
   Depends on: data.js, currency.js, analytics.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    canvasWidth: 1200,
    canvasHeight: 760,
    minZoom: 0.5,
    maxZoom: 2.2,
    zoomStep: 0.15,
    fitPadding: 30,
    wheelSensitivity: 0.0015,
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,
    event: null,
    venue: null,
    tables: [],          // all tables for the current event
    selectedIds: new Set(),
    listeners: { select: [], deselect: [], change: [] },

    // View transform
    zoom: 1,
    fitScale: 1,
    panX: 0,
    panY: 0,

    // Drag
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOrigX: 0,
    dragOrigY: 0,

    // DOM
    dom: {},
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[VenueMap]", ...arguments);
  }

  function track(name, props) {
    if (global.Analytics && typeof global.Analytics.track === "function") {
      try { global.Analytics.track(name, props); } catch (e) {}
    }
  }

  function escapeHTML(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmt(amount) {
    if (global.Currency && global.Currency.format) {
      return global.Currency.format(amount);
    }
    return `R${Number(amount || 0).toLocaleString()}`;
  }

  /* ============================================================
     4. EVENT EMITTER
     ============================================================ */

  function on(eventName, handler) {
    if (!state.listeners[eventName]) return () => {};
    state.listeners[eventName].push(handler);
    return () => {
      state.listeners[eventName] = state.listeners[eventName].filter(h => h !== handler);
    };
  }

  function emit(eventName, payload) {
    (state.listeners[eventName] || []).forEach(fn => {
      try { fn(payload); } catch (err) { log("Listener error:", err); }
    });
  }

  /* ============================================================
     5. VENUE LAYOUT GENERATOR
     Each event's tables are derived from its tier capacities.
     We generate a grid inside the appropriate venue section.
     ============================================================ */

  /**
   * Generate a layout for a given event.
   * Returns an array of table objects:
   *   { id, tierId, tier, name, capacity, price, status, x, y }
   */
  function generateLayout(event) {
    if (!event || !event.ticketTiers) return [];

    const tables = [];
    let counter = 1;

    // Section layout: positions per tier
    const sectionLayouts = {
      platinum: {
        startX: 340, startY: 175,
        columns: 3, rowsMax: 2,
        cellW: 130, cellH: 100,
        maxTables: 6,
      },
      gold: {
        startX: 150, startY: 370,
        columns: 5, rowsMax: 2,
        cellW: 130, cellH: 90,
        maxTables: 10,
      },
      silver: {
        startX: 150, startY: 540,
        columns: 3, rowsMax: 2,
        cellW: 130, cellH: 90,
        maxTables: 6,
      },
      bronze: {
        startX: 680, startY: 540,
        columns: 3, rowsMax: 2,
        cellW: 130, cellH: 90,
        maxTables: 6,
      },
    };

    // Map a tier tier key ("general", "premium", "vip", "platinum")
    // to one of our four physical sections
    function resolveSection(tier) {
      if (tier.tier === "platinum") return "platinum";
      if (tier.tier === "vip") return "silver";
      if (tier.tier === "premium") return "gold";
      return "bronze";
    }

    // Demo statuses
    const demoStatuses = [
      "available", "available", "available", "reserved",
      "available", "sold", "available", "available",
      "sold", "available", "reserved", "available",
    ];

    const sectionCounters = {
      platinum: 0,
      gold: 0,
      silver: 0,
      bronze: 0,
    };

    event.ticketTiers.forEach(tier => {
      const sectionKey = resolveSection(tier);
      const layout = sectionLayouts[sectionKey];
      if (!layout) return;

      // How many tables does this tier have?
      // Use capacity / 2 as a rough table count (each table = ~capacity guests)
      let tableCount = Math.min(
        layout.maxTables,
        Math.max(1, Math.ceil(tier.capacity / Math.max(tier.capacity / 4, 1)))
      );

      // Override for demo: VIP tiers → fewer tables; general → more
      if (tier.tier === "general") tableCount = Math.min(layout.maxTables, 8);
      else if (tier.tier === "premium") tableCount = Math.min(layout.maxTables, 6);
      else if (tier.tier === "vip") tableCount = Math.min(layout.maxTables, 4);
      else tableCount = Math.min(layout.maxTables, 4);

      for (let i = 0; i < tableCount; i++) {
        const idx = sectionCounters[sectionKey]++;
        const col = idx % layout.columns;
        const row = Math.floor(idx / layout.columns);
        if (row >= layout.rowsMax) break;

        const x = layout.startX + col * layout.cellW;
        const y = layout.startY + row * layout.cellH;

        const status = demoStatuses[(counter - 1) % demoStatuses.length];

        tables.push({
          id: `TABLE-${String(counter).padStart(2, "0")}`,
          tierId: tier.id,
          tier: tier.tier,
          section: sectionKey,
          name: tier.name,
          capacity: Math.max(2, Math.ceil(tier.capacity / tableCount)),
          price: tier.price,
          status: status,
          x: x,
          y: y,
        });

        counter++;
      }
    });

    return tables;
  }

  /* ============================================================
     6. RENDER — FULL FLOOR PLAN
     ============================================================ */

  function renderFloorPlan() {
    const canvas = state.dom.canvas;
    if (!canvas) return;

    // Clear previous items but keep static structure
    canvas.querySelectorAll(".venue-item").forEach(el => el.remove());

    const fragment = document.createDocumentFragment();

    state.tables.forEach(table => {
      const el = buildTableElement(table);
      fragment.appendChild(el);
    });

    canvas.appendChild(fragment);

    log(`Rendered ${state.tables.length} tables`);
  }

  function buildTableElement(table) {
    const el = document.createElement("div");
    el.className = "venue-item";
    el.dataset.id = table.id;
    el.dataset.tierId = table.tierId;
    el.dataset.tier = table.tier;
    el.dataset.status = table.status;
    el.style.left = `${table.x}px`;
    el.style.top = `${table.y}px`;

    // Chairs (4 diagonal corners)
    ["tl", "tr", "bl", "br"].forEach(pos => {
      const chair = document.createElement("div");
      chair.className = `venue-item-chair venue-item-chair--${pos}`;
      el.appendChild(chair);
    });

    // Surface
    const surface = document.createElement("div");
    surface.className = "venue-item-surface";
    surface.innerHTML = `
      <span>${table.capacity} guests</span>
      <span style="font-size:6px;letter-spacing:0.5px;margin-top:1px;opacity:.7;">
        ${fmt(table.price)}
      </span>
    `;
    el.appendChild(surface);

    // ID
    const idEl = document.createElement("div");
    idEl.className = "venue-item-id";
    idEl.textContent = table.id;
    el.appendChild(idEl);

    // Unavailable? mark disabled
    if (table.status === "sold" || table.status === "reserved") {
      el.classList.add("is-disabled");
    }

    // Wire click
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      handleItemClick(table.id);
    });

    return el;
  }

  /* ============================================================
     7. SELECTION
     ============================================================ */

  function handleItemClick(id) {
    const table = state.tables.find(t => t.id === id);
    if (!table) return;

    if (table.status === "sold") {
      track("seat_select_blocked", { id, reason: "sold" });
      emit("blocked", { id, reason: "sold" });
      return;
    }
    if (table.status === "reserved") {
      track("seat_select_blocked", { id, reason: "held" });
      emit("blocked", { id, reason: "held" });
      return;
    }

    if (state.selectedIds.has(id)) {
      deselect(id);
    } else {
      select(id);
    }
  }

  function select(id) {
    const table = state.tables.find(t => t.id === id);
    if (!table) return;

    state.selectedIds.add(id);
    updateItemVisual(id, true);

    track("seat_select", {
      id: table.id,
      tierId: table.tierId,
      tier: table.tier,
      price: table.price,
      eventId: state.event ? state.event.id : null,
    });

    emit("select", getTablePayload(table));
    emit("change", getSelection());
    persistSelection();
  }

  function deselect(id) {
    const table = state.tables.find(t => t.id === id);
    if (!table) return;

    state.selectedIds.delete(id);
    updateItemVisual(id, false);

    track("seat_deselect", {
      id: table.id,
      tierId: table.tierId,
      eventId: state.event ? state.event.id : null,
    });

    emit("deselect", getTablePayload(table));
    emit("change", getSelection());
    persistSelection();
  }

  function updateItemVisual(id, isSelected) {
    const el = state.dom.canvas.querySelector(`.venue-item[data-id="${id}"]`);
    if (!el) return;
    el.classList.toggle("is-selected", isSelected);
  }

  function clearSelection() {
    state.selectedIds.forEach(id => updateItemVisual(id, false));
    state.selectedIds.clear();
    emit("change", []);
    persistSelection();
  }

  function getTablePayload(table) {
    return {
      id: table.id,
      tierId: table.tierId,
      tier: table.tier,
      name: table.name,
      capacity: table.capacity,
      price: table.price,
      eventId: state.event ? state.event.id : null,
    };
  }

  function getSelection() {
    return state.tables
      .filter(t => state.selectedIds.has(t.id))
      .map(getTablePayload);
  }

  /* ============================================================
     8. PERSISTENCE
     ============================================================ */

  function persistSelection() {
    try {
      const payload = {
        eventId: state.event ? state.event.id : null,
        ids: Array.from(state.selectedIds),
        timestamp: Date.now(),
      };
      sessionStorage.setItem("ticketing_app:selectedSeats", JSON.stringify(payload));
    } catch (e) {}
  }

  function restoreSelection(eventId) {
    try {
      const raw = sessionStorage.getItem("ticketing_app:selectedSeats");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.eventId !== eventId) return;

      (data.ids || []).forEach(id => {
        if (state.tables.find(t => t.id === id)) {
          state.selectedIds.add(id);
          updateItemVisual(id, true);
        }
      });

      if (state.selectedIds.size > 0) {
        emit("change", getSelection());
      }
    } catch (e) {}
  }

  /* ============================================================
     9. TRANSFORM (zoom + pan)
     ============================================================ */

  function calculateFitScale() {
    const viewport = state.dom.viewport;
    if (!viewport) return;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    const pad = CONFIG.fitPadding;
    const sx = (w - pad) / CONFIG.canvasWidth;
    const sy = (h - pad) / CONFIG.canvasHeight;
    state.fitScale = Math.min(sx, sy, 1);
    applyTransform();
  }

  function applyTransform() {
    const canvas = state.dom.canvas;
    if (!canvas) return;
    const scale = state.fitScale * state.zoom;
    canvas.style.transform =
      `translate(calc(-50% + ${state.panX}px), calc(-50% + ${state.panY}px)) scale(${scale})`;

    // Update any zoom-indicator button
    const zoomBtn = state.dom.zoomBtn;
    if (zoomBtn) {
      zoomBtn.textContent = state.zoom === 1
        ? "FIT"
        : `${Math.round(state.zoom * 100)}%`;
    }
  }

  function zoomIn() {
    state.zoom = Math.min(CONFIG.maxZoom, +(state.zoom + CONFIG.zoomStep).toFixed(2));
    applyTransform();
    track("map_zoom", { action: "in", level: state.zoom });
  }

  function zoomOut() {
    state.zoom = Math.max(CONFIG.minZoom, +(state.zoom - CONFIG.zoomStep).toFixed(2));
    applyTransform();
    track("map_zoom", { action: "out", level: state.zoom });
  }

  function fit() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyTransform();
    track("map_zoom", { action: "fit" });
  }

  function reset() {
    state.panX = 0;
    state.panY = 0;
    state.zoom = 1;
    applyTransform();
  }

  /* ============================================================
     10. PAN (drag)
     ============================================================ */

  function attachPanHandlers() {
    const viewport = state.dom.viewport;
    if (!viewport) return;

    viewport.addEventListener("mousedown", onMouseDown);
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchend", onTouchEnd);

    viewport.addEventListener("wheel", onWheel, { passive: false });
  }

  function isClickOnItem(target) {
    return !!target.closest(".venue-item");
  }

  function onMouseDown(e) {
    if (isClickOnItem(e.target)) return;
    state.dragging = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.dragOrigX = state.panX;
    state.dragOrigY = state.panY;
  }

  function onMouseMove(e) {
    if (!state.dragging) return;
    state.panX = state.dragOrigX + (e.clientX - state.dragStartX);
    state.panY = state.dragOrigY + (e.clientY - state.dragStartY);
    applyTransform();
  }

  function onMouseUp() {
    if (!state.dragging) return;
    state.dragging = false;
    track("map_pan_end", { x: state.panX, y: state.panY });
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (isClickOnItem(e.target)) return;
    state.dragging = true;
    state.dragStartX = t.clientX;
    state.dragStartY = t.clientY;
    state.dragOrigX = state.panX;
    state.dragOrigY = state.panY;
  }

  function onTouchMove(e) {
    if (!state.dragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    state.panX = state.dragOrigX + (t.clientX - state.dragStartX);
    state.panY = state.dragOrigY + (t.clientY - state.dragStartY);
    applyTransform();
    e.preventDefault();
  }

  function onTouchEnd() {
    state.dragging = false;
  }

  function onWheel(e) {
    // Zoom on wheel with ctrl/meta (pinch on trackpads) OR plain wheel
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * CONFIG.wheelSensitivity;
      const newZoom = state.zoom * (1 + delta);
      state.zoom = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, newZoom));
      applyTransform();
      track("map_zoom", { action: "wheel", level: +state.zoom.toFixed(2) });
    }
  }

  /* ============================================================
     11. TOOLBAR WIRING
     ============================================================ */

  function wireToolbar() {
    const { zoomBtn, zoomInBtn, zoomOutBtn } = state.dom;

    if (zoomInBtn) zoomInBtn.addEventListener("click", zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener("click", zoomOut);
    if (zoomBtn) zoomBtn.addEventListener("click", fit);
  }

  /* ============================================================
     12. PUBLIC API
     ============================================================ */

  /**
   * Render the venue map for a given event.
   * @param {object} event
   * @param {object} domRefs — { viewport, canvas, zoomBtn, zoomInBtn, zoomOutBtn }
   */
  function render(event, domRefs) {
    if (!event) {
      log("render() called without event");
      return;
    }

    state.event = event;
    state.venue = global.Data ? global.Data.getVenue(event.venueId) : null;
    state.dom = Object.assign({}, state.dom, domRefs || {});

    if (!state.dom.canvas) {
      log("No canvas ref provided");
      return;
    }

    // Generate tables
    state.tables = generateLayout(event);
    state.selectedIds.clear();

    // Render
    renderFloorPlan();

    // Fit scale
    calculateFitScale();

    // Restore selection if the user came back
    restoreSelection(event.id);

    // Wire toolbar
    wireToolbar();
    attachPanHandlers();

    // Hide loading
    const loading = state.dom.canvas.querySelector(".map-loading");
    if (loading) loading.remove();

    track("map_open", {
      eventId: event.id,
      tableCount: state.tables.length,
    });

    state.initialized = true;
    log(`Rendered venue map for ${event.title}`);
  }

  /* ============================================================
     13. INITIALIZE (auto-wire DOM but don't render until called)
     ============================================================ */

  function init(domRefs) {
    state.dom = Object.assign({}, state.dom, domRefs || {});
    window.addEventListener("resize", calculateFitScale);
  }

  /* ============================================================
     14. PUBLIC OBJECT
     ============================================================ */

  const VenueMap = {
    init,
    render,
    on,
    clear: clearSelection,
    getSelection,
    select,
    deselect,
    zoomIn,
    zoomOut,
    fit,
    reset,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.VenueMap = VenueMap;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = VenueMap;
  }

})(typeof window !== "undefined" ? window : this);
