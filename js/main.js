/* ============================================================
   TICKETING APP — HOMEPAGE CONTROLLER
   File: main.js
   Purpose: Render homepage, wire search, populate featured grid
   Exposes: window.Main
   Depends on: data.js, currency.js, analytics.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    featuredLimit: 6,
    categoriesToShow: 6,
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,
    featuredEvents: [],
    categories: [],
    rendering: {
      featuredGrid: null,
      categoriesList: null,
      searchForm: null,
      searchInput: null,
      searchCity: null,
      statsStrip: null,
    },
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[Main]", ...arguments);
  }

  function warn() {
    if (CONFIG.debug) console.warn("[Main]", ...arguments);
  }

  /**
   * Escape HTML to prevent injection when injecting user data.
   */
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Format a date string like "2026-08-24" into "Aug 24".
   */
  function formatDate(dateString) {
    if (!dateString) return { month: "", day: "" };
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return { month: "", day: "" };
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return {
      month: months[d.getMonth()],
      day: String(d.getDate()).padStart(2, "0"),
    };
  }

  /**
   * Format currency safely.
   */
  function fmt(amount) {
    if (global.Currency && typeof global.Currency.format === "function") {
      return global.Currency.format(amount);
    }
    return `R${Number(amount || 0).toLocaleString()}`;
  }

  function fmtCompact(amount) {
    if (global.Currency && typeof global.Currency.formatCompact === "function") {
      return global.Currency.formatCompact(amount);
    }
    return `R${Number(amount || 0).toLocaleString()}`;
  }

  /**
   * Fire analytics event safely.
   */
  function track(name, props) {
    if (global.Analytics && typeof global.Analytics.track === "function") {
      try {
        global.Analytics.track(name, props);
      } catch (err) {
        warn("Analytics failed:", err);
      }
    }
  }

  /**
   * Get fallback image if event image fails to load.
   */
  function getFallbackImage() {
    return "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23f3f0ea' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%23b8b0a5' text-anchor='middle' dominant-baseline='middle'%3EEvent Image%3C/text%3E%3C/svg%3E";
  }

  /* ============================================================
     4. RENDER — EVENT CARD
     ============================================================ */

  /**
   * Build the HTML string for one event card.
   */
  function buildEventCard(event) {
    const venue = global.Data ? global.Data.getVenue(event.venueId) : null;
    const venueName = venue ? venue.name : "Venue TBA";

    const availability = global.Data
      ? global.Data.getEventAvailability(event.id)
      : null;
    const isSoldOut = availability && availability.isSoldOut;

    const lowestPrice = global.Data
      ? global.Data.getLowestPrice(event.id)
      : event.priceFrom || 0;

    const { month, day } = formatDate(event.date);

    const categoryLabel = event.category
      ? event.category.charAt(0).toUpperCase() + event.category.slice(1)
      : "";

    const fallback = getFallbackImage();

    return `
      <article
        class="event-card ${isSoldOut ? "is-sold-out" : ""}"
        data-event-id="${escapeHTML(event.id)}"
      >
        <a href="event.html?id=${encodeURIComponent(event.id)}" class="event-card-link" aria-label="View ${escapeHTML(event.title)}">

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
            ${categoryLabel ? `
              <span class="event-card-tag">${escapeHTML(categoryLabel)}</span>
            ` : ""}
          </div>

          <div class="event-card-body">
            <h3 class="event-card-title">${escapeHTML(event.title)}</h3>

            <div class="event-card-venue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              ${escapeHTML(venueName)}
            </div>

            <div class="event-card-footer">
              <div class="event-card-price">
                <span class="label">From</span>
                <span class="amount">${fmt(lowestPrice)}</span>
              </div>
              <span class="event-card-cta">
                ${isSoldOut ? "Sold out" : "View"}
                ${!isSoldOut ? `
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                ` : ""}
              </span>
            </div>
          </div>

        </a>
      </article>
    `;
  }

  /* ============================================================
     5. RENDER — FEATURED GRID
     ============================================================ */

  function renderFeaturedEvents() {
    const grid = document.getElementById("featuredGrid");
    if (!grid) {
      log("No #featuredGrid on page, skipping");
      return;
    }
    state.rendering.featuredGrid = grid;

    let events = [];

    if (global.Data) {
      const featured = global.Data.getFeaturedEvents();
      if (featured && featured.length > 0) {
        events = featured.slice(0, CONFIG.featuredLimit);
      } else {
        // Fallback: upcoming events
        events = global.Data.getUpcomingEvents(CONFIG.featuredLimit);
      }
    }

    state.featuredEvents = events;

    if (events.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; color: var(--color-text-muted);">
          <p>No events available yet.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = events.map(buildEventCard).join("");

    // Wire click tracking
    grid.querySelectorAll(".event-card").forEach(card => {
      const eventId = card.dataset.eventId;
      const link = card.querySelector(".event-card-link");
      if (!link) return;

      link.addEventListener("click", () => {
        track("event_card_click", { eventId, source: "homepage" });
      });
    });

    log(`Rendered ${events.length} featured events`);
  }

  /* ============================================================
     6. RENDER — CATEGORY CHIPS
     ============================================================ */

  function renderCategories() {
    const list = document.getElementById("categoriesList");
    if (!list) {
      log("No #categoriesList on page, skipping");
      return;
    }
    state.rendering.categoriesList = list;

    let categories = [];
    if (global.Data) {
      categories = global.Data.getCategories().slice(0, CONFIG.categoriesToShow);
    }

    state.categories = categories;

    if (categories.length === 0) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = categories.map(cat => `
      <a
        href="events.html?category=${encodeURIComponent(cat.id)}"
        class="category-chip"
        data-category="${escapeHTML(cat.id)}"
        aria-label="Browse ${escapeHTML(cat.name)} events"
      >
        <span class="category-chip-icon" aria-hidden="true">${cat.icon}</span>
        <span class="category-chip-label">${escapeHTML(cat.name)}</span>
      </a>
    `).join("");

    list.querySelectorAll(".category-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        track("category_click", { category: chip.dataset.category });
      });
    });

    log(`Rendered ${categories.length} categories`);
  }

  /* ============================================================
     7. HERO SEARCH FORM
     ============================================================ */

  function wireSearchForm() {
    const form = document.getElementById("heroSearchForm");
    const input = document.getElementById("heroSearchInput");
    const citySelect = document.getElementById("heroSearchCity");

    if (!form || !input) {
      log("No hero search form found");
      return;
    }

    state.rendering.searchForm = form;
    state.rendering.searchInput = input;
    state.rendering.searchCity = citySelect;

    // Populate city dropdown from Data
    if (citySelect && global.Data) {
      const cities = global.Data.getCities();
      citySelect.innerHTML = cities.map(c =>
        `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`
      ).join("");
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const query = (input.value || "").trim();
      const city = citySelect ? citySelect.value : "";

      // Track
      const resultCount = global.Data
        ? global.Data.searchEvents(query).length
        : 0;

      track("search_submit", {
        query,
        city,
        resultCount,
        source: "hero",
      });

      // Build destination
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (city) params.set("city", city);

      const qs = params.toString();
      window.location.href = `events.html${qs ? "?" + qs : ""}`;
    });

    log("Search form wired");
  }

  /* ============================================================
     8. RENDER — HERO STATS (optional)
     ============================================================ */

  function renderHeroStats() {
    const container = document.getElementById("heroStats");
    if (!container || !global.Data) return;

    const events = global.Data.getEvents();
    const cities = global.Data.getCities();
    const venues = global.Data.getVenues();

    const stats = [
      { value: events.length + "+", label: "Live events" },
      { value: cities.length, label: "Cities" },
      { value: venues.length, label: "Venues" },
    ];

    container.innerHTML = stats.map(s => `
      <div class="hero-stat">
        <div class="hero-stat-value">${escapeHTML(String(s.value))}</div>
        <div class="hero-stat-label">${escapeHTML(s.label)}</div>
      </div>
    `).join("");
  }

  /* ============================================================
     9. TRUST STRIP ICONS
     ============================================================ */

  function renderTrustStrip() {
    const container = document.getElementById("trustGrid");
    if (!container) return;

    const items = [
      {
        icon: "🔒",
        title: "Secure payments",
        text: "Every transaction encrypted with industry-leading security.",
      },
      {
        icon: "⚡",
        title: "Instant tickets",
        text: "Digital tickets delivered immediately after purchase.",
      },
      {
        icon: "✓",
        title: "Verified events",
        text: "All events screened and verified by our team.",
      },
      {
        icon: "💬",
        title: "24/7 support",
        text: "Real humans ready to help whenever you need us.",
      },
    ];

    container.innerHTML = items.map(item => `
      <div class="trust-item">
        <div class="trust-item-icon" aria-hidden="true">${item.icon}</div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.text)}</p>
      </div>
    `).join("");
  }

  /* ============================================================
     10. NEWSLETTER FORM (basic)
     ============================================================ */

  function wireNewsletter() {
    const form = document.getElementById("newsletterForm");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = (form.querySelector("input[type='email']") || {}).value || "";

      track("newsletter_signup", { email: email.trim() });

      // Reset + notify
      form.reset();
      const btn = form.querySelector("button[type='submit']");
      if (btn) {
        const original = btn.textContent;
        btn.textContent = "Subscribed ✓";
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 2200);
      }

      // Optional toast
      if (global.Toast && typeof global.Toast.show === "function") {
        global.Toast.show("You're on the list.");
      }
    });
  }

  /* ============================================================
     11. SOLD OUT / STATUS HELPERS
     ============================================================ */

  /**
   * Add a small "X events left" badge to cards if running low.
   * Applied via data attribute on hover, or as a subtle indicator.
   */
  function annotateScarcity() {
    const cards = document.querySelectorAll(".event-card");
    cards.forEach(card => {
      const eventId = card.dataset.eventId;
      if (!eventId || !global.Data) return;

      const avail = global.Data.getEventAvailability(eventId);
      if (!avail) return;

      // If less than 15% available, add a scarcity class
      if (avail.percentage >= 85 && !avail.isSoldOut) {
        card.classList.add("is-scarce");
      }
    });
  }

  /* ============================================================
     12. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    log("Initializing homepage");

    renderFeaturedEvents();
    renderCategories();
    wireSearchForm();
    renderHeroStats();
    renderTrustStrip();
    wireNewsletter();
    annotateScarcity();

    // Fire a page_view analytics event (Navigation already does one,
    // but this one includes homepage context).
    track("page_view", {
      page: "homepage",
      featuredCount: state.featuredEvents.length,
      categoryCount: state.categories.length,
    });

    state.initialized = true;
    log("Homepage ready");
  }

  /* ============================================================
     13. PUBLIC API
     ============================================================ */

  const Main = {
    init,
    renderFeaturedEvents,
    renderCategories,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.Main = Main;

  // Auto-init
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Main;
  }

})(typeof window !== "undefined" ? window : this);
