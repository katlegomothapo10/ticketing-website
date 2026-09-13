/* ============================================================
   TICKETING APP — CURRENCY UTILITIES
   File: currency.js
   Purpose: Format, parse, and convert currencies
   Exposes: window.Currency
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. CURRENCY CONFIGURATION
     ============================================================ */

  const CURRENCIES = {
    ZAR: {
      code: "ZAR",
      symbol: "R",
      name: "South African Rand",
      locale: "en-ZA",
      decimals: 2,
      symbolPosition: "before", // R 250.00
      spaceAfterSymbol: false,
      thousandSeparator: ",",
      decimalSeparator: ".",
    },
    USD: {
      code: "USD",
      symbol: "$",
      name: "US Dollar",
      locale: "en-US",
      decimals: 2,
      symbolPosition: "before",
      spaceAfterSymbol: false,
      thousandSeparator: ",",
      decimalSeparator: ".",
    },
    EUR: {
      code: "EUR",
      symbol: "€",
      name: "Euro",
      locale: "de-DE",
      decimals: 2,
      symbolPosition: "after",
      spaceAfterSymbol: true,
      thousandSeparator: ".",
      decimalSeparator: ",",
    },
    GBP: {
      code: "GBP",
      symbol: "£",
      name: "British Pound",
      locale: "en-GB",
      decimals: 2,
      symbolPosition: "before",
      spaceAfterSymbol: false,
      thousandSeparator: ",",
      decimalSeparator: ".",
    },
  };

  /* ============================================================
     2. APP STATE — Default currency
     ============================================================ */

  let defaultCurrency = "ZAR";

  // Exchange rates — for demo only.
  // In production, fetch from an API like exchangerate.host
  const exchangeRates = {
    ZAR: 1,
    USD: 0.053,
    EUR: 0.049,
    GBP: 0.042,
  };

  /* ============================================================
     3. CORE FORMATTING
     ============================================================ */

  /**
   * Format a number as a currency string.
   * @param {number} amount - The amount in the default currency
   * @param {string} [currencyCode] - Optional currency override
   * @param {object} [options] - Formatting options
   * @returns {string}
   */
  function format(amount, currencyCode, options) {
    const opts = options || {};
    const code = currencyCode || defaultCurrency;
    const config = CURRENCIES[code];

    if (!config) {
      console.warn(`[Currency] Unknown currency: ${code}. Falling back to ${defaultCurrency}.`);
      return format(amount, defaultCurrency, options);
    }

    // Handle invalid values gracefully
    const value = Number(amount);
    if (!isFinite(value)) {
      return formatZero(code);
    }

    // Round to the currency's decimal precision
    const decimals = opts.decimals !== undefined ? opts.decimals : config.decimals;
    const rounded = roundTo(value, decimals);

    // Build the numeric part
    const numeric = formatNumber(rounded, config, decimals);

    // Build the final string with symbol
    let result;
    if (config.symbolPosition === "before") {
      result = config.symbol + (config.spaceAfterSymbol ? " " : "") + numeric;
    } else {
      result = numeric + (config.spaceAfterSymbol ? " " : "") + config.symbol;
    }

    // Optionally show the currency code
    if (opts.showCode) {
      result += " " + code;
    }

    return result;
  }

  /**
   * Format a number with thousand separators, no currency symbol.
   * @param {number} value - Rounded numeric value
   * @param {object} config - Currency config
   * @param {number} decimals - Decimal places
   * @returns {string}
   */
  function formatNumber(value, config, decimals) {
    // Use Intl.NumberFormat where possible for consistency
    try {
      const formatter = new Intl.NumberFormat(config.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return formatter.format(value);
    } catch (err) {
      // Fallback: manual formatting
      const fixed = value.toFixed(decimals);
      const parts = fixed.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandSeparator);
      return parts.join(config.decimalSeparator);
    }
  }

  /**
   * Round a number to N decimals.
   */
  function roundTo(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * Return the zero-value formatted string (e.g. "R0" or "R0.00").
   */
  function formatZero(currencyCode) {
    const code = currencyCode || defaultCurrency;
    const config = CURRENCIES[code];
    if (!config) return "R0";
    const numeric = (0).toFixed(config.decimals);
    return config.symbol + (config.spaceAfterSymbol ? " " : "") + numeric;
  }

  /* ============================================================
     4. COMPACT FORMATTING — "R1.2K", "R1.5M"
     ============================================================ */

  /**
   * Format a large number compactly.
   * @param {number} amount
   * @param {string} [currencyCode]
   * @returns {string}
   */
  function formatCompact(amount, currencyCode) {
    const code = currencyCode || defaultCurrency;
    const config = CURRENCIES[code] || CURRENCIES[defaultCurrency];

    const value = Number(amount);
    if (!isFinite(value)) return formatZero(code);

    const abs = Math.abs(value);
    let formatted;

    if (abs >= 1_000_000_000) {
      formatted = (value / 1_000_000_000).toFixed(1) + "B";
    } else if (abs >= 1_000_000) {
      formatted = (value / 1_000_000).toFixed(1) + "M";
    } else if (abs >= 1_000) {
      formatted = (value / 1_000).toFixed(1) + "K";
    } else {
      formatted = String(Math.round(value));
    }

    // Clean trailing ".0"
    formatted = formatted.replace(/\.0([KMB])$/, "$1");

    return config.symbol + (config.spaceAfterSymbol ? " " : "") + formatted;
  }

  /* ============================================================
     5. PARSING — Extract number from formatted string
     ============================================================ */

  /**
   * Parse a currency string into a number.
   * @param {string} str
   * @returns {number}
   */
  function parse(str) {
    if (typeof str === "number") return str;
    if (!str) return 0;

    // Remove everything except digits, dots, commas, minus
    const cleaned = String(str)
      .replace(/[^\d.,\-]/g, "")
      .trim();

    if (!cleaned) return 0;

    // Decide separator convention based on the string
    const hasComma = cleaned.includes(",");
    const hasDot = cleaned.includes(".");

    let normalized = cleaned;

    if (hasComma && hasDot) {
      // Last occurring separator is the decimal separator
      if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
        // European: 1.234,56
        normalized = cleaned.replace(/\./g, "").replace(",", ".");
      } else {
        // US: 1,234.56
        normalized = cleaned.replace(/,/g, "");
      }
    } else if (hasComma) {
      // Only commas: could be thousands or decimal
      // If comma appears more than once → thousands
      // If comma is followed by 1-2 digits at end → decimal
      const parts = cleaned.split(",");
      if (parts.length === 2 && parts[1].length <= 2) {
        normalized = parts[0] + "." + parts[1];
      } else {
        normalized = cleaned.replace(/,/g, "");
      }
    }

    const num = parseFloat(normalized);
    return isFinite(num) ? num : 0;
  }

  /* ============================================================
     6. CONVERSION — Between currencies
     ============================================================ */

  /**
   * Convert an amount from one currency to another.
   * @param {number} amount
   * @param {string} from
   * @param {string} to
   * @returns {number}
   */
  function convert(amount, from, to) {
    if (!from || !to || from === to) return amount;
    if (!exchangeRates[from] || !exchangeRates[to]) {
      console.warn(`[Currency] Unsupported conversion: ${from} → ${to}`);
      return amount;
    }

    // Convert to ZAR (base) first, then to target
    const inZAR = amount / exchangeRates[from];
    const result = inZAR * exchangeRates[to];
    return roundTo(result, 2);
  }

  /**
   * Update exchange rates at runtime (e.g. from API).
   * @param {object} rates
   */
  function setExchangeRates(rates) {
    if (rates && typeof rates === "object") {
      Object.assign(exchangeRates, rates);
    }
  }

  /* ============================================================
     7. DEFAULT CURRENCY MANAGEMENT
     ============================================================ */

  function getDefault() {
    return defaultCurrency;
  }

  function setDefault(code) {
    if (CURRENCIES[code]) {
      defaultCurrency = code;
    } else {
      console.warn(`[Currency] Cannot set default: unknown currency "${code}"`);
    }
  }

  function getSymbol(code) {
    const c = CURRENCIES[code || defaultCurrency];
    return c ? c.symbol : "R";
  }

  function getConfig(code) {
    return CURRENCIES[code || defaultCurrency] || null;
  }

  function getSupported() {
    return Object.keys(CURRENCIES);
  }

  /* ============================================================
     8. PERCENTAGE HELPER
     ============================================================ */

  /**
   * Format a number as a percentage.
   * @param {number} value - e.g. 8 for 8%
   * @param {number} [decimals]
   * @returns {string}
   */
  function formatPercent(value, decimals) {
    const d = decimals !== undefined ? decimals : 0;
    return Number(value).toFixed(d) + "%";
  }

  /* ============================================================
     9. PUBLIC API
     ============================================================ */

  const Currency = {
    // Formatting
    format,
    formatCompact,
    formatPercent,
    formatZero,

    // Parsing
    parse,

    // Conversion
    convert,
    setExchangeRates,

    // Currency management
    getDefault,
    setDefault,
    getSymbol,
    getConfig,
    getSupported,
  };

  // Expose globally
  global.Currency = Currency;

  // CommonJS support
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Currency;
  }

})(typeof window !== "undefined" ? window : this);
