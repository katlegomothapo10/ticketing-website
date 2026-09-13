/* ============================================================
   TICKETING APP — CURATOR DASHBOARD CONTROLLER
   File: curator.js
   Purpose: Compute metrics, render dashboard, wire navigation
   Exposes: window.Curator
   Depends on: data.js, currency.js, fees.js, analytics.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    activityLimit: 6,
    upcomingLimit: 6,
    chartDays: 14,
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,
    metrics: null,
    events: [],
    orders: [],
    activities: [],
    chartData: [],
    dom: {},
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[Curator]", ...arguments);
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

  function fmtCompact(amount) {
    if (global.Currency && global.Currency.formatCompact) {
      return global.Currency.formatCompact(amount);
    }
    return fmt(amount);
  }

  function round(v, d) {
    const f = Math.pow(10, d || 0);
    return Math.round(v * f) / f;
  }

  function formatShortDate(dateString) {
    if (!dateString) return "";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  }

  function relativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  /* ============================================================
     4. COMPUTE METRICS
     ============================================================ */

  function computeMetrics() {
    const orders = global.Data ? global.Data.getOrders() : [];
    const events = global.Data ? global.Data.getEvents() : [];

    state.orders = orders;
    state.events = events;

    // Revenue from all orders
    let totalRevenue = 0;
    let ticketsSold = 0;
    let seatsCapacity = 0;
    let seatsSold = 0;

    orders.forEach(order => {
      totalRevenue += Number(order.total) || 0;
      (order.items || []).forEach(item => {
        ticketsSold += item.quantity || 1;
      });
    });

    // Sell-through across all events
    events.forEach(event => {
      (event.ticketTiers || []).forEach(tier => {
        seatsCapacity += tier.capacity || 0;
        seatsSold += (tier.capacity - tier.available) || 0;
      });
    });

    const sellThrough = seatsCapacity > 0
      ? Math.round((seatsSold / seatsCapacity) * 100)
      : 0;

    // Estimated profit — rough demo: revenue - platform fees - 40% expenses
    let platformFees = 0;
    if (global.Fees && orders.length > 0) {
      orders.forEach(order => {
        (order.items || []).forEach(item => {
          const fee = global.Fees.getPlatformFeeForUnit(item.unitPrice || 0);
          platformFees += fee.fee * (item.quantity || 1);
        });
      });
    }

    const grossRevenue = totalRevenue;
    const expenses = round(grossRevenue * 0.40, 2);
    const estimatedProfit = round(grossRevenue - platformFees - expenses, 2);

    state.metrics = {
      totalRevenue,
      ticketsSold,
      sellThrough,
      estimatedProfit,
      platformFees,
      expenses,
      ordersCount: orders.length,
    };

    log("Metrics:", state.metrics);
  }

  /* ============================================================
     5. COMPUTE CHART DATA (last N days)
     ============================================================ */

  function computeChartData() {
    const days = CONFIG.chartDays;
    const now = new Date();
    const buckets = [];

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      buckets.push({
        date: day,
        label: day.getDate(),
        revenue: 0,
        refunds: 0,
      });
    }

    state.orders.forEach(order => {
      const created = new Date(order.createdAt || Date.now());
      created.setHours(0, 0, 0, 0);

      const bucket = buckets.find(b => b.date.getTime() === created.getTime());
      if (bucket) {
        bucket.revenue += Number(order.total) || 0;
      }
    });

    // Fill with demo values if empty (fresh browser)
    const hasAny = buckets.some(b => b.revenue > 0);
    if (!hasAny) {
      buckets.forEach((b, i) => {
        b.revenue = 20000 + Math.round(Math.random() * 40000);
      });
    }

    // Normalise for bar heights
    const max = Math.max(...buckets.map(b => b.revenue), 1);
    buckets.forEach(b => {
      b.heightPercent = Math.max(4, Math.round((b.revenue / max) * 100));
    });

    state.chartData = buckets;
    log("Chart data:", buckets.length, "buckets");
  }

  /* ============================================================
     6. COMPUTE ACTIVITY FEED
     ============================================================ */

  function computeActivity() {
    const activities = [];

    // Latest orders → sold activity
    const recentOrders = state.orders
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, CONFIG.activityLimit);

    recentOrders.forEach(order => {
      const event = global.Data.getEvent(order.eventId);
      if (!event) return;
      activities.push({
        type: "sale",
        iconClass: "is-success",
        icon: "✓",
        text: `<strong>${order.itemCount || 1} ticket${order.itemCount === 1 ? "" : "s"}</strong> just sold for ${escapeHTML(event.title)}.`,
        ts: order.createdAt || Date.now(),
      });
    });

    // Add a few synthesized activities for richness
    const soldOutEvents = state.events.filter(e => {
      const av = global.Data.getEventAvailability(e.id);
      return av && av.isSoldOut;
    });

    soldOutEvents.slice(0, 2).forEach(event => {
      activities.push({
        type: "sold_out",
        iconClass: "is-info",
        icon: "!",
        text: `<strong>${escapeHTML(event.title)}</strong> has sold out.`,
        ts: Date.now() - 1000 * 60 * 60 * 2,
      });
    });

    // Fallback activity
    if (activities.length === 0) {
      activities.push({
        type: "system",
        iconClass: "",
        icon: "◈",
        text: "Welcome to your curator dashboard.",
        ts: Date.now(),
      });
    }

    // Sort by recency
    activities.sort((a, b) => b.ts - a.ts);
    state.activities = activities.slice(0, CONFIG.activityLimit);
  }

  /* ============================================================
     7. RENDER — STAT CARDS
     ============================================================ */

  function renderStats() {
    const grid = document.getElementById("statGrid");
    if (!grid || !state.metrics) return;

    const m = state.metrics;

    grid.innerHTML = `
      <div class="stat-card is-highlight">
        <div class="stat-card-header">
          <span class="stat-card-label">Total revenue</span>
          <span class="stat-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </span>
        </div>
        <div class="stat-card-value">${fmt(m.totalRevenue)}</div>
        <span class="stat-card-trend is-positive">↑ ${m.ordersCount} order${m.ordersCount === 1 ? "" : "s"} processed</span>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Tickets sold</span>
          <span class="stat-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 1 0 0-4z"/>
            </svg>
          </span>
        </div>
        <div class="stat-card-value">${m.ticketsSold.toLocaleString()}</div>
        <span class="stat-card-trend">Across ${state.events.length} event${state.events.length === 1 ? "" : "s"}</span>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Sell-through</span>
          <span class="stat-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3v18h18"/>
              <path d="m19 9-5 5-4-4-3 3"/>
            </svg>
          </span>
        </div>
        <div class="stat-card-value">${m.sellThrough}%</div>
        <span class="stat-card-trend">Capacity utilisation</span>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Estimated profit</span>
          <span class="stat-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </span>
        </div>
        <div class="stat-card-value">${fmt(m.estimatedProfit)}</div>
        <span class="stat-card-trend is-positive">After fees &amp; expenses</span>
      </div>
    `;
  }

  /* ============================================================
     8. RENDER — CHART
     ============================================================ */

  function renderChart() {
    const area = document.getElementById("chartArea");
    if (!area || !state.chartData.length) return;

    area.innerHTML = state.chartData.map(b => `
      <div class="chart-bar-wrap" title="${fmt(b.revenue)} on ${formatShortDate(b.date.toISOString())}">
        <div class="chart-bar-stack">
          <div class="chart-bar" style="height: ${b.heightPercent}%;"></div>
        </div>
        <span class="chart-label">${b.label}</span>
      </div>
    `).join("");

    // Update chart subtitle
    const sub = document.getElementById("chartSubtitle");
    if (sub) {
      const total = state.chartData.reduce((s, b) => s + b.revenue, 0);
      sub.textContent = `${fmtCompact(total)} over the last ${state.chartData.length} days`;
    }
  }

  /* ============================================================
     9. RENDER — EVENTS TABLE
     ============================================================ */

  function renderEventsTable() {
    const tbody = document.getElementById("eventsTableBody");
    if (!tbody) return;

    if (state.events.length === 0) {
      const wrap = tbody.closest(".data-card");
      if (wrap) {
        wrap.innerHTML = `
          <div class="curator-empty">
            <div class="curator-empty-icon" aria-hidden="true">🎪</div>
            <h3>No events yet</h3>
            <p>Create your first event to start selling tickets.</p>
            <a href="create-event.html" class="btn btn-primary">Create event</a>
          </div>
        `;
      }
      return;
    }

    // Sort: live first, then by revenue
    const sorted = state.events.slice().sort((a, b) => {
      const aAv = global.Data.getEventAvailability(a.id);
      const bAv = global.Data.getEventAvailability(b.id);
      const aSoldOut = aAv && aAv.isSoldOut;
      const bSoldOut = bAv && bAv.isSoldOut;
      if (aSoldOut !== bSoldOut) return aSoldOut ? 1 : -1;
      return 0;
    }).slice(0, 5);

    tbody.innerHTML = sorted.map(event => {
      const venue = global.Data.getVenue(event.venueId);
      const venueName = venue ? venue.name : "";
      const availability = global.Data.getEventAvailability(event.id);
      const percentage = availability ? availability.percentage : 0;
      const isSoldOut = availability && availability.isSoldOut;

      // Revenue for this event from orders
      const eventRevenue = state.orders
        .filter(o => o.eventId === event.id)
        .reduce((s, o) => s + (Number(o.total) || 0), 0);

      // If no real orders, derive estimated revenue from tier sales
      const estimatedRevenue = eventRevenue > 0
        ? eventRevenue
        : event.ticketTiers.reduce((sum, t) => {
            const sold = (t.capacity - t.available) || 0;
            return sum + sold * t.price;
          }, 0);

      const statusPill = isSoldOut
        ? `<span class="status-pill is-sold-out">Sold out</span>`
        : `<span class="status-pill is-live">Live</span>`;

      return `
        <tr>
          <td>
            <div class="data-event-cell">
              <div class="data-event-thumb">
                <img src="${escapeHTML(event.image)}" alt="" loading="lazy" onerror="this.style.display='none';">
              </div>
              <div class="data-event-info">
                <div class="data-event-title">${escapeHTML(event.title)}</div>
                <div class="data-event-meta">${escapeHTML(formatShortDate(event.date))} · ${escapeHTML(venueName)}</div>
              </div>
            </div>
          </td>
          <td>${statusPill}</td>
          <td>
            <div class="mini-progress">
              <div class="mini-progress-track">
                <div class="mini-progress-fill" style="width: ${percentage}%;"></div>
              </div>
              <span class="mini-progress-value">${percentage}%</span>
            </div>
          </td>
          <td class="is-right">${fmt(estimatedRevenue)}</td>
          <td class="is-right">
            <a class="table-action-btn" href="event-overview.html?id=${encodeURIComponent(event.id)}" aria-label="View event">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </a>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ============================================================
     10. RENDER — PAYOUT WIDGET
     ============================================================ */

  function renderPayout() {
    const amountEl = document.getElementById("payoutAmount");
    const metaEl = document.getElementById("payoutMeta");
    const btn = document.getElementById("payoutBtn");

    if (!amountEl || !state.metrics) return;

    const payout = state.metrics.estimatedProfit > 0
      ? state.metrics.estimatedProfit
      : state.metrics.totalRevenue;

    amountEl.textContent = fmt(payout);
    if (metaEl) {
      metaEl.textContent = "Releases in 4 days · Standard schedule";
    }

    if (btn) {
      btn.addEventListener("click", () => {
        track("curator_early_payout_click", { amount: payout });
        showToast("Early payout requested (demo).");
      });
    }
  }

  /* ============================================================
     11. RENDER — ACTIVITY FEED
     ============================================================ */

  function renderActivity() {
    const feed = document.getElementById("activityFeed");
    if (!feed) return;

    if (state.activities.length === 0) {
      feed.innerHTML = `<li class="activity-item"><p class="activity-text">No activity yet.</p></li>`;
      return;
    }

    feed.innerHTML = state.activities.map(a => `
      <li class="activity-item">
        <span class="activity-icon ${a.iconClass || ""}" aria-hidden="true">${a.icon}</span>
        <div class="activity-content">
          <p class="activity-text">${a.text}</p>
          <span class="activity-time">${escapeHTML(relativeTime(a.ts))}</span>
        </div>
      </li>
    `).join("");
  }

  /* ============================================================
     12. RENDER — UPCOMING EVENTS
     ============================================================ */

  function renderUpcoming() {
    const tbody = document.getElementById("upcomingTableBody");
    if (!tbody) return;

    const now = Date.now();
    const upcoming = state.events
      .filter(e => new Date(e.date).getTime() >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, CONFIG.upcomingLimit);

    if (upcoming.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--color-text-muted);">No upcoming events</td></tr>`;
      return;
    }

    tbody.innerHTML = upcoming.map(e => {
      const days = Math.max(0, Math.ceil((new Date(e.date).getTime() - now) / (1000 * 60 * 60 * 24)));
      const daysText = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      return `
        <tr>
          <td>
            <a href="event-overview.html?id=${encodeURIComponent(e.id)}" style="color:inherit;">
              ${escapeHTML(e.title)}
            </a>
          </td>
          <td class="is-right">${escapeHTML(daysText)}</td>
        </tr>
      `;
    }).join("");
  }

  /* ============================================================
     13. RENDER — CHART RANGE CONTROLS
     ============================================================ */

  function wireChartControls() {
    const buttons = document.querySelectorAll(".chart-range-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");

        const range = parseInt(btn.textContent, 10);
        if (!isNaN(range)) {
          CONFIG.chartDays = range;
          computeChartData();
          renderChart();
          track("curator_chart_range", { days: range });
        }
      });
    });
  }

  /* ============================================================
     14. TOAST
     ============================================================ */

  function showToast(message) {
    const existing = document.querySelector(".curator-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "curator-toast";
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
     15. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    log("Initializing curator dashboard");

    if (!global.Data) {
      log("Data layer missing");
      return;
    }

    computeMetrics();
    computeChartData();
    computeActivity();

    renderStats();
    renderChart();
    renderEventsTable();
    renderPayout();
    renderActivity();
    renderUpcoming();
    wireChartControls();

    track("page_view", { page: "curator_dashboard" });

    state.initialized = true;
    log("Curator dashboard ready");
  }

  /* ============================================================
     16. PUBLIC API
     ============================================================ */

  const Curator = {
    init,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.Curator = Curator;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Curator;
  }

})(typeof window !== "undefined" ? window : this);
