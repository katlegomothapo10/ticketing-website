/* ============================================================
   TICKETING APP — NAVIGATION
   File: navigation.js
   Purpose: Sticky header, mobile drawer, active links
   Exposes: window.Nav
   Depends on: analytics.js (optional — degrades gracefully)
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    // Selectors
    headerSelector: ".site-header",
    toggleSelector: "#navToggle",
    drawerSelector: "#mobileDrawer",
    overlaySelector: "#navOverlay",
    closeSelector: "#navClose",
    drawerLinkSelector: ".mobile-nav-link, .mobile-actions a",

    // Behavior
    scrollThreshold: 10,       // px scrolled before adding "is-scrolled"
    closeOnLinkClick: true,    // auto-close drawer on link tap
    closeOnEscape: true,       // Esc closes drawer
    closeOnOverlayClick: true, // click backdrop closes drawer
    lockBodyScroll: true,      // prevent background scroll when open
    activeLinkClass: "is-active",

    // Debug
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    header: null,
    toggle: null,
    drawer: null,
    overlay: null,
    closeBtn: null,
    isOpen: false,
    initialized: false,
    scrollListener: null,
    keydownListener: null,
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) {
      console.log("[Nav]", ...arguments);
    }
  }

  function warn() {
    if (CONFIG.debug) {
      console.warn("[Nav]", ...arguments);
    }
  }

  /**
   * Fire an analytics event if Analytics is loaded.
   */
  function trackEvent(name, props) {
    if (global.Analytics && typeof global.Analytics.track === "function") {
      try {
        global.Analytics.track(name, props);
      } catch (err) {
        warn("Analytics failed:", err);
      }
    }
  }

  /**
   * Get the current page filename from URL path.
   * Used for active-link detection.
   */
  function getCurrentPage() {
    const path = window.location.pathname || "/";
    const parts = path.split("/");
    let file = parts[parts.length - 1] || "index.html";
    if (file === "" || file === "/") file = "index.html";
    return file;
  }

  /* ============================================================
     4. DOM DISCOVERY
     ============================================================ */

  function cacheElements() {
    state.header = document.querySelector(CONFIG.headerSelector);
    state.toggle = document.querySelector(CONFIG.toggleSelector);
    state.drawer = document.querySelector(CONFIG.drawerSelector);
    state.overlay = document.querySelector(CONFIG.overlaySelector);
    state.closeBtn = document.querySelector(CONFIG.closeSelector);

    log("Elements cached:", {
      header: !!state.header,
      toggle: !!state.toggle,
      drawer: !!state.drawer,
      overlay: !!state.overlay,
      closeBtn: !!state.closeBtn,
    });
  }

  /* ============================================================
     5. STICKY HEADER
     ============================================================ */

  function attachScrollBehavior() {
    if (!state.header) return;

    // Remove any previously attached listener
    if (state.scrollListener) {
      window.removeEventListener("scroll", state.scrollListener);
    }

    let ticking = false;

    state.scrollListener = function () {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const y = window.scrollY || document.documentElement.scrollTop;
        state.header.classList.toggle(
          "is-scrolled",
          y > CONFIG.scrollThreshold
        );
        ticking = false;
      });
    };

    window.addEventListener("scroll", state.scrollListener, { passive: true });

    // Set initial state
    state.scrollListener();
  }

  /* ============================================================
     6. DRAWER OPEN / CLOSE
     ============================================================ */

  function openDrawer(trigger) {
    if (!state.drawer || state.isOpen) return;

    state.isOpen = true;

    state.drawer.classList.add("is-open");
    if (state.overlay) state.overlay.classList.add("is-open");
    if (state.toggle) state.toggle.classList.add("is-open");
    if (state.toggle) state.toggle.setAttribute("aria-expanded", "true");

    if (CONFIG.lockBodyScroll) {
      document.body.classList.add("nav-open");
    }

    // Focus first link for accessibility
    const firstLink = state.drawer.querySelector("a, button");
    if (firstLink) {
      setTimeout(() => firstLink.focus(), 250);
    }

    trackEvent("nav_drawer_open", { trigger: trigger || "toggle" });
    log("Drawer opened");
  }

  function closeDrawer(reason) {
    if (!state.drawer || !state.isOpen) return;

    state.isOpen = false;

    state.drawer.classList.remove("is-open");
    if (state.overlay) state.overlay.classList.remove("is-open");
    if (state.toggle) state.toggle.classList.remove("is-open");
    if (state.toggle) state.toggle.setAttribute("aria-expanded", "false");

    if (CONFIG.lockBodyScroll) {
      document.body.classList.remove("nav-open");
    }

    // Return focus to toggle
    if (state.toggle) {
      state.toggle.focus();
    }

    trackEvent("nav_drawer_close", { reason: reason || "user" });
    log("Drawer closed:", reason);
  }

  function toggleDrawer() {
    if (state.isOpen) {
      closeDrawer("toggle");
    } else {
      openDrawer("toggle");
    }
  }

  /* ============================================================
     7. EVENT WIRING
     ============================================================ */

  function attachDrawerEvents() {
    // Toggle button
    if (state.toggle) {
      state.toggle.addEventListener("click", (e) => {
        e.preventDefault();
        toggleDrawer();
      });
    }

    // Close button
    if (state.closeBtn) {
      state.closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        closeDrawer("close_button");
      });
    }

    // Overlay click
    if (CONFIG.closeOnOverlayClick && state.overlay) {
      state.overlay.addEventListener("click", () => {
        closeDrawer("overlay_click");
      });
    }

    // Link clicks inside drawer → auto close
    if (CONFIG.closeOnLinkClick && state.drawer) {
      const links = state.drawer.querySelectorAll(CONFIG.drawerLinkSelector);
      links.forEach(link => {
        link.addEventListener("click", () => {
          closeDrawer("link_click");
        });
      });
    }
  }

  function attachKeyboardEvents() {
    if (!CONFIG.closeOnEscape) return;

    if (state.keydownListener) {
      document.removeEventListener("keydown", state.keydownListener);
    }

    state.keydownListener = function (e) {
      if (e.key === "Escape" && state.isOpen) {
        closeDrawer("escape");
      }
    };

    document.addEventListener("keydown", state.keydownListener);
  }

  /* ============================================================
     8. ACTIVE LINK DETECTION
     ============================================================ */

  function markActiveLinks() {
    const current = getCurrentPage();

    // Desktop nav links
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove(CONFIG.activeLinkClass);
      const href = link.getAttribute("href") || "";
      if (matchesPage(href, current)) {
        link.classList.add(CONFIG.activeLinkClass);
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    // Mobile drawer links
    document.querySelectorAll(".mobile-nav-link").forEach(link => {
      link.classList.remove(CONFIG.activeLinkClass);
      const href = link.getAttribute("href") || "";
      if (matchesPage(href, current)) {
        link.classList.add(CONFIG.activeLinkClass);
      }
    });
  }

  function matchesPage(href, currentPage) {
    if (!href) return false;
    if (href === "#" || href === "" || href.startsWith("javascript:")) return false;

    // Strip query/hash
    const clean = href.split("#")[0].split("?")[0];
    if (clean === "" || clean === "/") {
      return currentPage === "index.html";
    }

    // Get the last segment
    const parts = clean.split("/");
    const last = parts[parts.length - 1];

    // Match if last segment equals current page
    if (last === currentPage) return true;

    // Special case: index.html root
    if (currentPage === "index.html" && last === "") return true;

    return false;
  }

  /* ============================================================
     9. SEARCH BUTTON (optional hook)
     ============================================================ */

  function attachSearchButton() {
    const searchBtn = document.querySelector(".nav-search");
    if (!searchBtn) return;

    searchBtn.addEventListener("click", () => {
      trackEvent("nav_search_click");
      // Optional: open a search overlay here if you build one
    });
  }

  /* ============================================================
     10. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    cacheElements();

    if (!state.header) {
      // Header not present on this page — no problem, silently skip
      log("No header found on this page");
      return;
    }

    attachScrollBehavior();
    attachDrawerEvents();
    attachKeyboardEvents();
    attachSearchButton();
    markActiveLinks();

    state.initialized = true;
    log("Initialized");
    trackEvent("nav_ready");
  }

  /* ============================================================
     11. PUBLIC API
     ============================================================ */

  const Nav = {
    init,
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    isOpen: () => state.isOpen,
    markActiveLinks,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  // Expose globally
  global.Nav = Nav;

  // Auto-init
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }

    // Re-run active-link detection if the page is restored from cache
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        markActiveLinks();
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Nav;
  }

})(typeof window !== "undefined" ? window : this);
