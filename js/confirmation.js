/* ============================================================
   TICKETING APP — CONFIRMATION CONTROLLER
   File: confirmation.js
   Purpose: Load order, populate page, QR code, actions
   Exposes: window.Confirmation
   Depends on: data.js, currency.js, analytics.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    recommendationLimit: 3,
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,
    reference: "",
    order: null,
    event: null,
    venue: null,
    recommendations: [],
    dom: {},
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[Confirmation]", ...arguments);
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

  function getReferenceFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("ref") || params.get("reference") || "";
  }

  /* ============================================================
     4. QR CODE GENERATOR (pure SVG, no library)
     A deterministic but plausible-looking QR-style pattern
     generated from the order reference. Not a real QR code —
     this is a visual placeholder for the demo.
     ============================================================ */

  function generateQRCodeSVG(text) {
    // Simple deterministic hash from the text
    const hash = simpleHash(text);
    const size = 21; // 21x21 modules (QR version 1)
    const cell = 4;  // px per module
    const margin = 2;
    const totalSize = (size + margin * 2) * cell;

    let rects = "";
    let rand = hash;

    function nextRand() {
      rand = (rand * 9301 + 49297) % 233280;
      return rand / 233280;
    }

    // Finder patterns in 3 corners (7x7)
    const finderPositions = [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ];

    // Build a boolean grid
    const grid = [];
    for (let y = 0; y < size; y++) {
      grid[y] = [];
      for (let x = 0; x < size; x++) {
        grid[y][x] = nextRand() > 0.5;
      }
    }

    // Overlay finder patterns
    finderPositions.forEach(([fx, fy]) => {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const x = fx + dx;
          const y = fy + dy;
          const isBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const isCenter = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          grid[y][x] = isBorder || isCenter;
        }
      }
    });

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // Render rects
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x]) {
          const px = (x + margin) * cell;
          const py = (y + margin) * cell;
          rects += `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="#151515"/>`;
        }
      }
    }

    return `
      <svg viewBox="0 0 ${totalSize} ${totalSize}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-label="Ticket QR code">
        <rect width="${totalSize}" height="${totalSize}" fill="#ffffff"/>
        ${rects}
      </svg>
    `;
  }

  function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & 0xffffffff;
    }
    return Math.abs(hash) || 1;
  }

  /* ============================================================
     5. RENDER — HERO
     ============================================================ */

  function renderHero() {
    if (!state.order) return;

    const email = state.order.customer && state.order.customer.email
      ? state.order.customer.email
      : "your email";

    const descEl = document.getElementById("confirmationHeroDesc");
    if (descEl) {
      descEl.innerHTML = `
        Your booking is confirmed. A copy of your tickets has been sent to
        <strong>${escapeHTML(email)}</strong>.
      `;
    }
  }

  /* ============================================================
     6. RENDER — REFERENCE
     ============================================================ */

  function renderReference() {
    if (!state.order) return;

    const valueEl = document.getElementById("referenceValue");
    if (valueEl) {
      valueEl.textContent = state.order.reference;
    }

    const copyBtn = document.getElementById("referenceCopy");
    if (copyBtn) {
      copyBtn.addEventListener("click", handleCopyReference);
    }
  }

  function handleCopyReference() {
    if (!state.order) return;
    const ref = state.order.reference;
    const btn = document.getElementById("referenceCopy");

    function onSuccess() {
      if (btn) {
        const original = btn.innerHTML;
        btn.classList.add("is-copied");
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
          Copied
        `;
        setTimeout(() => {
          btn.classList.remove("is-copied");
          btn.innerHTML = original;
        }, 1800);
      }
      track("reference_copy", { reference: ref });
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ref).then(onSuccess).catch(() => fallbackCopy(ref, onSuccess));
    } else {
      fallbackCopy(ref, onSuccess);
    }
  }

  function fallbackCopy(text, callback) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      callback && callback();
    } catch (err) {
      showToast("Copy failed — please select manually.");
    }
  }

  /* ============================================================
     7. RENDER — DETAILS
     ============================================================ */

  function renderDetails() {
    if (!state.order || !state.event) return;

    const venue = state.venue;
    const venueName = venue ? venue.name : "Venue TBA";
    const cityName = global.Data
      ? (global.Data.getCity(state.event.city)?.name || "")
      : "";

    // Event detail grid
    const gridEl = document.getElementById("eventDetailsGrid");
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="event-detail-item">
          <span class="event-detail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </span>
          <div class="event-detail-text">
            <span class="event-detail-label">Event</span>
            <span class="event-detail-value">${escapeHTML(state.event.title)}</span>
          </div>
        </div>

        <div class="event-detail-item">
          <span class="event-detail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
          </span>
          <div class="event-detail-text">
            <span class="event-detail-label">Date & time</span>
            <span class="event-detail-value">${escapeHTML(formatLongDate(state.event.date))} · ${escapeHTML(state.event.timeLabel || "")}</span>
          </div>
        </div>

        <div class="event-detail-item">
          <span class="event-detail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </span>
          <div class="event-detail-text">
            <span class="event-detail-label">Venue</span>
            <span class="event-detail-value">${escapeHTML(venueName)}</span>
          </div>
        </div>

        <div class="event-detail-item">
          <span class="event-detail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14"/>
            </svg>
          </span>
          <div class="event-detail-text">
            <span class="event-detail-label">City</span>
            <span class="event-detail-value">${escapeHTML(cityName)}</span>
          </div>
        </div>
      `;
    }

    // Order items table
    const tbody = document.getElementById("orderTableBody");
    if (tbody) {
      const items = groupOrderItems(state.order.items || []);
      tbody.innerHTML = items.map(item => `
        <tr>
          <td>
            <div class="order-table-item-name">${escapeHTML(item.tierName)}</div>
            <div class="order-table-item-meta">${item.quantity} table${item.quantity === 1 ? "" : "s"}</div>
            ${item.seats.length > 0 ? `
              <div class="order-table-seats">
                ${item.seats.map(seat => `
                  <span class="order-table-seat">${escapeHTML(seat)}</span>
                `).join("")}
              </div>
            ` : ""}
          </td>
          <td>${item.quantity}</td>
          <td class="order-table-price">${fmt(item.subtotal)}</td>
        </tr>
      `).join("");
    }

    // Totals
    renderTotals();
  }

  function groupOrderItems(items) {
    const groups = {};
    items.forEach(item => {
      const key = item.tierId;
      if (!groups[key]) {
        const tier = state.event
          ? state.event.ticketTiers.find(t => t.id === item.tierId)
          : null;
        groups[key] = {
          tierId: item.tierId,
          tierName: tier ? tier.name : "Ticket",
          quantity: 0,
          subtotal: 0,
          seats: [],
        };
      }
      groups[key].quantity += item.quantity || 1;
      groups[key].subtotal += (item.unitPrice || 0) * (item.quantity || 1);
      if (item.selectedSeats) {
        groups[key].seats.push(...item.selectedSeats);
      }
    });
    return Object.values(groups);
  }

  function renderTotals() {
    const container = document.getElementById("totalsBlock");
    if (!container || !state.order || !state.order.totals) return;

    const t = state.order.totals;

    container.innerHTML = `
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${fmt(t.subtotal)}</span>
      </div>

      ${t.vat > 0 ? `
        <div class="totals-row">
          <span>VAT (15%)</span>
          <span>${fmt(t.vat)}</span>
        </div>
      ` : ""}

      ${t.userServiceFee > 0 ? `
        <div class="totals-row">
          <span>Service fee</span>
          <span>${fmt(t.userServiceFee)}</span>
        </div>
      ` : ""}

      ${t.discount > 0 ? `
        <div class="totals-row is-discount">
          <span>Discount</span>
          <span>${fmt(t.discount)}</span>
        </div>
      ` : ""}

      <div class="totals-row is-total">
        <span>Total paid</span>
        <span>${fmt(t.finalTotal)}</span>
      </div>
    `;
  }

  /* ============================================================
     8. RENDER — QR
     ============================================================ */

  function renderQR() {
    const container = document.getElementById("qrCodeBox");
    if (!container || !state.order) return;

    const payload = JSON.stringify({
      ref: state.order.reference,
      event: state.order.eventId,
      ts: state.order.createdAt,
    });

    container.innerHTML = generateQRCodeSVG(payload);
  }

  /* ============================================================
     9. RENDER — RECOMMENDATIONS
     ============================================================ */

  function renderRecommendations() {
    const container = document.getElementById("recommendationGrid");
    if (!container || !global.Data) return;

    const all = global.Data.getEvents();
    const eventId = state.order ? state.order.eventId : null;

    // Same category first, then upcoming
    const sameCategory = eventId && state.event
      ? all.filter(e => e.id !== eventId && e.category === state.event.category)
      : [];

    const others = all.filter(e => e.id !== eventId && !sameCategory.find(s => s.id === e.id));

    const recommendations = [...sameCategory, ...others].slice(0, CONFIG.recommendationLimit);
    state.recommendations = recommendations;

    if (recommendations.length === 0) {
      const section = document.getElementById("recommendationsSection");
      if (section) section.style.display = "none";
      return;
    }

    const fallback = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23f3f0ea' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%23b8b0a5' text-anchor='middle' dominant-baseline='middle'%3EEvent Image%3C/text%3E%3C/svg%3E";

    container.innerHTML = recommendations.map(evt => {
      const venue = global.Data.getVenue(evt.venueId);
      const venueName = venue ? venue.name : "Venue TBA";
      const lowestPrice = global.Data.getLowestPrice(evt.id);
      const availability = global.Data.getEventAvailability(evt.id);
      const isSoldOut = availability && availability.isSoldOut;

      return `
        <article class="event-card ${isSoldOut ? "is-sold-out" : ""}">
          <a href="event.html?id=${encodeURIComponent(evt.id)}" class="event-card-link">
            <div class="event-card-image">
              <img
                src="${escapeHTML(evt.image)}"
                alt="${escapeHTML(evt.title)}"
                loading="lazy"
                onerror="this.onerror=null;this.src='${fallback}';"
              >
            </div>
            <div class="event-card-body">
              <h3 class="event-card-title">${escapeHTML(evt.title)}</h3>
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
    }).join("");
  }

  /* ============================================================
     10. ACTIONS — ADD TO CALENDAR (.ics)
     ============================================================ */

  function wireActions() {
    const calendarBtn = document.getElementById("addToCalendarBtn");
    if (calendarBtn) {
      calendarBtn.addEventListener("click", handleAddToCalendar);
    }

    const shareBtn = document.getElementById("shareEventBtn");
    if (shareBtn) {
      shareBtn.addEventListener("click", handleShare);
    }
  }

  function handleAddToCalendar() {
    if (!state.event) return;

    const start = buildDate(state.event.date, state.event.timeLabel || "19:00");
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // +4h

    const venue = state.venue;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Ticketing App//Confirmation//EN",
      "BEGIN:VEVENT",
      `UID:${state.order ? state.order.reference : Date.now()}@ticketingapp`,
      `DTSTAMP:${formatICalDate(new Date())}`,
      `DTSTART:${formatICalDate(start)}`,
      `DTEND:${formatICalDate(end)}`,
      `SUMMARY:${state.event.title}`,
      `DESCRIPTION:Booking ${state.order ? state.order.reference : ""} — Ticketing App`,
      venue ? `LOCATION:${venue.name}, ${venue.address || ""}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event-${state.event.id}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    track("calendar_add", {
      eventId: state.event.id,
      reference: state.order ? state.order.reference : null,
    });
    showToast("Calendar invite downloaded.");
  }

  function buildDate(dateStr, timeStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return new Date();

    const [hours, minutes] = (timeStr || "19:00").split(":").map(Number);
    date.setHours(hours || 19, minutes || 0, 0, 0);
    return date;
  }

  function formatICalDate(d) {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  async function handleShare() {
    if (!state.event) return;

    const url = window.location.origin + window.location.pathname + `?ref=${encodeURIComponent(state.order.reference)}`;
    const shareData = {
      title: state.event.title,
      text: `I'm going to ${state.event.title}!`,
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        track("share", { method: "native", eventId: state.event.id });
      } else {
        await navigator.clipboard.writeText(url);
        track("share", { method: "clipboard", eventId: state.event.id });
        showToast("Link copied to clipboard.");
      }
    } catch (err) {
      // User cancelled — silent
      log("Share cancelled", err);
    }
  }

  /* ============================================================
     11. TOAST
     ============================================================ */

  function showToast(message) {
    const existing = document.querySelector(".confirmation-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "confirmation-toast";
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
     12. EMPTY / NOT FOUND
     ============================================================ */

  function renderNotFound() {
    const main = document.querySelector("main") || document.querySelector(".confirmation-page");
    if (!main) return;

    document.title = "Order not found · Ticketing App";

    main.innerHTML = `
      <div class="container">
        <div class="confirmation-empty">
          <div class="confirmation-empty-icon" aria-hidden="true">🔍</div>
          <h2>We couldn't find that booking</h2>
          <p>
            The reference code you're looking for doesn't exist or has been
            cleared. If you just completed a purchase, check your email for
            your booking reference.
          </p>
          <a href="events.html" class="btn btn-primary">Browse events</a>
        </div>
      </div>
    `;

    track("confirmation_not_found", { reference: state.reference });
  }

  /* ============================================================
     13. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    log("Initializing confirmation page");

    if (!global.Data) {
      log("Data layer missing");
      return;
    }

    state.reference = getReferenceFromURL();
    if (!state.reference) {
      renderNotFound();
      return;
    }

    state.order = global.Data.getOrder(state.reference);
    if (!state.order) {
      renderNotFound();
      return;
    }

    state.event = global.Data.getEvent(state.order.eventId);
    state.venue = state.event ? global.Data.getVenue(state.event.venueId) : null;

    // Update document title
    if (state.event) {
      document.title = `Booking confirmed · ${state.event.title} · Ticketing App`;
    }

    // Render sections
    renderHero();
    renderReference();
    renderDetails();
    renderQR();
    renderRecommendations();
    wireActions();

    // Track
    track("purchase_view", {
      reference: state.order.reference,
      eventId: state.order.eventId,
      total: state.order.total,
    });

    state.initialized = true;
    log("Confirmation page ready");
  }

  /* ============================================================
     14. PUBLIC API
     ============================================================ */

  const Confirmation = {
    init,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.Confirmation = Confirmation;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Confirmation;
  }

})(typeof window !== "undefined" ? window : this);
