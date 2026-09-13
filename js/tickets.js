/* ============================================================
   TICKETING APP — TICKET SELECTION CONTROLLER
   File: tickets.js
   Purpose: Wire venue map, cart sidebar, checkout flow
   Exposes: window.Tickets
   Depends on: data.js, currency.js, fees.js, analytics.js, venue-map.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    maxPerTable: 1,      // how many tables a user can select (single-booking model)
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,
    event: null,
    venue: null,
    tier: null,          // tier object if ?tier= is set
    selection: [],       // current selection from VenueMap
    dom: {},
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[Tickets]", ...arguments);
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
     4. URL PARSING
     ============================================================ */

  function readURL() {
    const params = new URLSearchParams(window.location.search);
    return {
      eventId: params.get("id") || "",
      tierId: params.get("tier") || "",
    };
  }

  /* ============================================================
     5. RENDER — 404 / NOT FOUND
     ============================================================ */

  function renderNotFound() {
    const main = document.querySelector("main") || document.querySelector(".tickets-page");
    if (!main) return;

    document.title = "Event not found · Ticketing App";

    main.innerHTML = `
      <div class="container" style="text-align:center;padding:120px 0;">
        <div class="empty-state" style="border:none;background:transparent;">
          <div class="empty-state-icon">🔍</div>
          <h3>Event not found</h3>
          <p>The event you're looking for doesn't exist.</p>
          <a href="events.html" class="btn btn-primary mt-6">Browse all events</a>
        </div>
      </div>
    `;

    track("tickets_not_found", { eventId: readURL().eventId });
  }

  /* ============================================================
     6. RENDER — HEADER
     ============================================================ */

  function renderHeader() {
    if (!state.event) return;

    document.title = `Select tickets · ${state.event.title} · Ticketing App`;

    const breadcrumb = document.getElementById("ticketsBreadcrumb");
    if (breadcrumb) {
      breadcrumb.innerHTML = `
        <ol class="breadcrumb">
          <li><a href="index.html">Home</a></li>
          <li><a href="events.html">Events</a></li>
          <li><a href="event.html?id=${encodeURIComponent(state.event.id)}">${escapeHTML(state.event.title)}</a></li>
          <li>Select tickets</li>
        </ol>
      `;
    }

    const title = document.getElementById("ticketsTitle");
    if (title) title.textContent = `Choose your seats for ${state.event.title}`;

    const desc = document.getElementById("ticketsDescription");
    if (desc) {
      const venueName = state.venue ? state.venue.name : "";
      desc.textContent = state.tier
        ? `Selected tier: ${state.tier.name}. Click any available table on the map to add it to your booking.`
        : `Click any available table on the map to add it to your booking. ${venueName ? venueName + "." : ""}`;
    }
  }

  /* ============================================================
     7. RENDER — TIER SUMMARY
     ============================================================ */

  function renderTierSummary() {
    const container = document.getElementById("tierSummary");
    if (!container || !state.event) return;

    const tiers = state.event.ticketTiers || [];
    if (tiers.length === 0) {
      container.innerHTML = "";
      return;
    }

    if (state.tier) {
      // A specific tier was preselected — show its summary
      container.innerHTML = `
        <div class="tier-summary">
          <div class="tier-summary-label">Selected tier</div>
          <div class="tier-summary-name">${escapeHTML(state.tier.name)}</div>
          <div class="tier-summary-price">
            From <strong>${fmt(state.tier.price)}</strong> per table
          </div>
        </div>
      `;
      return;
    }

    // No tier preselected — show a tier picker
    container.innerHTML = `
      <div class="tier-summary">
        <div class="tier-summary-label">Available tiers</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
          ${tiers.map(t => `
            <button
              class="tier-picker-btn"
              data-tier-id="${escapeHTML(t.id)}"
              type="button"
              style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;font-size:var(--text-sm);text-align:left;"
            >
              <span>${escapeHTML(t.name)}</span>
              <strong>${fmt(t.price)}</strong>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    container.querySelectorAll("[data-tier-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tierId = btn.dataset.tierId;
        track("tier_select", {
          eventId: state.event.id,
          tierId,
          source: "tier_picker",
        });
        // Reload page with tier in URL
        const url = new URL(window.location.href);
        url.searchParams.set("tier", tierId);
        window.location.href = url.toString();
      });
    });
  }

  /* ============================================================
     8. RENDER — CART SIDEBAR
     ============================================================ */

  function renderCart(selection) {
    const countEl = state.dom.cartCount;
    const bodyEl = state.dom.cartBody;
    const footerEl = state.dom.cartFooter;
    const totalEl = state.dom.cartTotal;

    if (!bodyEl) return;

    // Update count badge
    if (countEl) {
      countEl.textContent = selection.length;
      countEl.classList.toggle("is-empty", selection.length === 0);
    }

    // Empty state
    if (selection.length === 0) {
      bodyEl.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon" aria-hidden="true">◈</div>
          <h4>Nothing selected yet</h4>
          <p>Click any available table on the venue map to add it here.</p>
        </div>
      `;
      if (footerEl) footerEl.style.display = "none";
      return;
    }

    // Group selection by tier
    const grouped = groupSelection(selection);

    // Render items
    bodyEl.innerHTML = `
      <div class="cart-items">
        ${grouped.map(group => renderCartGroup(group)).join("")}
      </div>
    `;

    // Wire remove buttons
    bodyEl.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.remove;
        global.VenueMap.deselect(id);
      });
    });

    // Update footer totals
    const subtotal = selection.reduce((sum, s) => sum + s.price, 0);

    if (totalEl) totalEl.textContent = fmt(subtotal);
    if (footerEl) footerEl.style.display = "";
  }

  function groupSelection(selection) {
    const groups = {};
    selection.forEach(item => {
      const key = item.tierId;
      if (!groups[key]) {
        groups[key] = {
          tierId: item.tierId,
          tier: item.tier,
          name: item.name,
          price: item.price,
          items: [],
        };
      }
      groups[key].items.push(item);
    });
    return Object.values(groups);
  }

  function renderCartGroup(group) {
    const groupTotal = group.items.reduce((sum, i) => sum + i.price, 0);

    return `
      <div class="cart-item" style="display:block;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;">
          <div>
            <div class="cart-item-name">${escapeHTML(group.name)}</div>
            <div class="cart-item-meta">${group.items.length} table${group.items.length === 1 ? "" : "s"}</div>
          </div>
          <div class="cart-item-price">${fmt(groupTotal)}</div>
        </div>
        <div class="cart-item-seats">
          ${group.items.map(item => `
            <button
              class="cart-item-seat"
              data-remove="${escapeHTML(item.id)}"
              title="Remove ${escapeHTML(item.id)}"
              style="cursor:pointer;"
            >
              ${escapeHTML(item.id)} ✕
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  /* ============================================================
     9. CHECKOUT
     ============================================================ */

  function handleCheckout() {
    if (!state.selection || state.selection.length === 0) {
      showToast("Please select at least one table.");
      return;
    }
    if (!state.event) return;

    // Build a cart payload grouped by tier
    const cartItems = state.selection.map(item => ({
      eventId: state.event.id,
      tierId: item.tierId,
      quantity: 1,
      unitPrice: item.price,
      selectedSeats: [item.id],
    }));

    // Persist cart
    if (global.Data) {
      // Clear existing cart for this event (avoid duplication)
      const existing = global.Data.getCart().filter(
        c => c.eventId !== state.event.id
      );
      global.Data.saveCart(existing);

      cartItems.forEach(item => global.Data.addToCart(item));
    }

    // Analytics
    track("begin_checkout", {
      eventId: state.event.id,
      itemCount: state.selection.length,
      total: state.selection.reduce((s, i) => s + i.price, 0),
    });

    // Navigate
    window.location.href = "checkout.html";
  }

  /* ============================================================
     10. TOAST
     ============================================================ */

  function showToast(message) {
    // Reuse a lightweight inline toast
    const existing = document.querySelector(".tickets-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "tickets-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-dark);
      color: var(--color-text-inverse);
      padding: 12px 20px;
      border-radius: var(--radius-full);
      font-size: var(--text-sm);
      z-index: 9999;
      box-shadow: var(--shadow-lg);
      animation: fadeIn 0.25s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  /* ============================================================
     11. WIRE — CHECKOUT BUTTON
     ============================================================ */

  function wireCheckoutButton() {
    const btn = document.getElementById("checkoutBtn");
    if (!btn) return;
    btn.addEventListener("click", handleCheckout);
  }

  /* ============================================================
     12. WIRE — MAP TOOLBAR (delegates to VenueMap)
     ============================================================ */

  function wireMapToolbar() {
    const fitBtn = document.getElementById("mapFitBtn");
    const zoomInBtn = document.getElementById("mapZoomIn");
    const zoomOutBtn = document.getElementById("mapZoomOut");

    if (fitBtn) fitBtn.addEventListener("click", () => global.VenueMap.fit());
    if (zoomInBtn) zoomInBtn.addEventListener("click", () => global.VenueMap.zoomIn());
    if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => global.VenueMap.zoomOut());
  }

  /* ============================================================
     13. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    log("Initializing tickets page");

    if (!global.Data || !global.VenueMap) {
      log("Missing Data or VenueMap module");
      return;
    }

    // Read URL
    const { eventId, tierId } = readURL();
    if (!eventId) {
      renderNotFound();
      return;
    }

    // Load event
    state.event = global.Data.getEvent(eventId);
    if (!state.event) {
      renderNotFound();
      return;
    }

    state.venue = global.Data.getVenue(state.event.venueId);

    // Optional preselected tier
    if (tierId) {
      state.tier = state.event.ticketTiers.find(t => t.id === tierId) || null;
    }

    // Cache DOM
    state.dom.cartCount = document.getElementById("cartCount");
    state.dom.cartBody = document.getElementById("cartBody");
    state.dom.cartFooter = document.getElementById("cartFooter");
    state.dom.cartTotal = document.getElementById("cartTotal");

    // Render header + tier summary
    renderHeader();
    renderTierSummary();

    // Wire VenueMap
    global.VenueMap.init({
      viewport: document.getElementById("mapViewport"),
      canvas: document.getElementById("mapCanvas"),
      zoomBtn: document.getElementById("mapFitBtn"),
      zoomInBtn: document.getElementById("mapZoomIn"),
      zoomOutBtn: document.getElementById("mapZoomOut"),
    });

    global.VenueMap.render(state.event);

    // Update status bar
    const status = document.getElementById("mapStatus");
    if (status) {
      status.textContent = `${global.VenueMap.state.tables.length} tables · Zoom to explore`;
    }

    // Subscribe to selection changes
    global.VenueMap.on("change", (selection) => {
      state.selection = selection;
      renderCart(selection);
    });

    // Handle blocked clicks (sold/held)
    global.VenueMap.on("blocked", ({ id, reason }) => {
      const messages = {
        sold: "This table has already been sold.",
        held: "This table is currently being held by someone else.",
      };
      showToast(messages[reason] || "This table isn't available.");
    });

    // Wire toolbar + checkout
    wireMapToolbar();
    wireCheckoutButton();

    // Fire analytics
    track("page_view", { page: "tickets_selection", eventId: state.event.id });

    state.initialized = true;
    log("Tickets page ready");
  }

  /* ============================================================
     14. PUBLIC API
     ============================================================ */

  const Tickets = {
    init,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.Tickets = Tickets;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Tickets;
  }

})(typeof window !== "undefined" ? window : this);
