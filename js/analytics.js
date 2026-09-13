/* ============================================================
   TICKETING APP — ANALYTICS
   File: analytics.js
   Purpose: Track user actions, funnels, and revenue
   Exposes: window.Analytics
   Depends on: nothing (uses localStorage)
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    // Storage keys
    storageKey: "ticketing_app:analytics",
    sessionKey: "ticketing_app:session",

    // Event log cap — prevents unbounded growth
    maxEvents: 500,

    // Auto-tracking flags
    autoTrackPageViews: true,
    autoTrackClicks: true,
    autoTrackScrollDepth: true,
    autoTrackFormSubmits: true,

    // Scroll depth milestones (percentage)
    scrollMilestones: [25, 50, 75, 100],

    // Console debug
    debug: false,

    // Enable dispatching to external services
    dispatchExternal: false,
  };

  /* ============================================================
     2. SESSION
     ============================================================ */

  function getSessionId() {
    try {
      let sid = sessionStorage.getItem(CONFIG.sessionKey);
      if (!sid) {
        sid = generateId("sess");
        sessionStorage.setItem(CONFIG.sessionKey, sid);
      }
      return sid;
    } catch (err) {
      return "anonymous";
    }
  }

  function generateId(prefix) {
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return `${prefix || "id"}_${time}${rand}`;
  }

  /* ============================================================
     3. CORE TRACKING
     ============================================================ */

  /**
   * Track an analytics event.
   * @param {string} eventName - Snake_case name, e.g. "event_view"
   * @param {object} [props] - Additional properties
   */
  function track(eventName, props) {
    if (!eventName || typeof eventName !== "string") {
      warn("track() called without a valid event name");
      return;
    }

    const event = buildEvent(eventName, props);

    if (CONFIG.debug) {
      console.log("[Analytics]", eventName, event);
    }

    // Persist
    persistEvent(event);

    // Dispatch to external services if enabled
    if (CONFIG.dispatchExternal) {
      dispatchExternal(event);
    }
  }

  /**
   * Build the full event payload.
   */
  function buildEvent(name, props) {
    return {
      id: generateId("evt"),
      name: name,
      props: props || {},
      ts: Date.now(),
      iso: new Date().toISOString(),
      session: getSessionId(),
      page: getPagePath(),
      referrer: getReferrer(),
      url: getURL(),
      ua: navigator.userAgent || "",
      vw: window.innerWidth || 0,
      vh: window.innerHeight || 0,
    };
  }

  /* ============================================================
     4. PERSISTENCE
     ============================================================ */

  function persistEvent(event) {
    try {
      const log = readLog();
      log.push(event);

      // Cap log size
      if (log.length > CONFIG.maxEvents) {
        log.splice(0, log.length - CONFIG.maxEvents);
      }

      localStorage.setItem(CONFIG.storageKey, JSON.stringify(log));
    } catch (err) {
      warn("Failed to persist event:", err);
    }
  }

  function readLog() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function getLog() {
    return readLog();
  }

  function clearLog() {
    try {
      localStorage.removeItem(CONFIG.storageKey);
    } catch (err) {
      warn("Failed to clear log:", err);
    }
  }

  /* ============================================================
     5. HELPERS
     ============================================================ */

  function getPagePath() {
    return window.location.pathname || "/";
  }

  function getURL() {
    return window.location.href || "";
  }

  function getReferrer() {
    return document.referrer || "direct";
  }

  /* ============================================================
     6. NAMED EVENTS — Convenience wrappers
     ============================================================ */

  // Page views
  function trackPageView(extra) {
    track("page_view", Object.assign({
      title: document.title || "",
    }, extra || {}));
  }

  // Event discovery
  function trackEventView(eventId, extra) {
    track("event_view", Object.assign({ eventId }, extra || {}));
  }

  function trackEventCardClick(eventId, extra) {
    track("event_card_click", Object.assign({ eventId }, extra || {}));
  }

  // Search & filters
  function trackSearch(query, resultsCount) {
    track("search", { query, resultsCount });
  }

  function trackFilter(filterName, value) {
    track("filter_apply", { filter: filterName, value });
  }

  // Ticket selection
  function trackTierSelect(eventId, tierId, price) {
    track("tier_select", { eventId, tierId, price });
  }

  function trackSeatSelect(eventId, seats) {
    track("seat_select", {
      eventId,
      count: (seats || []).length,
      seats: seats || [],
    });
  }

  function trackMapOpen(eventId) {
    track("map_open", { eventId });
  }

  function trackListOpen(eventId) {
    track("list_open", { eventId });
  }

  // Cart
  function trackAddToCart(item) {
    track("add_to_cart", {
      eventId: item.eventId,
      tierId: item.tierId,
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice,
      value: (item.unitPrice || 0) * (item.quantity || 1),
    });
  }

  function trackRemoveFromCart(item) {
    track("remove_from_cart", {
      eventId: item.eventId,
      tierId: item.tierId,
      quantity: item.quantity || 1,
    });
  }

  function trackViewCart(itemCount, total) {
    track("view_cart", { itemCount, total });
  }

  // Checkout
  function trackBeginCheckout(itemCount, total) {
    track("begin_checkout", { itemCount, total });
  }

  function trackAddPaymentInfo(gateway) {
    track("add_payment_info", { gateway });
  }

  function trackPurchase(order) {
    track("purchase", {
      reference: order.reference,
      total: order.total,
      itemCount: (order.items || []).length,
      gateway: order.gateway,
      eventId: order.eventId,
    });
  }

  function trackRefund(reference, amount) {
    track("refund", { reference, amount });
  }

  // User
  function trackLogin(method) {
    track("login", { method });
  }

  function trackSignup(method) {
    track("signup", { method });
  }

  function trackLogout() {
    track("logout");
  }

  // Curator
  function trackCreateEvent(eventId) {
    track("curator_create_event", { eventId });
  }

  function trackPublishEvent(eventId) {
    track("curator_publish_event", { eventId });
  }

  function trackVenueStudioSave(eventId, objectCount) {
    track("curator_venue_save", { eventId, objectCount });
  }

  function trackPayoutRequest(amount, schedule) {
    track("curator_payout_request", { amount, schedule });
  }

  // Errors
  function trackError(message, context) {
    track("error", {
      message: String(message || ""),
      context: context || {},
    });
  }

  /* ============================================================
     7. AUTO-TRACKERS
     ============================================================ */

  function autoTrackPageView() {
    if (!CONFIG.autoTrackPageViews) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", trackPageView);
    } else {
      trackPageView();
    }
  }

  function autoTrackClicks() {
    if (!CONFIG.autoTrackClicks) return;

    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-analytics], a, button");
      if (!target) return;

      // Prefer explicit data-analytics attribute
      const name = target.dataset.analytics;
      if (name) {
        track(name, {
          text: (target.textContent || "").trim().slice(0, 80),
          href: target.href || "",
          tag: target.tagName.toLowerCase(),
        });
        return;
      }

      // Fallback: track every link & button click with a generic name
      // (disabled by default to avoid noise — enable by setting
      //  data-analytics on elements you care about)
    }, true);
  }

  function autoTrackScrollDepth() {
    if (!CONFIG.autoTrackScrollDepth) return;

    const tracked = new Set();

    function onScroll() {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const docHeight = doc.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const percentage = Math.round((scrollTop / docHeight) * 100);

      CONFIG.scrollMilestones.forEach(milestone => {
        if (percentage >= milestone && !tracked.has(milestone)) {
          tracked.add(milestone);
          track("scroll_depth", { percentage: milestone });
        }
      });
    }

    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
    }, { passive: true });
  }

  function autoTrackFormSubmits() {
    if (!CONFIG.autoTrackFormSubmits) return;

    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (!form || form.tagName !== "FORM") return;

      const name = form.dataset.analytics || "form_submit";
      track(name, {
        id: form.id || "",
        action: form.action || "",
      });
    }, true);
  }

  /* ============================================================
     8. FUNNEL ANALYSIS
     ============================================================ */

  /**
   * Compute the conversion funnel:
   *   page_view → event_view → tier_select → add_to_cart → begin_checkout → purchase
   * @param {string} [eventId] - Optional filter
   * @returns {object} Funnel counts and rates
   */
  function getFunnel(eventId) {
    const log = getLog();
    const filter = eventId ? (e) => e.props && e.props.eventId === eventId : () => true;

    const counts = {
      page_view: 0,
      event_view: 0,
      tier_select: 0,
      add_to_cart: 0,
      begin_checkout: 0,
      purchase: 0,
    };

    log.forEach(evt => {
      if (!counts.hasOwnProperty(evt.name)) return;
      if (!filter(evt)) return;
      counts[evt.name]++;
    });

    const stages = Object.keys(counts);
    const funnel = stages.map((stage, i) => {
      const count = counts[stage];
      const prev = i === 0 ? count : counts[stages[i - 1]];
      return {
        stage,
        count,
        conversionFromPrev: prev > 0 ? +(count / prev * 100).toFixed(1) : 0,
      };
    });

    const overall = counts.page_view > 0
      ? +(counts.purchase / counts.page_view * 100).toFixed(2)
      : 0;

    return { counts, funnel, overallConversion: overall };
  }

  /* ============================================================
     9. REVENUE ANALYTICS
     ============================================================ */

  /**
   * Sum revenue from purchase events.
   * @returns {object}
   */
  function getRevenueReport() {
    const log = getLog();
    const purchases = log.filter(e => e.name === "purchase");
    const refunds = log.filter(e => e.name === "refund");

    const gross = purchases.reduce(
      (sum, e) => sum + (Number(e.props.total) || 0),
      0
    );

    const refunded = refunds.reduce(
      (sum, e) => sum + (Number(e.props.amount) || 0),
      0
    );

    const net = gross - refunded;
    const count = purchases.length;
    const avgOrder = count > 0 ? gross / count : 0;

    return {
      gross,
      refunded,
      net,
      count,
      averageOrderValue: +avgOrder.toFixed(2),
    };
  }

  /* ============================================================
     10. AGGREGATES
     ============================================================ */

  /**
   * Get top events by a given metric.
   * @param {string} metric - "views" | "clicks" | "adds" | "purchases"
   * @param {number} [limit]
   * @returns {Array}
   */
  function getTopEvents(metric, limit) {
    const log = getLog();
    const map = {};

    const sourceEvent = {
      views: "event_view",
      clicks: "event_card_click",
      adds: "add_to_cart",
      purchases: "purchase",
    }[metric];

    if (!sourceEvent) return [];

    log.forEach(evt => {
      if (evt.name !== sourceEvent) return;
      const id = evt.props && evt.props.eventId;
      if (!id) return;
      map[id] = (map[id] || 0) + 1;
    });

    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit || 10)
      .map(([eventId, count]) => ({ eventId, count }));
  }

  /**
   * Get top search queries.
   */
  function getTopSearches(limit) {
    const log = getLog();
    const map = {};
    log.forEach(evt => {
      if (evt.name !== "search") return;
      const q = (evt.props && evt.props.query || "").trim().toLowerCase();
      if (!q) return;
      map[q] = (map[q] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit || 10)
      .map(([query, count]) => ({ query, count }));
  }

  /**
   * Get event counts grouped by event name.
   */
  function getEventCounts() {
    const log = getLog();
    const map = {};
    log.forEach(evt => {
      map[evt.name] = (map[evt.name] || 0) + 1;
    });
    return map;
  }

  /**
   * Get a summary snapshot.
   */
  function getSummary() {
    const log = getLog();
    const revenue = getRevenueReport();
    const eventCounts = getEventCounts();
    return {
      totalEvents: log.length,
      sessionId: getSessionId(),
      pageViews: eventCounts.page_view || 0,
      eventViews: eventCounts.event_view || 0,
      searches: eventCounts.search || 0,
      addToCarts: eventCounts.add_to_cart || 0,
      checkouts: eventCounts.begin_checkout || 0,
      purchases: eventCounts.purchase || 0,
      revenue,
      topEvents: getTopEvents("views", 5),
      topSearches: getTopSearches(5),
    };
  }

  /* ============================================================
     11. DEBUG
     ============================================================ */

  function enableDebug() {
    CONFIG.debug = true;
    console.log("[Analytics] Debug enabled");
  }

  function disableDebug() {
    CONFIG.debug = false;
  }

  function dump() {
    const log = getLog();
    console.group("[Analytics] Full event log");
    console.table(log.map(e => ({
      name: e.name,
      ts: new Date(e.ts).toLocaleTimeString(),
      page: e.page,
      props: JSON.stringify(e.props || {}).slice(0, 60),
    })));
    console.groupEnd();
    return log;
  }

  function dumpSummary() {
    const s = getSummary();
    console.group("[Analytics] Summary");
    console.table(s);
    console.groupEnd();
    return s;
  }

  function warn(msg, err) {
    if (CONFIG.debug) console.warn("[Analytics]", msg, err || "");
  }

  /* ============================================================
     12. EXTERNAL DISPATCH (stub)
     ============================================================ */

  function dispatchExternal(event) {
    // Example wiring for GA4, Mixpanel, etc.
    // Uncomment when ready:
    //
    // if (window.gtag) {
    //   window.gtag("event", event.name, event.props);
    // }
    // if (window.mixpanel) {
    //   window.mixpanel.track(event.name, event.props);
    // }
    //
    void event;
  }

  /* ============================================================
     13. INIT
     ============================================================ */

  function init() {
    autoTrackPageView();
    autoTrackClicks();
    autoTrackScrollDepth();
    autoTrackFormSubmits();
  }

  /* ============================================================
     14. PUBLIC API
     ============================================================ */

  const Analytics = {
    // Core
    track,
    init,

    // Convenience
    pageView: trackPageView,
    eventView: trackEventView,
    eventCardClick: trackEventCardClick,
    search: trackSearch,
    filter: trackFilter,
    tierSelect: trackTierSelect,
    seatSelect: trackSeatSelect,
    mapOpen: trackMapOpen,
    listOpen: trackListOpen,
    addToCart: trackAddToCart,
    removeFromCart: trackRemoveFromCart,
    viewCart: trackViewCart,
    beginCheckout: trackBeginCheckout,
    addPaymentInfo: trackAddPaymentInfo,
    purchase: trackPurchase,
    refund: trackRefund,
    login: trackLogin,
    signup: trackSignup,
    logout: trackLogout,
    error: trackError,

    // Curator
    createEvent: trackCreateEvent,
    publishEvent: trackPublishEvent,
    venueSave: trackVenueStudioSave,
    payoutRequest: trackPayoutRequest,

    // Reports
    getLog,
    clearLog,
    getFunnel,
    getRevenueReport,
    getTopEvents,
    getTopSearches,
    getEventCounts,
    getSummary,

    // Debug
    enableDebug,
    disableDebug,
    dump,
    dumpSummary,

    // Config
    config: CONFIG,
    generateId,
  };

  // Expose globally
  global.Analytics = Analytics;

  // Auto-init as soon as the script loads
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Analytics;
  }

})(typeof window !== "undefined" ? window : this);
