/* ============================================================
   TICKETING APP — EVENTS LISTING CONTROLLER
   File: events.js
   Purpose: Filter, sort, render event listing page
   Exposes: window.Events
   Depends on: data.js, currency.js, analytics.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    itemsPerPage: 9,
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,

    // Filter state (from URL + user interaction)
    filters: {
      query: "",
      cities: [],       // array of city IDs
      categories: [],   // array of category IDs
      minPrice: null,
      maxPrice: null,
      dateRange: null,  // "today" | "week" | "month" | null
    },

    sort: "date",       // "date" | "price_asc" | "price_desc" | "popularity"
    viewMode: "grid",   // "grid" | "list"
    page: 1,

    // Data
    allEvents: [],
    filteredEvents: [],
    displayedEvents: [],

    // DOM cache
    dom: {},
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[Events]", ...arguments);
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

  function formatDate(dateString) {
    if (!dateString) return { month: "", day: "" };
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return { month: "", day: "" };
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return {
      month: months[d.getMonth()],
      day: String(d.getDate()).padStart(2, "0"),
    };
  }

  function getFallbackImage() {
    return "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23f3f0ea' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%23b8b0a5' text-anchor='middle' dominant-baseline='middle'%3EEvent Image%3C/text%3E%3C/svg%3E";
  }

  /* ============================================================
     4. URL PARSING / BUILDING
     ============================================================ */

  function readURL() {
    const params = new URLSearchParams(window.location.search);

    state.filters.query = params.get("q") || "";
    state.filters.cities = params.getAll("city").filter(Boolean);
    state.filters.categories = params.getAll("category").filter(Boolean);
    state.filters.minPrice = params.has("min") ? Number(params.get("min")) : null;
    state.filters.maxPrice = params.has("max") ? Number(params.get("max")) : null;
    state.filters.dateRange = params.get("when") || null;
    state.sort = params.get("sort") || "date";
    state.viewMode = params.get("view") || "grid";

    log("URL filters loaded:", state.filters);
  }

  function writeURL(replace) {
    const params = new URLSearchParams();

    if (state.filters.query) params.set("q", state.filters.query);
    state.filters.cities.forEach(c => params.append("city", c));
    state.filters.categories.forEach(c => params.append("category", c));
    if (state.filters.minPrice != null) params.set("min", state.filters.minPrice);
    if (state.filters.maxPrice != null) params.set("max", state.filters.maxPrice);
    if (state.filters.dateRange) params.set("when", state.filters.dateRange);
    if (state.sort !== "date") params.set("sort", state.sort);
    if (state.viewMode !== "grid") params.set("view", state.viewMode);

    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;

    if (replace) {
      window.history.replaceState({}, "", url);
    } else {
      window.history.pushState({}, "", url);
    }
  }

  /* ============================================================
     5. FILTERING
     ============================================================ */

  function matchesSearch(event, query) {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    const venue = global.Data ? global.Data.getVenue(event.venueId) : null;
    const haystack = [
      event.title,
      event.description,
      event.category,
      venue ? venue.name : "",
      venue ? venue.city : "",
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  }

  function matchesCities(event, cities) {
    if (!cities || cities.length === 0) return true;
    return cities.includes(event.city);
  }

  function matchesCategories(event, categories) {
    if (!categories || categories.length === 0) return true;
    return categories.includes(event.category);
  }

  function matchesPrice(event, minPrice, maxPrice) {
    const lowest = global.Data ? global.Data.getLowestPrice(event.id) : event.priceFrom || 0;
    if (minPrice != null && lowest < minPrice) return false;
    if (maxPrice != null && lowest > maxPrice) return false;
    return true;
  }

  function matchesDateRange(event, range) {
    if (!range) return true;
    const eventDate = new Date(event.date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((eventDate - now) / (1000 * 60 * 60 * 24));

    if (range === "today") return diffDays === 0;
    if (range === "week") return diffDays >= 0 && diffDays <= 7;
    if (range === "month") return diffDays >= 0 && diffDays <= 30;
    return true;
  }

  function applyFilters() {
    const { query, cities, categories, minPrice, maxPrice, dateRange } = state.filters;

    state.filteredEvents = state.allEvents.filter(evt =>
      matchesSearch(evt, query) &&
      matchesCities(evt, cities) &&
      matchesCategories(evt, categories) &&
      matchesPrice(evt, minPrice, maxPrice) &&
      matchesDateRange(evt, dateRange)
    );

    log(`Filtered: ${state.filteredEvents.length} of ${state.allEvents.length}`);
  }

  /* ============================================================
     6. SORTING
     ============================================================ */

  function applySort() {
    const sorted = state.filteredEvents.slice();

    switch (state.sort) {
      case "price_asc":
        sorted.sort((a, b) => {
          const pa = global.Data ? global.Data.getLowestPrice(a.id) : 0;
          const pb = global.Data ? global.Data.getLowestPrice(b.id) : 0;
          return pa - pb;
        });
        break;

      case "price_desc":
        sorted.sort((a, b) => {
          const pa = global.Data ? global.Data.getLowestPrice(a.id) : 0;
          const pb = global.Data ? global.Data.getLowestPrice(b.id) : 0;
          return pb - pa;
        });
        break;

      case "popularity":
        // Simple heuristic: featured first, then by availability
        sorted.sort((a, b) => {
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          const aa = global.Data ? global.Data.getEventAvailability(a.id) : null;
          const ab = global.Data ? global.Data.getEventAvailability(b.id) : null;
          const pa = aa ? aa.percentage : 0;
          const pb = ab ? ab.percentage : 0;
          return pb - pa;
        });
        break;

      case "date":
      default:
        sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
        break;
    }

    state.filteredEvents = sorted;
  }

  /* ============================================================
     7. RENDER — EVENT CARD (matches homepage card)
     ============================================================ */

  function buildCard(event) {
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
     8. RENDER — EMPTY STATE
     ============================================================ */

  function buildEmptyState() {
    const hasFilters =
      state.filters.query ||
      state.filters.cities.length > 0 ||
      state.filters.categories.length > 0 ||
      state.filters.minPrice != null ||
      state.filters.maxPrice != null ||
      state.filters.dateRange;

    return `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true">🔍</div>
        <h3>${hasFilters ? "No events match your filters." : "No events yet."}</h3>
        <p>
          ${hasFilters
            ? "Try adjusting your search or filters to see more results."
            : "Check back soon — new events are added regularly."}
        </p>
        ${hasFilters ? `
          <button class="btn btn-primary" id="clearFiltersBtn">
            Clear all filters
          </button>
        ` : ""}
      </div>
    `;
  }

  /* ============================================================
     9. RENDER — RESULTS
     ============================================================ */

  function renderResults() {
    const grid = state.dom.resultsGrid;
    if (!grid) return;

    // Pagination slice
    const total = state.filteredEvents.length;
    const limit = state.page * CONFIG.itemsPerPage;
    state.displayedEvents = state.filteredEvents.slice(0, limit);

    // View mode class
    grid.classList.toggle("is-list", state.viewMode === "list");

    if (total === 0) {
      grid.innerHTML = buildEmptyState();
      wireEmptyState();
    } else {
      const cards = state.displayedEvents.map(buildCard).join("");

      const hasMore = total > state.displayedEvents.length;
      const loadMore = hasMore ? `
        <div class="load-more-wrap">
          <button class="load-more-btn" id="loadMoreBtn">
            Load more events
          </button>
        </div>
      ` : "";

      grid.innerHTML = cards + loadMore;
      wireCardClicks();
      wireLoadMore();
    }

    // Update count
    updateResultCount();
  }

  function wireCardClicks() {
    state.dom.resultsGrid.querySelectorAll(".event-card").forEach(card => {
      const link = card.querySelector(".event-card-link");
      if (!link) return;
      link.addEventListener("click", () => {
        track("event_card_click", {
          eventId: card.dataset.eventId,
          source: "events_listing",
          position: state.displayedEvents.findIndex(e => e.id === card.dataset.eventId),
        });
      });
    });
  }

  function wireLoadMore() {
    const btn = document.getElementById("loadMoreBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      state.page++;
      renderResults();
      track("load_more", { page: state.page });
    });
  }

  function wireEmptyState() {
    const btn = document.getElementById("clearFiltersBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      clearAllFilters();
    });
  }

  function updateResultCount() {
    if (state.dom.resultCount) {
      state.dom.resultCount.textContent = state.filteredEvents.length;
    }
    if (state.dom.resultsSummary) {
      const shown = state.displayedEvents.length;
      const total = state.filteredEvents.length;
      state.dom.resultsSummary.textContent =
        total === 0
          ? "No events found"
          : `Showing ${shown} of ${total} event${total === 1 ? "" : "s"}`;
    }
  }

  /* ============================================================
     10. RENDER — ACTIVE FILTER PILLS
     ============================================================ */

  function renderActiveFilters() {
    const container = state.dom.activeFilters;
    if (!container) return;

    const pills = [];

    if (state.filters.query) {
      pills.push({
        type: "query",
        label: `"${state.filters.query}"`,
      });
    }

    state.filters.cities.forEach(cityId => {
      const city = global.Data ? global.Data.getCity(cityId) : null;
      pills.push({
        type: "city",
        value: cityId,
        label: city ? city.name : cityId,
      });
    });

    state.filters.categories.forEach(catId => {
      const cat = global.Data ? global.Data.getCategory(catId) : null;
      pills.push({
        type: "category",
        value: catId,
        label: cat ? cat.name : catId,
      });
    });

    if (state.filters.minPrice != null || state.filters.maxPrice != null) {
      const min = state.filters.minPrice != null ? fmt(state.filters.minPrice) : "R0";
      const max = state.filters.maxPrice != null ? fmt(state.filters.maxPrice) : "Any";
      pills.push({
        type: "price",
        label: `${min} – ${max}`,
      });
    }

    if (state.filters.dateRange) {
      const labels = { today: "Today", week: "This week", month: "This month" };
      pills.push({
        type: "date",
        value: state.filters.dateRange,
        label: labels[state.filters.dateRange] || state.filters.dateRange,
      });
    }

    if (pills.length === 0) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    container.innerHTML = `
      <span class="active-filters-label">Filters</span>
      ${pills.map(p => `
        <button
          class="filter-pill"
          data-type="${escapeHTML(p.type)}"
          data-value="${escapeHTML(p.value || "")}"
        >
          <span>${escapeHTML(p.label)}</span>
          <span class="pill-close" aria-hidden="true">✕</span>
        </button>
      `).join("")}
      <button class="clear-filters" id="clearFiltersBtnSmall">Clear all</button>
    `;

    container.querySelectorAll(".filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        removeFilter(pill.dataset.type, pill.dataset.value);
      });
    });

    const clearBtn = document.getElementById("clearFiltersBtnSmall");
    if (clearBtn) {
      clearBtn.addEventListener("click", clearAllFilters);
    }
  }

  function removeFilter(type, value) {
    switch (type) {
      case "query":
        state.filters.query = "";
        if (state.dom.searchInput) state.dom.searchInput.value = "";
        break;
      case "city":
        state.filters.cities = state.filters.cities.filter(c => c !== value);
        break;
      case "category":
        state.filters.categories = state.filters.categories.filter(c => c !== value);
        break;
      case "price":
        state.filters.minPrice = null;
        state.filters.maxPrice = null;
        if (state.dom.minPrice) state.dom.minPrice.value = "";
        if (state.dom.maxPrice) state.dom.maxPrice.value = "";
        break;
      case "date":
        state.filters.dateRange = null;
        break;
    }
    state.page = 1;
    update();
    track("filter_remove", { type, value });
  }

  function clearAllFilters() {
    state.filters = {
      query: "",
      cities: [],
      categories: [],
      minPrice: null,
      maxPrice: null,
      dateRange: null,
    };
    state.page = 1;

    // Reset DOM
    if (state.dom.searchInput) state.dom.searchInput.value = "";
    if (state.dom.cityCheckboxes) {
      state.dom.cityCheckboxes.forEach(cb => (cb.checked = false));
    }
    if (state.dom.categoryCheckboxes) {
      state.dom.categoryCheckboxes.forEach(cb => (cb.checked = false));
    }
    if (state.dom.minPrice) state.dom.minPrice.value = "";
    if (state.dom.maxPrice) state.dom.maxPrice.value = "";
    if (state.dom.dateShortcuts) {
      state.dom.dateShortcuts.forEach(btn => btn.classList.remove("is-active"));
    }

    update();
    track("filters_clear_all");
  }

  /* ============================================================
     11. RENDER — SIDEBAR COUNTS
     ============================================================ */

  function renderSidebarCounts() {
    // Cities
    const cityCounts = {};
    const catCounts = {};

    state.allEvents.forEach(evt => {
      cityCounts[evt.city] = (cityCounts[evt.city] || 0) + 1;
      catCounts[evt.category] = (catCounts[evt.category] || 0) + 1;
    });

    Object.entries(cityCounts).forEach(([cityId, count]) => {
      const el = document.querySelector(`[data-count-city="${cityId}"]`);
      if (el) el.textContent = count;
    });

    Object.entries(catCounts).forEach(([catId, count]) => {
      const el = document.querySelector(`[data-count-category="${catId}"]`);
      if (el) el.textContent = count;
    });
  }

  /* ============================================================
     12. WIRING — SIDEBAR FILTERS
     ============================================================ */

  function wireSidebarFilters() {
    // City checkboxes
    state.dom.cityCheckboxes = document.querySelectorAll("[data-filter-city]");
    state.dom.cityCheckboxes.forEach(cb => {
      const cityId = cb.dataset.filterCity;

      // Restore state from URL
      if (state.filters.cities.includes(cityId)) cb.checked = true;

      cb.addEventListener("change", () => {
        if (cb.checked) {
          state.filters.cities.push(cityId);
        } else {
          state.filters.cities = state.filters.cities.filter(c => c !== cityId);
        }
        state.page = 1;
        update();
        track("filter_apply", { filter: "city", value: cityId, checked: cb.checked });
      });
    });

    // Category checkboxes
    state.dom.categoryCheckboxes = document.querySelectorAll("[data-filter-category]");
    state.dom.categoryCheckboxes.forEach(cb => {
      const catId = cb.dataset.filterCategory;

      if (state.filters.categories.includes(catId)) cb.checked = true;

      cb.addEventListener("change", () => {
        if (cb.checked) {
          state.filters.categories.push(catId);
        } else {
          state.filters.categories = state.filters.categories.filter(c => c !== catId);
        }
        state.page = 1;
        update();
        track("filter_apply", { filter: "category", value: catId, checked: cb.checked });
      });
    });

    // Price inputs
    state.dom.minPrice = document.getElementById("filterMinPrice");
    state.dom.maxPrice = document.getElementById("filterMaxPrice");

    if (state.filters.minPrice != null && state.dom.minPrice) {
      state.dom.minPrice.value = state.filters.minPrice;
    }
    if (state.filters.maxPrice != null && state.dom.maxPrice) {
      state.dom.maxPrice.value = state.filters.maxPrice;
    }

    function onPriceChange() {
      const min = state.dom.minPrice ? Number(state.dom.minPrice.value) || null : null;
      const max = state.dom.maxPrice ? Number(state.dom.maxPrice.value) || null : null;
      state.filters.minPrice = min;
      state.filters.maxPrice = max;
      state.page = 1;
      update();
      track("filter_apply", { filter: "price", min, max });
    }

    if (state.dom.minPrice) state.dom.minPrice.addEventListener("change", onPriceChange);
    if (state.dom.maxPrice) state.dom.maxPrice.addEventListener("change", onPriceChange);

    // Date shortcuts
    state.dom.dateShortcuts = document.querySelectorAll("[data-date-range]");
    state.dom.dateShortcuts.forEach(btn => {
      const range = btn.dataset.dateRange;

      if (state.filters.dateRange === range) btn.classList.add("is-active");

      btn.addEventListener("click", () => {
        if (state.filters.dateRange === range) {
          state.filters.dateRange = null;
          btn.classList.remove("is-active");
        } else {
          state.filters.dateRange = range;
          state.dom.dateShortcuts.forEach(b => b.classList.remove("is-active"));
          btn.classList.add("is-active");
        }
        state.page = 1;
        update();
        track("filter_apply", { filter: "date", value: range });
      });
    });
  }

  /* ============================================================
     13. WIRING — SEARCH / SORT / VIEW
     ============================================================ */

  function wireSearch() {
    state.dom.searchInput = document.getElementById("eventsSearchInput");
    state.dom.searchCity = document.getElementById("eventsSearchCity");

    if (state.dom.searchInput) {
      state.dom.searchInput.value = state.filters.query;
    }

    if (state.dom.searchCity && global.Data) {
      const cities = global.Data.getCities();
      state.dom.searchCity.innerHTML = `<option value="">All cities</option>` +
        cities.map(c =>
          `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`
        ).join("");

      if (state.filters.cities.length === 1) {
        state.dom.searchCity.value = state.filters.cities[0];
      }
    }

    const form = document.getElementById("eventsSearchForm");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = (state.dom.searchInput.value || "").trim();
      const city = state.dom.searchCity ? state.dom.searchCity.value : "";

      state.filters.query = q;
      if (city) {
        state.filters.cities = [city];
      } else {
        state.filters.cities = [];
      }

      // Update city checkboxes to match
      if (state.dom.cityCheckboxes) {
        state.dom.cityCheckboxes.forEach(cb => {
          cb.checked = state.filters.cities.includes(cb.dataset.filterCity);
        });
      }

      state.page = 1;
      update();

      track("search", { query: q, city, source: "events_page" });
    });

    // Live search (debounced)
    let searchTimer;
    if (state.dom.searchInput) {
      state.dom.searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.filters.query = state.dom.searchInput.value.trim();
          state.page = 1;
          update();
        }, 350);
      });
    }
  }

  function wireSort() {
    state.dom.sortSelect = document.getElementById("eventsSort");
    if (!state.dom.sortSelect) return;

    state.dom.sortSelect.value = state.sort;

    state.dom.sortSelect.addEventListener("change", () => {
      state.sort = state.dom.sortSelect.value;
      state.page = 1;
      update();
      track("sort_change", { sort: state.sort });
    });
  }

  function wireViewToggle() {
    const buttons = document.querySelectorAll("[data-view]");
    state.dom.viewToggleButtons = buttons;

    buttons.forEach(btn => {
      if (btn.dataset.view === state.viewMode) {
        btn.classList.add("is-active");
      }

      btn.addEventListener("click", () => {
        state.viewMode = btn.dataset.view;
        buttons.forEach(b => b.classList.toggle("is-active", b === btn));
        renderResults();
        updateURLReplace();
        track("view_change", { mode: state.viewMode });
      });
    });
  }

  function wireMobileSidebar() {
    const trigger = document.getElementById("filtersMobileTrigger");
    const sidebar = state.dom.sidebar;

    if (!trigger || !sidebar) return;

    trigger.addEventListener("click", () => {
      const isOpen = sidebar.classList.toggle("is-open");
      document.body.style.overflow = isOpen ? "hidden" : "";
      track("mobile_filters_toggle", { open: isOpen });
    });

    // Close on overlay click
    document.addEventListener("click", (e) => {
      if (
        sidebar.classList.contains("is-open") &&
        !sidebar.contains(e.target) &&
        !trigger.contains(e.target)
      ) {
        sidebar.classList.remove("is-open");
        document.body.style.overflow = "";
      }
    });
  }

  /* ============================================================
     14. UPDATE — orchestrates everything
     ============================================================ */

  function update() {
    applyFilters();
    applySort();
    renderActiveFilters();
    renderResults();
    updateURL();
    log("Updated:", {
      filters: state.filters,
      sort: state.sort,
      results: state.filteredEvents.length,
    });
  }

  function updateURL() {
    writeURL(true);
  }

  function updateURLReplace() {
    writeURL(true);
  }

  /* ============================================================
     15. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    log("Initializing events page");

    // Cache DOM
    state.dom.resultsGrid = document.getElementById("eventsResults");
    state.dom.activeFilters = document.getElementById("activeFilters");
    state.dom.resultCount = document.getElementById("eventsResultCount");
    state.dom.resultsSummary = document.getElementById("eventsResultsSummary");
    state.dom.sidebar = document.querySelector(".filters-sidebar");

    if (!state.dom.resultsGrid) {
      log("No results grid on this page — skipping");
      return;
    }

    // Load data
    if (global.Data) {
      state.allEvents = global.Data.getEvents();
    }

    // Load URL filters
    readURL();

    // Wire everything
    wireSidebarFilters();
    wireSearch();
    wireSort();
    wireViewToggle();
    wireMobileSidebar();
    renderSidebarCounts();

    // Initial render
    update();

    // Listen to back/forward
    window.addEventListener("popstate", () => {
      readURL();
      // Reset sidebar checkboxes to match
      if (state.dom.cityCheckboxes) {
        state.dom.cityCheckboxes.forEach(cb => {
          cb.checked = state.filters.cities.includes(cb.dataset.filterCity);
        });
      }
      if (state.dom.categoryCheckboxes) {
        state.dom.categoryCheckboxes.forEach(cb => {
          cb.checked = state.filters.categories.includes(cb.dataset.filterCategory);
        });
      }
      state.page = 1;
      applyFilters();
      applySort();
      renderActiveFilters();
      renderResults();
    });

    state.initialized = true;
    log("Events page ready");

    track("page_view", { page: "events_listing" });
  }

  /* ============================================================
     16. PUBLIC API
     ============================================================ */

  const Events = {
    init,
    update,
    clearAllFilters,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.Events = Events;

  // Auto-init
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Events;
  }

})(typeof window !== "undefined" ? window : this);
