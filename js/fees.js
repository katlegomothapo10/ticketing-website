/* ============================================================
   TICKETING APP — FEE ENGINE
   File: fees.js
   Purpose: Calculate ticket fees, payouts, VAT, break-even
   Exposes: window.Fees
   Depends on: currency.js
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. FEE CONFIGURATION
     All rates are editable in one place.
     ============================================================ */

  const CONFIG = {
    // Platform commission (what Ticketing App takes)
    platform: {
      // Tiered — selected by ticket price band
      tiers: [
        { minPrice: 0, maxPrice: 99, rate: 0.10, flat: 0 },   // 10% for cheap tickets
        { minPrice: 100, maxPrice: 499, rate: 0.08, flat: 0 },   // 8% mid-tier
        { minPrice: 500, maxPrice: 1999, rate: 0.06, flat: 0 },   // 6% premium
        { minPrice: 2000, maxPrice: Infinity, rate: 0.05, flat: 0 }, // 5% high-end
      ],
    },

    // Payment gateway processing fees
    // Choose gateway per transaction
    gateways: {
      payfast: { rate: 0.029, flat: 2.0, label: "PayFast" },
      yoco: { rate: 0.025, flat: 1.5, label: "Yoco" },
      stripe: { rate: 0.029, flat: 3.5, label: "Stripe" },
      peach: { rate: 0.028, flat: 2.5, label: "Peach Payments" },
    },

    // Default gateway
    defaultGateway: "payfast",

    // VAT (South African standard = 15%)
    vat: {
      rate: 0.15,
      inclusive: false, // Ticket price shown EXCLUDES VAT (added on checkout)
    },

    // User-side service fee (charge to buyer)
    userServiceFee: {
      // Charged on top of ticket price
      tieredByCount: [
        { minQty: 1, maxQty: 1, flat: 25 },      // 1 ticket = R25
        { minQty: 2, maxQty: 4, flat: 40 },      // 2–4 tickets = R40
        { minQty: 5, maxQty: 9, flat: 60 },      // 5–9 tickets = R60
        { minQty: 10, maxQty: Infinity, flat: 90 }, // 10+ tickets = R90
      ],
    },

    // Payout schedules
    payouts: {
      standard: { daysToRelease: 7, fee: 0 },           // Free, 7 days after event
      express: { daysToRelease: 1, feeRate: 0.015 },    // 1.5% for same-day
    },

    // Refund admin fee
    refundAdmin: {
      feeRate: 0.02, // 2% of refund amount
      flat: 10,      // Plus R10
      minFee: 10,
      maxFee: 200,
    },
  };

  /* ============================================================
     2. PLATFORM FEE CALCULATION
     ============================================================ */

  /**
   * Determine the platform fee for a single ticket price.
   * @param {number} unitPrice - Price of ONE ticket (base, excl. VAT)
   * @returns {{ rate: number, flat: number, fee: number }}
   */
  function getPlatformFeeForUnit(unitPrice) {
    const tiers = CONFIG.platform.tiers;
    const price = Number(unitPrice);

    for (const tier of tiers) {
      if (price >= tier.minPrice && price <= tier.maxPrice) {
        return {
          rate: tier.rate,
          flat: tier.flat,
          fee: price * tier.rate + tier.flat,
        };
      }
    }

    // Fallback: highest tier
    const last = tiers[tiers.length - 1];
    return {
      rate: last.rate,
      flat: last.flat,
      fee: price * last.rate + last.flat,
    };
  }

  /* ============================================================
     3. PAYMENT PROCESSING FEE
     ============================================================ */

  /**
   * Calculate the payment gateway processing fee.
   * @param {number} chargeAmount - Amount the buyer is charged
   * @param {string} [gateway] - Gateway key (default: config default)
   * @returns {{ rate: number, flat: number, fee: number, label: string }}
   */
  function getProcessingFee(chargeAmount, gateway) {
    const key = gateway || CONFIG.defaultGateway;
    const config = CONFIG.gateways[key];

    if (!config) {
      console.warn(`[Fees] Unknown gateway: ${key}. Using default.`);
      return getProcessingFee(chargeAmount, CONFIG.defaultGateway);
    }

    const fee = Number(chargeAmount) * config.rate + config.flat;
    return {
      rate: config.rate,
      flat: config.flat,
      fee: round(fee, 2),
      label: config.label,
      key: key,
    };
  }

  /* ============================================================
     4. USER SERVICE FEE
     ============================================================ */

  /**
   * Get the service fee charged to the buyer, based on quantity.
   * @param {number} quantity - Number of tickets
   * @returns {number}
   */
  function getUserServiceFee(quantity) {
    const qty = Math.max(1, Number(quantity) || 1);
    const tiers = CONFIG.userServiceFee.tieredByCount;

    for (const tier of tiers) {
      if (qty >= tier.minQty && qty <= tier.maxQty) {
        return tier.flat;
      }
    }

    const last = tiers[tiers.length - 1];
    return last.flat;
  }

  /* ============================================================
     5. VAT
     ============================================================ */

  /**
   * Calculate VAT on an amount (exclusive).
   * @param {number} amount - Amount excl. VAT
   * @returns {number}
   */
  function calculateVAT(amount) {
    const rate = CONFIG.vat.rate;
    return round(Number(amount) * rate, 2);
  }

  /**
   * Extract VAT from a VAT-inclusive amount.
   * @param {number} amountIncl
   * @returns {number}
   */
  function extractVAT(amountIncl) {
    const rate = CONFIG.vat.rate;
    const excl = Number(amountIncl) / (1 + rate);
    return round(Number(amountIncl) - excl, 2);
  }

  /* ============================================================
     6. MAIN FEE BREAKDOWN
     ============================================================ */

  /**
   * Full fee breakdown for a ticket order.
   *
   * @param {object} params
   * @param {number} params.unitPrice - Price per ticket (excl. VAT)
   * @param {number} params.quantity - Number of tickets
   * @param {string} [params.gateway] - Payment gateway key
   * @param {boolean} [params.applyUserServiceFee] - Charge buyer fee?
   * @param {boolean} [params.applyVAT] - Add VAT?
   * @returns {object} Detailed breakdown
   */
  function calculateOrder(params) {
    const p = params || {};
    const unitPrice = Math.max(0, Number(p.unitPrice) || 0);
    const quantity = Math.max(1, Number(p.quantity) || 1);
    const gateway = p.gateway || CONFIG.defaultGateway;
    const applyUserServiceFee = p.applyUserServiceFee !== false;
    const applyVAT = p.applyVAT !== false;

    // 1. Subtotal — ticket prices
    const subtotal = round(unitPrice * quantity, 2);

    // 2. VAT (if applicable and exclusive)
    const vat = applyVAT && !CONFIG.vat.inclusive
      ? calculateVAT(subtotal)
      : 0;

    // 3. Subtotal + VAT
    const subtotalInclVAT = round(subtotal + vat, 2);

    // 4. User service fee (charged to buyer)
    const userServiceFee = applyUserServiceFee
      ? getUserServiceFee(quantity)
      : 0;

    // 5. Amount the buyer pays
    const buyerTotal = round(subtotalInclVAT + userServiceFee, 2);

    // 6. Platform commission (based on unit price tier)
    const platformPerUnit = getPlatformFeeForUnit(unitPrice);
    const platformFee = round(platformPerUnit.fee * quantity, 2);

    // 7. Payment processing fee — charged on what the buyer pays
    const processing = getProcessingFee(buyerTotal, gateway);

    // 8. Curator payout — subtotal minus platform fees
    //    (VAT and buyer service fee do NOT go to curator)
    const curatorGross = round(subtotal - platformFee, 2);

    return {
      // Pricing
      unitPrice,
      quantity,
      subtotal,
      vat,
      subtotalInclVAT,

      // Buyer side
      userServiceFee,
      buyerTotal,

      // Platform side
      platformFee,
      platformFeeRate: platformPerUnit.rate,
      processingFee: processing.fee,
      processingLabel: processing.label,
      gateway: processing.key,

      // Curator side
      curatorGross,

      // Net to platform
      platformNet: round(platformFee - processing.fee, 2),

      // Meta
      currency: "ZAR",
      timestamp: Date.now(),
    };
  }

  /* ============================================================
     7. PAYOUT CALCULATION
     ============================================================ */

  /**
   * Calculate curator payout.
   * @param {number} grossRevenue - Total from ticket sales (excl. buyer fees)
   * @param {object} [options]
   * @param {string} [options.schedule] - "standard" | "express"
   * @param {number} [options.refunds] - Amount refunded
   * @returns {object}
   */
  function calculatePayout(grossRevenue, options) {
    const opts = options || {};
    const schedule = opts.schedule === "express" ? "express" : "standard";
    const scheduleConfig = CONFIG.payouts[schedule];

    const gross = Math.max(0, Number(grossRevenue) || 0);
    const refunds = Math.max(0, Number(opts.refunds) || 0);

    // Platform commission — already subtracted per-order
    // Here we assume grossRevenue is already net of platform fees
    const expressFee = schedule === "express"
      ? round(gross * scheduleConfig.feeRate, 2)
      : 0;

    const payoutAmount = round(gross - expressFee - refunds, 2);

    return {
      gross,
      refunds,
      schedule,
      expressFee,
      payoutAmount,
      releaseDays: scheduleConfig.daysToRelease,
      releaseDate: addDays(new Date(), scheduleConfig.daysToRelease),
    };
  }

  /* ============================================================
     8. BREAK-EVEN CALCULATOR
     ============================================================ */

  /**
   * Calculate how many tickets must sell to break even.
   * @param {object} params
   * @param {number} params.expenses - Total event expenses
   * @param {number} params.unitPrice - Price per ticket (base)
   * @param {string} [params.gateway]
   * @returns {object}
   */
  function calculateBreakEven(params) {
    const p = params || {};
    const expenses = Math.max(0, Number(p.expenses) || 0);
    const unitPrice = Math.max(0.01, Number(p.unitPrice) || 0);
    const gateway = p.gateway || CONFIG.defaultGateway;

    // Price after platform commission per ticket
    const platformPerUnit = getPlatformFeeForUnit(unitPrice);
    const netPerTicket = unitPrice - platformPerUnit.fee;

    // Processing fee eats into revenue — approximate as percentage
    const processingRate = CONFIG.gateways[gateway].rate;
    const effectivePerTicket = netPerTicket * (1 - processingRate);

    if (effectivePerTicket <= 0) {
      return {
        feasible: false,
        ticketsNeeded: Infinity,
        message: "Ticket price too low to cover fees.",
      };
    }

    const ticketsNeeded = Math.ceil(expenses / effectivePerTicket);

    return {
      feasible: true,
      ticketsNeeded,
      expenses,
      netPerTicket: round(effectivePerTicket, 2),
      platformFeePerTicket: round(platformPerUnit.fee, 2),
      effectiveMargin: round(effectivePerTicket, 2),
      message: `Sell ${ticketsNeeded} tickets to break even.`,
    };
  }

  /* ============================================================
     9. REFUND FEE
     ============================================================ */

  /**
   * Calculate refund admin fee.
   * @param {number} refundAmount - Amount being refunded
   * @returns {number}
   */
  function calculateRefundFee(refundAmount) {
    const amount = Math.max(0, Number(refundAmount) || 0);
    const fee = amount * CONFIG.refundAdmin.feeRate + CONFIG.refundAdmin.flat;
    return round(
      Math.min(
        Math.max(fee, CONFIG.refundAdmin.minFee),
        CONFIG.refundAdmin.maxFee
      ),
      2
    );
  }

  /* ============================================================
     10. HELPERS
     ============================================================ */

  function round(value, decimals) {
    const factor = Math.pow(10, decimals || 2);
    return Math.round(value * factor) / factor;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /* ============================================================
     11. CONFIG ACCESS
     ============================================================ */

  function getConfig() {
    return JSON.parse(JSON.stringify(CONFIG)); // deep clone
  }

  /**
   * Update fee config at runtime.
   * @param {object} patch
   */
  function setConfig(patch) {
    if (!patch || typeof patch !== "object") return;
    deepMerge(CONFIG, patch);
  }

  function deepMerge(target, source) {
    Object.keys(source).forEach(key => {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === "object"
      ) {
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    });
  }

  function setDefaultGateway(key) {
    if (CONFIG.gateways[key]) {
      CONFIG.defaultGateway = key;
    } else {
      console.warn(`[Fees] Unknown gateway: ${key}`);
    }
  }

  function getGateways() {
    return Object.keys(CONFIG.gateways).map(key => ({
      key,
      label: CONFIG.gateways[key].label,
      rate: CONFIG.gateways[key].rate,
      flat: CONFIG.gateways[key].flat,
    }));
  }

  /* ============================================================
     12. PUBLIC API
     ============================================================ */

  const Fees = {
    // Calculation
    calculateOrder,
    calculatePayout,
    calculateBreakEven,
    calculateRefundFee,
    calculateVAT,
    extractVAT,

    // Component fees
    getPlatformFeeForUnit,
    getProcessingFee,
    getUserServiceFee,

    // Config
    getConfig,
    setConfig,
    setDefaultGateway,
    getGateways,
  };

  // Expose globally
  global.Fees = Fees;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Fees;
  }

})(typeof window !== "undefined" ? window : this);
