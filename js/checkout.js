/* ============================================================
   TICKETING APP — CHECKOUT CONTROLLER
   File: checkout.js
   Purpose: Cart summary, fee breakdown, payment, purchase flow
   Exposes: window.Checkout
   Depends on: data.js, currency.js, fees.js, analytics.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CONFIGURATION
     ============================================================ */

  const CONFIG = {
    holdSeconds: 600, // 10 minutes
    promoCodes: {
      LAUNCH10: { type: "percent", value: 10, label: "10% launch discount" },
      VIP20: { type: "percent", value: 20, label: "20% VIP discount" },
      WELCOME50: { type: "flat", value: 50, label: "R50 off" },
    },
    debug: false,
  };

  /* ============================================================
     2. STATE
     ============================================================ */

  const state = {
    initialized: false,
    cart: [],
    groupedItems: [],
    event: null,
    totals: null,
    promo: null,
    gateway: "payfast",
    holdInterval: null,
    holdSeconds: CONFIG.holdSeconds,
    dom: {},
    submitting: false,
  };

  /* ============================================================
     3. HELPERS
     ============================================================ */

  function log() {
    if (CONFIG.debug) console.log("[Checkout]", ...arguments);
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
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  }

  /* ============================================================
     4. LOAD CART
     ============================================================ */

  function loadCart() {
    if (!global.Data) return;

    const raw = global.Data.getCart();
    if (!raw || raw.length === 0) {
      state.cart = [];
      return;
    }

    state.cart = raw;

    // Load the event (all items should be for the same event in this demo)
    const firstItem = state.cart[0];
    state.event = global.Data.getEvent(firstItem.eventId);

    // Group items by tierId
    state.groupedItems = groupByTier(state.cart);
  }

  function groupByTier(cart) {
    const groups = {};
    cart.forEach(item => {
      const key = item.tierId;
      if (!groups[key]) {
        const tier = state.event
          ? state.event.ticketTiers.find(t => t.id === item.tierId)
          : null;
        groups[key] = {
          tierId: item.tierId,
          tierName: tier ? tier.name : "Ticket",
          price: item.unitPrice,
          items: [],
          quantity: 0,
          subtotal: 0,
          seats: [],
        };
      }
      groups[key].items.push(item);
      groups[key].quantity += item.quantity || 1;
      groups[key].subtotal += (item.unitPrice || 0) * (item.quantity || 1);
      if (item.selectedSeats) {
        groups[key].seats.push(...item.selectedSeats);
      }
    });
    return Object.values(groups);
  }

  /* ============================================================
     5. TOTALS CALCULATION
     ============================================================ */

  function calculateTotals() {
    if (!global.Fees) {
      // Fallback: simple sum
      const subtotal = state.cart.reduce(
        (sum, item) => sum + item.unitPrice * (item.quantity || 1),
        0
      );
      state.totals = {
        subtotal,
        vat: 0,
        userServiceFee: 0,
        buyerTotal: subtotal,
        discount: 0,
        finalTotal: subtotal,
      };
      return;
    }

    // Use Fees engine — calculate one order per tier then sum
    const perTier = state.groupedItems.map(group => {
      const qty = group.quantity;
      const unitPrice = group.price;

      return global.Fees.calculateOrder({
        unitPrice,
        quantity: qty,
        gateway: state.gateway,
      });
    });

    const subtotal = round(perTier.reduce((s, r) => s + r.subtotal, 0), 2);
    const vat = round(perTier.reduce((s, r) => s + r.vat, 0), 2);
    const userServiceFee = round(perTier.reduce((s, r) => s + r.userServiceFee, 0), 2);
    const buyerTotal = round(subtotal + vat + userServiceFee, 2);

    // Promo
    let discount = 0;
    if (state.promo) {
      if (state.promo.type === "percent") {
        discount = round(buyerTotal * (state.promo.value / 100), 2);
      } else if (state.promo.type === "flat") {
        discount = Math.min(state.promo.value, buyerTotal);
      }
    }

    const finalTotal = round(buyerTotal - discount, 2);

    state.totals = {
      subtotal,
      vat,
      userServiceFee,
      buyerTotal,
      discount,
      finalTotal,
      perTier,
    };
  }

  function round(value, decimals) {
    const f = Math.pow(10, decimals || 2);
    return Math.round(value * f) / f;
  }

  /* ============================================================
     6. RENDER — ORDER SUMMARY
     ============================================================ */

  function renderOrderSummary() {
    const body = state.dom.orderBody;
    const header = state.dom.orderHeader;
    const eventBlock = state.dom.orderEvent;
    const footer = state.dom.orderFooter;
    const badge = state.dom.orderBadge;

    if (!body) return;

    if (state.cart.length === 0) {
      renderEmptyCart();
      return;
    }

    // Header badge
    if (badge) {
      const totalTables = state.cart.length;
      badge.textContent = `${totalTables} table${totalTables === 1 ? "" : "s"}`;
    }

    // Event block
    if (eventBlock && state.event) {
      const venue = global.Data ? global.Data.getVenue(state.event.venueId) : null;
      const venueName = venue ? venue.name : "";

      eventBlock.innerHTML = `
        <div class="order-summary-event-name">${escapeHTML(state.event.title)}</div>
        <div class="order-summary-event-meta">
          <span>${escapeHTML(formatLongDate(state.event.date))}</span>
          ${venueName ? `<span class="divider-dot"></span>` : ""}
          ${venueName ? `<span>${escapeHTML(venueName)}</span>` : ""}
        </div>
      `;
    }

    // Items
    body.innerHTML = `
      <div class="order-items">
        ${state.groupedItems.map(group => renderOrderItem(group)).join("")}
      </div>
    `;

    // Footer fees
    if (footer && state.totals) {
      footer.innerHTML = buildFeeBreakdown();
      wirePromoForm();
    }
  }

  function renderOrderItem(group) {
    return `
      <div class="order-item">
        <div class="order-item-header">
          <div>
            <p class="order-item-name">${escapeHTML(group.tierName)}</p>
            <p class="order-item-qty">${group.quantity} table${group.quantity === 1 ? "" : "s"}</p>
          </div>
          <div class="order-item-price">${fmt(group.subtotal)}</div>
        </div>
        ${group.seats.length > 0 ? `
          <div class="order-item-seats">
            ${group.seats.map(seat => `
              <span class="order-item-seat">${escapeHTML(seat)}</span>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function buildFeeBreakdown() {
    const t = state.totals;

    return `
      <form class="promo-form" id="promoForm" onsubmit="event.preventDefault();">
        <input
          type="text"
          id="promoInput"
          placeholder="Promo code"
          autocomplete="off"
          value="${state.promo ? "" : ""}"
        >
        <button type="submit" id="promoBtn">Apply</button>
      </form>

      ${state.promo ? `
        <div class="promo-applied">
          <span>${escapeHTML(state.promo.label)}</span>
          <button type="button" id="removePromoBtn" aria-label="Remove promo">✕</button>
        </div>
      ` : ""}

      <div class="fee-row is-subtotal">
        <span>Subtotal</span>
        <span>${fmt(t.subtotal)}</span>
      </div>

      ${t.vat > 0 ? `
        <div class="fee-row">
          <span>VAT (15%)</span>
          <span>${fmt(t.vat)}</span>
        </div>
      ` : ""}

      ${t.userServiceFee > 0 ? `
        <div class="fee-row">
          <span>Service fee</span>
          <span>${fmt(t.userServiceFee)}</span>
        </div>
      ` : ""}

      ${t.discount > 0 ? `
        <div class="fee-row is-discount">
          <span>Discount</span>
          <span>${fmt(t.discount)}</span>
        </div>
      ` : ""}

      <div class="fee-row is-total">
        <span>Total</span>
        <span>${fmt(t.finalTotal)}</span>
      </div>

      <button
        class="btn btn-primary"
        type="button"
        id="purchaseBtn"
      >
        Complete purchase
      </button>
    `;
  }

  /* ============================================================
     7. RENDER — EMPTY CART
     ============================================================ */

  function renderEmptyCart() {
    const main = document.querySelector("main") || document.querySelector(".checkout-page");
    if (!main) return;

    document.title = "Your cart is empty · Ticketing App";

    main.innerHTML = `
      <div class="container">
        <div class="checkout-empty">
          <div class="checkout-empty-icon" aria-hidden="true">🛒</div>
          <h2>Your cart is empty</h2>
          <p>
            You haven't selected any tickets yet. Browse events and pick your
            perfect table before checking out.
          </p>
          <a href="events.html" class="btn btn-primary">Browse events</a>
        </div>
      </div>
    `;

    track("checkout_empty");
  }

  /* ============================================================
     8. WIRE — PROMO
     ============================================================ */

  function wirePromoForm() {
    const form = document.getElementById("promoForm");
    const input = document.getElementById("promoInput");
    const btn = document.getElementById("promoBtn");
    const removeBtn = document.getElementById("removePromoBtn");

    if (form && input) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        applyPromo(input.value.trim());
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        state.promo = null;
        track("promo_remove");
        recalculate();
      });
    }

    // Remove promo when promo code changes → reset input
    if (input && state.promo) {
      input.value = "";
    }
  }

  function applyPromo(code) {
    if (!code) return;

    const upper = code.toUpperCase();
    const promo = CONFIG.promoCodes[upper];

    if (!promo) {
      showToast(`Invalid promo code: ${code}`);
      track("promo_invalid", { code });
      return;
    }

    state.promo = {
      code: upper,
      type: promo.type,
      value: promo.value,
      label: promo.label,
    };

    track("promo_applied", { code: upper, type: promo.type, value: promo.value });
    showToast(`Promo applied: ${promo.label}`);

    recalculate();
  }

  /* ============================================================
     9. WIRE — PAYMENT SELECTOR
     ============================================================ */

  function wirePaymentSelector() {
    const methods = document.querySelectorAll(".payment-method");
    const cardFields = document.querySelector(".card-fields");

    methods.forEach(method => {
      method.addEventListener("click", () => {
        const input = method.querySelector('input[type="radio"]');
        if (input) input.checked = true;

        methods.forEach(m => m.classList.toggle("is-selected", m === method));

        const gateway = input ? input.value : "payfast";
        state.gateway = gateway;

        // Show card fields only for card-based gateways
        const showsCardFields = ["payfast", "yoco", "stripe", "peach"].includes(gateway);
        if (cardFields) {
          cardFields.classList.toggle("is-visible", showsCardFields);
        }

        // Recalculate with new gateway (processing fee may differ)
        recalculate();

        track("add_payment_info", { gateway });
      });
    });
  }

  /* ============================================================
     10. WIRE — CARD INPUT FORMATTING
     ============================================================ */

  function wireCardInputs() {
    const numberInput = document.getElementById("cardNumber");
    const holderInput = document.getElementById("cardHolder");
    const expiryInput = document.getElementById("cardExpiry");
    const cvcInput = document.getElementById("cardCvc");

    const numberDisplay = document.getElementById("cardNumberDisplay");
    const holderDisplay = document.getElementById("cardHolderDisplay");
    const expiryDisplay = document.getElementById("cardExpiryDisplay");

    if (numberInput) {
      numberInput.addEventListener("input", (e) => {
        let v = e.target.value.replace(/\D/g, "").slice(0, 16);
        v = v.replace(/(.{4})/g, "$1 ").trim();
        e.target.value = v;
        if (numberDisplay) {
          numberDisplay.textContent = v || "•••• •••• •••• ••••";
        }
      });
    }

    if (holderInput) {
      holderInput.addEventListener("input", (e) => {
        if (holderDisplay) {
          holderDisplay.textContent = (e.target.value || "YOUR NAME").toUpperCase();
        }
      });
    }

    if (expiryInput) {
      expiryInput.addEventListener("input", (e) => {
        let v = e.target.value.replace(/\D/g, "").slice(0, 4);
        if (v.length >= 2) v = v.slice(0, 2) + "/" + v.slice(2);
        e.target.value = v;
        if (expiryDisplay) {
          expiryDisplay.textContent = v || "MM/YY";
        }
      });
    }

    if (cvcInput) {
      cvcInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
      });
    }
  }

  /* ============================================================
     11. FORM VALIDATION
     ============================================================ */

  function validateForm() {
    const fields = {
      firstName: document.getElementById("firstName"),
      lastName: document.getElementById("lastName"),
      email: document.getElementById("email"),
      cardNumber: document.getElementById("cardNumber"),
      cardHolder: document.getElementById("cardHolder"),
      cardExpiry: document.getElementById("cardExpiry"),
      cardCvc: document.getElementById("cardCvc"),
    };

    let valid = true;

    function setError(el, message) {
      if (!el) return;
      el.classList.add("has-error");
      const group = el.closest(".form-group");
      if (group) group.classList.add("has-error");
      const errorEl = group && group.querySelector(".form-error-text");
      if (errorEl && message) errorEl.textContent = message;
    }

    function clearError(el) {
      if (!el) return;
      el.classList.remove("has-error");
      const group = el.closest(".form-group");
      if (group) group.classList.remove("has-error");
    }

    // Clear all first
    Object.values(fields).forEach(f => f && clearError(f));

    // Name
    if (!fields.firstName?.value.trim()) {
      setError(fields.firstName, "First name is required");
      valid = false;
    }
    if (!fields.lastName?.value.trim()) {
      setError(fields.lastName, "Last name is required");
      valid = false;
    }

    // Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!fields.email?.value.trim()) {
      setError(fields.email, "Email is required");
      valid = false;
    } else if (!emailRegex.test(fields.email.value.trim())) {
      setError(fields.email, "Please enter a valid email address");
      valid = false;
    }

    // Card fields (only if card gateway)
    if (["payfast", "yoco", "stripe", "peach"].includes(state.gateway)) {
      const num = (fields.cardNumber?.value || "").replace(/\s/g, "");
      if (num.length < 15) {
        setError(fields.cardNumber, "Please enter a valid card number");
        valid = false;
      }
      if (!fields.cardHolder?.value.trim()) {
        setError(fields.cardHolder, "Card holder name is required");
        valid = false;
      }
      const expiry = fields.cardExpiry?.value || "";
      if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        setError(fields.cardExpiry, "Enter a valid expiry (MM/YY)");
        valid = false;
      }
      const cvc = fields.cardCvc?.value || "";
      if (cvc.length < 3) {
        setError(fields.cardCvc, "Enter a valid CVC");
        valid = false;
      }
    }

    return valid;
  }

  /* ============================================================
     12. HOLD TIMER
     ============================================================ */

  function startHoldTimer() {
    if (state.holdInterval) return;

    updateHoldDisplay();

    state.holdInterval = setInterval(() => {
      state.holdSeconds--;
      updateHoldDisplay();

      if (state.holdSeconds <= 0) {
        stopHoldTimer();
        onHoldExpired();
      }
    }, 1000);
  }

  function stopHoldTimer() {
    if (state.holdInterval) {
      clearInterval(state.holdInterval);
      state.holdInterval = null;
    }
  }

  function updateHoldDisplay() {
    const el = state.dom.holdTimer;
    const banner = state.dom.holdBanner;
    if (!el && !banner) return;

    const s = Math.max(0, state.holdSeconds);
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    const display = `${m}:${sec}`;

    if (el) el.textContent = display;
    if (banner) {
      banner.classList.toggle("is-critical", s <= 60);
    }
  }

  function onHoldExpired() {
    showToast("Your hold has expired. Please reselect your tickets.");

    // Clear cart
    if (global.Data) {
      global.Data.clearCart();
      global.Data.clearSelectedSeats();
    }

    setTimeout(() => {
      window.location.href = "events.html";
    }, 2000);
  }

  /* ============================================================
     13. PURCHASE
     ============================================================ */

  function handlePurchase() {
    if (state.submitting) return;
    if (state.cart.length === 0) {
      showToast("Your cart is empty.");
      return;
    }

    // Validate
    if (!validateForm()) {
      showToast("Please fix the errors above.");
      const firstError = document.querySelector(".has-error");
      if (firstError) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      track("checkout_validation_error");
      return;
    }

    // Set submitting state
    state.submitting = true;
    const btn = document.getElementById("purchaseBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Processing…";
    }

    // Calculate
    calculateTotals();

    // Simulate processing delay
    setTimeout(() => {
      // Build order
      const reference = global.Data
        ? global.Data.generateOrderReference()
        : `TA-${Date.now()}`;

      const order = {
        reference,
        eventId: state.event ? state.event.id : null,
        eventTitle: state.event ? state.event.title : "",
        gateway: state.gateway,
        items: state.cart.map(item => ({
          tierId: item.tierId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          selectedSeats: item.selectedSeats || [],
        })),
        customer: {
          firstName: (document.getElementById("firstName") || {}).value || "",
          lastName: (document.getElementById("lastName") || {}).value || "",
          email: (document.getElementById("email") || {}).value || "",
          phone: (document.getElementById("phone") || {}).value || "",
        },
        totals: state.totals,
        promo: state.promo,
        itemCount: state.cart.reduce((s, i) => s + (i.quantity || 1), 0),
        total: state.totals.finalTotal,
      };

      // Save order
      if (global.Data) {
        global.Data.saveOrder(order);
        global.Data.clearCart();
        global.Data.clearSelectedSeats();
      }

      // Analytics
      track("purchase", {
        reference,
        total: order.total,
        itemCount: order.itemCount,
        gateway: order.gateway,
        eventId: order.eventId,
      });

      // Stop timer
      stopHoldTimer();

      // Navigate
      window.location.href = `confirmation.html?ref=${encodeURIComponent(reference)}`;
    }, 1200);
  }

  /* ============================================================
     14. RECALCULATE
     ============================================================ */

  function recalculate() {
    calculateTotals();
    renderOrderSummary();
    wirePurchaseButton();
  }

  function wirePurchaseButton() {
    const btn = document.getElementById("purchaseBtn");
    if (!btn) return;
    btn.addEventListener("click", handlePurchase);
  }

  /* ============================================================
     15. TOAST
     ============================================================ */

  function showToast(message) {
    const existing = document.querySelector(".checkout-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "checkout-toast";
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
      max-width: 90vw;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  /* ============================================================
     16. INIT
     ============================================================ */

  function init() {
    if (state.initialized) {
      log("Already initialized");
      return;
    }

    log("Initializing checkout page");

    if (!global.Data) {
      log("Data layer missing");
      return;
    }

    // Cache DOM
    state.dom.orderBody = document.getElementById("orderBody");
    state.dom.orderHeader = document.getElementById("orderHeader");
    state.dom.orderEvent = document.getElementById("orderEvent");
    state.dom.orderFooter = document.getElementById("orderFooter");
    state.dom.orderBadge = document.getElementById("orderBadge");
    state.dom.holdTimer = document.getElementById("holdTimerValue");
    state.dom.holdBanner = document.querySelector(".hold-banner");

    // Load cart
    loadCart();

    if (state.cart.length === 0) {
      renderEmptyCart();
      return;
    }

    // Initialize totals
    calculateTotals();

    // Render summary
    renderOrderSummary();

    // Wire inputs
    wirePaymentSelector();
    wireCardInputs();

    // Start hold timer
    startHoldTimer();

    // Fire analytics
    track("begin_checkout", {
      eventId: state.event ? state.event.id : null,
      itemCount: state.cart.length,
      total: state.totals.finalTotal,
      gateway: state.gateway,
    });

    state.initialized = true;
    log("Checkout ready");
  }

  /* ============================================================
     17. PUBLIC API
     ============================================================ */

  const Checkout = {
    init,
    config: CONFIG,
    state,
    enableDebug: () => { CONFIG.debug = true; },
    disableDebug: () => { CONFIG.debug = false; },
  };

  global.Checkout = Checkout;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Checkout;
  }

})(typeof window !== "undefined" ? window : this);
