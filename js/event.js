/* ============================================================
   TICKETING APP — EVENT DETAIL CONTROLLER
   File: event.js
   Purpose: Load event by ID, render detail page, wire actions
   Exposes: window.EventPage
   Depends on: data.js, currency.js, fees.js, analytics.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    similarLimit: 3,
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,
    event: null,
    venue: null,
    similarEvents: [],
    selectionMethod: "map", // "map" | "list"
    dom: {},
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[EventPage]", ...arguments);
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

  function formatLongDate(dateString) {
    if (!dateString) return "";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  }

  function formatShortDate(dateString) {
    if (!dateString) return { month: "", day: "" };
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return { month: "", day: "" };
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return {
      month: months[d.getMonth()],
      day: String(d.getDate()).padStart(2, "0"),
    };
  }

  function getFallbackImage() {
    return "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23f3f0ea' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%23b8b0a5' text-anchor='middle' dominant-baseline='middle'%3EEvent Image%3C/text%3E%3C/svg%3E";
  }

  function getCategoryLabel(categoryId) {
    if (!global.Data) return categoryId || "";
    const cat = global.Data.getCategory(categoryId);
    return cat ? cat.name : (categoryId || "");
  }

  /* ============================================================
     4. URL PARSING
     ============================================================ */

  function getEventIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || params.get("event") || "";
  }

  /* ============================================================
     5. RENDER — 404 / NOT FOUND
     ============================================================ */

  function renderNotFound() {
    const main = document.querySelector("main");
    if (!main) return;

    document.title = "Event not found · Ticketing App";

    main.innerHTML = `
      <div class="container section" style="text-align:center; padding: 120px 0;">
        <div class="empty-state" style="border: none; background: transparent;">
          <div class="empty-state-icon" aria-hidden="true">🔍</div>
          <h3>Event not found</h3>
          <p>
            The event you're looking for doesn't exist or has been removed.
          </p>
          <a href="events.html" class="btn btn-primary mt-6">
            Browse all events
          </a>
        </div>
      </div>
    `;

    track("event_not_found", { eventId: getEventIdFromURL() });
  }

  /* ============================================================
     6. RENDER — HERO
     ============================================================ */

  function renderHero() {
    const event = state.event;
    const venue = state.venue;
    if (!event) return;

    // Update page title + meta
    document.title = `${event.title} · Ticketing App`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", event.description || "");
    }

    const categoryLabel = getCategoryLabel(event.category);
    const image = event.image || getFallbackImage();
    const longDate = formatLongDate(event.date);
    const venueName = venue ? venue.name : "Venue TBA";
    const cityName = global.Data ? (global.Data.getCity(event.city)?.name || "") : "";

    // Background image
    const backdrop = document.getElementById("eventHeroBackdrop");
    if (backdrop) {
      backdrop.innerHTML = `<img src="${escapeHTML(image)}" alt="" aria-hidden="true">`;
    }

    // Breadcrumb
    const breadcrumb = document.getElementById("eventBreadcrumb");
    if (breadcrumb) {
      breadcrumb.innerHTML = `
        <ol class="breadcrumb">
          <li><a href="index.html">Home</a></li>
          <li><a href="events.html">Events</a></li>
          <li>${escapeHTML(event.title)}</li>
        </ol>
      `;
    }

    // Category
    const categoryEl = document.getElementById("eventCategory");
    if (categoryEl) {
      categoryEl.textContent = categoryLabel;
    }

    // Title
    const titleEl = document.getElementById("eventTitle");
    if (titleEl) {
      titleEl.textContent = event.title;
    }

    // Description
    const descEl = document.getElementById("eventDescription");
    if (descEl) {
      descEl.textContent = event.description || "";
    }

    // Meta grid
    const metaGrid = document.getElementById("eventMetaGrid");
    if (metaGrid) {
      metaGrid.innerHTML = `
        <div class="event-meta-item">
          <span class="event-meta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
          </span>
          <div class="event-meta-text">
            <span class="event-meta-label">Date</span>
            <span class="event-meta-value">${escapeHTML(longDate || event.dateLabel || "")}</span>
          </div>
        </div>

        <div class="event-meta-item">
          <span class="event-meta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </span>
          <div class="event-meta-text">
            <span class="event-meta-label">Time</span>
            <span class="event-meta-value">${escapeHTML(event.time || "")}</span>
          </div>
        </div>

        <div class="event-meta-item">
          <span class="event-meta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </span>
          <div class="event-meta-text">
            <span class="event-meta-label">Venue</span>
            <span class="event-meta-value">${escapeHTML(venueName)}</span>
          </div>
        </div>

        <div class="event-meta-item">
          <span class="event-meta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>
            </svg>
          </span>
          <div class="event-meta-text">
            <span class="event-meta-label">City</span>
            <span class="event-meta-value">${escapeHTML(cityName)}</span>
          </div>
        </div>
      `;
    }

    // Hero image
    const heroImage = document.getElementById("eventHeroImage");
    if (heroImage) {
      heroImage.innerHTML = `
        <img
          src="${escapeHTML(image)}"
          alt="${escapeHTML(event.title)}"
          onerror="this.onerror=null;this.src='${getFallbackImage()}';"
        >
      `;
    }
  }

  /* ============================================================
     7. RENDER — TICKET LIST
     ============================================================ */

  function renderTicketList() {
    const container = document.getElementById("ticketList");
    if (!container) return;
    if (!state.event) return;

    const tiers = state.event.ticketTiers || [];

    if (tiers.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="border: none;">
          <p>No ticket tiers available for this event.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = tiers.map(tier => {
      const availability = global.Data
        ? global.Data.getTierAvailability(state.event.id, tier.id)
        : null;

      const isSoldOut = availability && !availability.isAvailable;
      const remaining = availability ? availability.available : tier.available;
      const total = availability ? availability.capacity : tier.capacity;

      // Scarcity indicator
      const scarcityThreshold = Math.max(10, Math.floor(total * 0.15));
      const showScarcity = !isSoldOut && remaining <= scarcityThreshold;

      return `
        <div class="ticket-row ${isSoldOut ? "is-sold-out" : ""}" data-tier-id="${escapeHTML(tier.id)}">
          <div class="ticket-row-info">
            <h4 class="ticket-row-name">${escapeHTML(tier.name)}</h4>
            <p class="ticket-row-desc">${escapeHTML(tier.description || "")}</p>
            <div class="ticket-row-meta">
              ${showScarcity
                ? `<span class="scarcity">⚡ Only ${remaining} left</span>`
                : isSoldOut
                  ? `<span>Sold out</span>`
                  : `<span>${remaining} of ${total} available</span>`
              }
            </div>
          </div>

          <div class="ticket-row-action">
            <div class="ticket-row-price">
              <small>Per ticket</small>
              ${fmt(tier.price)}
            </div>
            <button
              class="ticket-row-btn"
              data-tier-id="${escapeHTML(tier.id)}"
              ${isSoldOut ? "disabled" : ""}
              type="button"
            >
              ${isSoldOut ? "Sold out" : "Select"}
            </button>
          </div>
        </div>
      `;
    }).join("");

    wireTicketSelectButtons();
  }

  function wireTicketSelectButtons() {
    document.querySelectorAll(".ticket-row-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tierId = btn.dataset.tierId;
        onTierSelect(tierId);
      });
    });
  }

  function onTierSelect(tierId) {
    if (!state.event) return;
    const tier = state.event.ticketTiers.find(t => t.id === tierId);
    if (!tier) return;

    track("tier_select", {
      eventId: state.event.id,
      tierId: tier.id,
      tierName: tier.name,
      price: tier.price,
      source: "event_page",
    });

    // Persist selection intent
    try {
      sessionStorage.setItem("ticketing_app:selectedTier", JSON.stringify({
        eventId: state.event.id,
        tierId: tier.id,
        timestamp: Date.now(),
      }));
    } catch (e) {}

    // Navigate to ticket selection page
    const url = `select-tickets.html?id=${encodeURIComponent(state.event.id)}&tier=${encodeURIComponent(tier.id)}`;
    window.location.href = url;
  }

  /* ============================================================
     8. RENDER — SELECTION METHOD TOGGLE
     ============================================================ */

  function wireSelectionMethods() {
    const methods = document.querySelectorAll(".selection-method");
    if (!methods.length) return;

    methods.forEach(method => {
      method.addEventListener("click", () => {
        const value = method.dataset.method;
        if (!value || value === state.selectionMethod) return;

        state.selectionMethod = value;

        methods.forEach(m => m.classList.toggle("is-active", m === method));

        // Show/hide the correct section
        updateSelectionMethodView();

        track("selection_method_change", {
          eventId: state.event ? state.event.id : null,
          method: value,
        });
      });
    });

    // Set initial state
    methods.forEach(m => {
      m.classList.toggle("is-active", m.dataset.method === state.selectionMethod);
    });

    updateSelectionMethodView();
  }

  function updateSelectionMethodView() {
    const mapWrapper = document.getElementById("selectionMethodMap");
    const listWrapper = document.getElementById("selectionMethodList");

    if (mapWrapper) {
      mapWrapper.style.display = state.selectionMethod === "map" ? "" : "none";
    }
    if (listWrapper) {
      listWrapper.style.display = state.selectionMethod === "list" ? "" : "none";
    }
  }

  /* ============================================================
     9. RENDER — SIDEBAR
     ============================================================ */

  function renderSidebar() {
    if (!state.event) return;

    const lowestPrice = global.Data
      ? global.Data.getLowestPrice(state.event.id)
      : state.event.priceFrom || 0;

    // Price
    const priceEl = document.getElementById("sidebarPrice");
    if (priceEl) priceEl.textContent = fmt(lowestPrice);

    // Availability
    const availability = global.Data
      ? global.Data.getEventAvailability(state.event.id)
      : null;

    if (availability) {
      const fillEl = document.getElementById("sidebarAvailabilityFill");
      const labelEl = document.getElementById("sidebarAvailabilityLabel");
      const countEl = document.getElementById("sidebarAvailabilityCount");

      if (fillEl) fillEl.style.width = `${availability.percentage}%`;
      if (labelEl) labelEl.textContent = `${availability.percentage}% sold`;
      if (countEl) {
        countEl.textContent = availability.isSoldOut
          ? "Sold out"
          : `${availability.available} tickets left`;
      }
    }

    // Curator
    renderCuratorCard();

    // CTA
    const cta = document.getElementById("sidebarGetTickets");
    if (cta) {
      cta.addEventListener("click", (e) => {
        e.preventDefault();
        track("get_tickets_click", { eventId: state.event.id });
        window.location.href = `select-tickets.html?id=${encodeURIComponent(state.event.id)}`;
      });
    }
  }

  function renderCuratorCard() {
    const container = document.getElementById("curatorCard");
    if (!container || !global.Data) return;

    const curators = global.Data.curators || [];
    const curator = curators[0]; // For demo, use first curator
    if (!curator) return;

    const initials = curator.name
      .split(" ")
      .map(w => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const eventCount = curator.events ? curator.events.length : 0;

    container.innerHTML = `
      <div class="event-curator-header">
        <div class="event-curator-avatar" aria-hidden="true">${escapeHTML(initials)}</div>
        <div>
          <h4 class="event-curator-name">${escapeHTML(curator.name)}</h4>
          <div class="event-curator-meta">${eventCount} event${eventCount === 1 ? "" : "s"} on Ticketing App</div>
          <span class="event-curator-verified">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
            Verified organizer
          </span>
        </div>
      </div>
    `;
  }

  /* ============================================================
     10. RENDER — SIMILAR EVENTS
     ============================================================ */

  function renderSimilarEvents() {
    const container = document.getElementById("similarGrid");
    if (!container || !global.Data || !state.event) return;

    const allEvents = global.Data.getEvents();
    const candidates = allEvents.filter(e =>
      e.id !== state.event.id &&
      (e.category === state.event.category || e.city === state.event.city)
    );

    const similar = candidates.slice(0, CONFIG.similarLimit);
    state.similarEvents = similar;

    if (similar.length === 0) {
      const section = document.getElementById("similarEventsSection");
      if (section) section.style.display = "none";
      return;
    }

    container.innerHTML = similar.map(evt => buildSimilarCard(evt)).join("");

    // Wire clicks
    container.querySelectorAll(".event-card").forEach(card => {
      const link = card.querySelector(".event-card-link");
      if (!link) return;
      link.addEventListener("click", () => {
        track("similar_event_click", {
          eventId: card.dataset.eventId,
          sourceEventId: state.event.id,
        });
      });
    });
  }

  function buildSimilarCard(event) {
    const venue = global.Data ? global.Data.getVenue(event.venueId) : null;
    const venueName = venue ? venue.name : "Venue TBA";

    const availability = global.Data
      ? global.Data.getEventAvailability(event.id)
      : null;
    const isSoldOut = availability && availability.isSoldOut;

    const lowestPrice = global.Data
      ? global.Data.getLowestPrice(event.id)
      : event.priceFrom || 0;

    const { month, day } = formatShortDate(event.date);

    const fallback = getFallbackImage();

    return `
      <article class="event-card ${isSoldOut ? "is-sold-out" : ""}" data-event-id="${escapeHTML(event.id)}">
        <a href="event.html?id=${encodeURIComponent(event.id)}" class="event-card-link">
          <div class="event-card-image">
            <img
              src="${escapeHTML(event.image)}"
              alt="${escapeHTML(event.title)}"
              loading="lazy"
              onerror="this.onerror=null;this.src='${fallback}';"
            >
            ${month ? `
              <div class="event-card-date">
                <span class="month">${escapeHTML(month)}</span>
                <span class="day">${escapeHTML(day)}</span>
              </div>
            ` : ""}
          </div>
          <div class="event-card-body">
            <h3 class="event-card-title">${escapeHTML(event.title)}</h3>
            <div class="event-card-venue">${escapeHTML(venueName)}</div>
            <div class="event-card-footer">
              <div class="event-card-price">
                <span class="label">From</span>
                <span class="amount">${fmt(lowestPrice)}</span>
              </div>
              <span class="event-card-cta">
                ${isSoldOut ? "Sold out" : "View"}
              </span>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  /* ============================================================
     11. RENDER — VENUE INFO
     ============================================================ */

  function renderVenueInfo() {
    if (!state.venue) return;

    const nameEl = document.getElementById("venueName");
    const addressEl = document.getElementById("venueAddress");
    const mapLinkEl = document.getElementById("venueMapLink");

    if (nameEl) nameEl.textContent = state.venue.name;
    if (addressEl) addressEl.textContent = state.venue.address || "";
    if (mapLinkEl) {
      const q = encodeURIComponent(`${state.venue.name}, ${state.venue.address || ""}`);
      mapLinkEl.href = `https://www.google.com/maps/search/?api=1&query=${q}`;
    }
  }

  /* ============================================================
     12. WIRE SHARE
     ============================================================ */

  function wireShare() {
    const shareBtn = document.getElementById("shareEventBtn");
    if (!shareBtn || !state.event) return;

    shareBtn.addEventListener("click", async () => {
      const url = window.location.href;
      const shareData = {
        title: state.event.title,
        text: state.event.description,
        url: url,
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
          track("event_share", { method: "native", eventId: state.event.id });
        } else {
          await navigator.clipboard.writeText(url);
          track("event_share", { method: "clipboard", eventId: state.event.id });
          if (global.Toast && global.Toast.show) {
            global.Toast.show("Link copied to clipboard");
          } else {
            showInlineToast("Link copied to clipboard");
          }
        }
      } catch (err) {
        // User cancelled or clipboard denied — silent
        log("Share cancelled", err);
      }
    });
  }

  function showInlineToast(message) {
    const existing = document.querySelector(".inline-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "inline-toast";
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
    setTimeout(() => toast.remove(), 2500);
  }

  /* ============================================================
     13. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    log("Initializing event detail page");

    if (!global.Data) {
      log("Data layer not loaded");
      return;
    }

    const eventId = getEventIdFromURL();
    if (!eventId) {
      renderNotFound();
      return;
    }

    state.event = global.Data.getEvent(eventId);
    if (!state.event) {
      renderNotFound();
      return;
    }

    state.venue = global.Data.getVenue(state.event.venueId);

    // Render every section
    renderHero();
    renderTicketList();
    wireSelectionMethods();
    renderSidebar();
    renderSimilarEvents();
    renderVenueInfo();
    wireShare();

    state.initialized = true;

    log("Event detail page ready:", state.event.title);

    // Fire analytics
    track("event_view", {
      eventId: state.event.id,
      title: state.event.title,
      category: state.event.category,
      city: state.event.city,
      priceFrom: global.Data.getLowestPrice(state.event.id),
    });
  }

  /* ============================================================
     14. PUBLIC API
     ============================================================ */

  const EventPage = {
    init,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.EventPage = EventPage;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EventPage;
  }

})(typeof window !== "undefined" ? window : this);
