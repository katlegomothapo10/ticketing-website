/* ============================================================
   TICKETING APP — DATA LAYER
   File: data.js
   Purpose: Mock data + storage helpers
   Exposes: window.Data
   Depends on: nothing
   ============================================================ */

(function (global) {
  "use strict";

  /* ============================================================
     1. LOCAL STORAGE KEYS
     ============================================================ */

  const KEYS = {
    cart: "ticketing_app:cart",
    orders: "ticketing_app:orders",
    selectedSeats: "ticketing_app:selectedSeats",
    curatorEvents: "ticketing_app:curatorEvents",
    userPreferences: "ticketing_app:preferences",
  };

  /* ============================================================
     2. CITIES
     ============================================================ */

  const CITIES = [
    { id: "jhb", name: "Johannesburg", slug: "johannesburg" },
    { id: "cpt", name: "Cape Town", slug: "cape-town" },
    { id: "dbn", name: "Durban", slug: "durban" },
    { id: "pta", name: "Pretoria", slug: "pretoria" },
  ];

  /* ============================================================
     3. CATEGORIES
     ============================================================ */

  const CATEGORIES = [
    { id: "music", name: "Music", icon: "♪" },
    { id: "nightlife", name: "Nightlife", icon: "◈" },
    { id: "sports", name: "Sports", icon: "⚽" },
    { id: "theatre", name: "Theatre", icon: "🎭" },
    { id: "comedy", name: "Comedy", icon: "😂" },
    { id: "family", name: "Family", icon: "👨‍👩‍👧" },
    { id: "business", name: "Business", icon: "💼" },
  ];

  /* ============================================================
     4. VENUES
     ============================================================ */

  const VENUES = [
    {
      id: "v-sandton",
      name: "Sandton Convention Centre",
      city: "jhb",
      address: "161 Maude St, Sandton, Johannesburg",
      capacity: 2200,
      lat: -26.1076,
      lng: 28.0567,
      amenities: ["Parking", "Bar", "Restrooms", "VIP Lounge", "Wheelchair Access"],
      mapLayout: "theatre",
    },
    {
      id: "v-grand-arena",
      name: "The Grand Arena",
      city: "cpt",
      address: "Grandwest Casino, Goodwood, Cape Town",
      capacity: 5000,
      lat: -33.9099,
      lng: 18.5246,
      amenities: ["Parking", "Multiple Bars", "Food Court", "VIP Area"],
      mapLayout: "arena",
    },
    {
      id: "v-capecity",
      name: "Cape Town City Hall",
      city: "cpt",
      address: "Darling St, Cape Town",
      capacity: 1200,
      lat: -33.9249,
      lng: 18.4241,
      amenities: ["Historic Venue", "Restrooms", "Accessible"],
      mapLayout: "theatre",
    },
    {
      id: "v-moses-mabhida",
      name: "Moses Mabhida Stadium",
      city: "dbn",
      address: "44 Isaiah Ntshangase Rd, Durban",
      capacity: 56000,
      lat: -29.8270,
      lng: 31.0305,
      amenities: ["Parking", "Food Court", "VIP Boxes", "Wheelchair Access"],
      mapLayout: "stadium",
    },
    {
      id: "v-basement",
      name: "The Basement",
      city: "jhb",
      address: "20 Kruger St, Johannesburg",
      capacity: 350,
      lat: -26.2041,
      lng: 28.0473,
      amenities: ["Intimate Setting", "Bar", "Restrooms"],
      mapLayout: "club",
    },
    {
      id: "v-sun-arena",
      name: "Sun Arena Time Square",
      city: "pta",
      address: "209 Aramist Ave, Menlyn, Pretoria",
      capacity: 8500,
      lat: -25.7836,
      lng: 28.2766,
      amenities: ["Parking", "Multiple Bars", "VIP Lounge", "Wheelchair Access"],
      mapLayout: "arena",
    },
  ];

  /* ============================================================
     5. EVENTS
     ============================================================ */

  const EVENTS = [
    {
      id: "east-meets-west",
      title: "East Meets West",
      slug: "east-meets-west",
      category: "music",
      venueId: "v-sandton",
      city: "jhb",
      date: "2026-08-24",
      dateLabel: "SAT, 24 AUG",
      time: "18:00 – 01:00",
      timeLabel: "18:00",
      priceFrom: 250,
      image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200",
      description: "An elevated celebration of culture, music and luxury. Where East African rhythm meets Western soul for one unforgettable night.",
      featured: true,
      status: "active",
      ticketTiers: [
        {
          id: "t-general",
          name: "General Admission",
          description: "Entry to the event. Standing area.",
          price: 250,
          capacity: 800,
          available: 340,
          tier: "general",
        },
        {
          id: "t-premium",
          name: "Premium",
          description: "Premium access and preferred viewing.",
          price: 450,
          capacity: 400,
          available: 180,
          tier: "premium",
        },
        {
          id: "t-vip",
          name: "VIP",
          description: "VIP access with lounge and hospitality.",
          price: 1200,
          capacity: 150,
          available: 45,
          tier: "vip",
        },
        {
          id: "t-platinum",
          name: "Platinum Table",
          description: "Private table for 10, dedicated service.",
          price: 15000,
          capacity: 20,
          available: 3,
          tier: "platinum",
        },
      ],
    },
    {
      id: "summer-sound",
      title: "Summer Sound Festival",
      slug: "summer-sound",
      category: "nightlife",
      venueId: "v-grand-arena",
      city: "cpt",
      date: "2026-09-07",
      dateLabel: "SUN, 07 SEP",
      time: "14:00 – 02:00",
      timeLabel: "14:00",
      priceFrom: 350,
      image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200",
      description: "Cape Town's biggest summer party. International DJs, local talent, and ocean views.",
      featured: true,
      status: "active",
      ticketTiers: [
        { id: "t-general", name: "General", description: "Standard entry.", price: 350, capacity: 3000, available: 1200, tier: "general" },
        { id: "t-vip", name: "VIP Deck", description: "VIP deck with premium bar.", price: 950, capacity: 500, available: 210, tier: "vip" },
        { id: "t-cabana", name: "Cabana", description: "Private cabana for 6.", price: 6500, capacity: 100, available: 22, tier: "platinum" },
      ],
    },
    {
      id: "laughing-matters",
      title: "Laughing Matters",
      slug: "laughing-matters",
      category: "comedy",
      venueId: "v-basement",
      city: "jhb",
      date: "2026-09-15",
      dateLabel: "TUE, 15 SEP",
      time: "20:00 – 22:30",
      timeLabel: "20:00",
      priceFrom: 180,
      image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200",
      description: "A night of stand-up comedy with South Africa's sharpest voices.",
      featured: false,
      status: "sold_out",
      ticketTiers: [
        { id: "t-general", name: "Standard", description: "Seated entry.", price: 180, capacity: 300, available: 0, tier: "general" },
        { id: "t-premium", name: "Front Row", description: "Front row seats.", price: 280, capacity: 50, available: 0, tier: "premium" },
      ],
    },
    {
      id: "afro-nation",
      title: "Afro Nation Joburg",
      slug: "afro-nation",
      category: "music",
      venueId: "v-sun-arena",
      city: "pta",
      date: "2026-10-05",
      dateLabel: "SAT, 05 OCT",
      time: "16:00 – 02:00",
      timeLabel: "16:00",
      priceFrom: 500,
      image: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1200",
      description: "The biggest Afrobeats festival in Africa returns to Gauteng.",
      featured: true,
      status: "active",
      ticketTiers: [
        { id: "t-general", name: "GA", description: "General admission.", price: 500, capacity: 6000, available: 3100, tier: "general" },
        { id: "t-vip", name: "VIP", description: "VIP area, fast lane, premium bar.", price: 1500, capacity: 1500, available: 620, tier: "vip" },
        { id: "t-table", name: "VIP Table", description: "Table for 8, bottle service.", price: 12000, capacity: 200, available: 34, tier: "platinum" },
      ],
    },
    {
      id: "sunset-jazz",
      title: "Sunset Jazz Sessions",
      slug: "sunset-jazz",
      category: "music",
      venueId: "v-capecity",
      city: "cpt",
      date: "2026-09-22",
      dateLabel: "MON, 22 SEP",
      time: "17:00 – 22:00",
      timeLabel: "17:00",
      priceFrom: 320,
      image: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1200",
      description: "An evening of smooth jazz in the heart of Cape Town's historic city hall.",
      featured: false,
      status: "active",
      ticketTiers: [
        { id: "t-general", name: "Standard", description: "Standard seating.", price: 320, capacity: 800, available: 380, tier: "general" },
        { id: "t-premium", name: "Premium", description: "Premium seating, complimentary drink.", price: 550, capacity: 300, available: 120, tier: "premium" },
      ],
    },
    {
      id: "derby-day",
      title: "Durban Derby Day",
      slug: "derby-day",
      category: "sports",
      venueId: "v-moses-mabhida",
      city: "dbn",
      date: "2026-11-15",
      dateLabel: "SAT, 15 NOV",
      time: "15:00 – 18:00",
      timeLabel: "15:00",
      priceFrom: 150,
      image: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200",
      description: "The biggest football derby in KwaZulu-Natal returns to Moses Mabhida.",
      featured: true,
      status: "active",
      ticketTiers: [
        { id: "t-general", name: "Upper Stand", description: "Upper stand seating.", price: 150, capacity: 30000, available: 18000, tier: "general" },
        { id: "t-lower", name: "Lower Stand", description: "Lower stand, closer to action.", price: 350, capacity: 20000, available: 9500, tier: "premium" },
        { id: "t-box", name: "VIP Box", description: "Private box with catering.", price: 25000, capacity: 500, available: 8, tier: "platinum" },
      ],
    },
    {
      id: "family-fun-day",
      title: "Family Fun Day",
      slug: "family-fun-day",
      category: "family",
      venueId: "v-grand-arena",
      city: "cpt",
      date: "2026-09-28",
      dateLabel: "SUN, 28 SEP",
      time: "10:00 – 16:00",
      timeLabel: "10:00",
      priceFrom: 80,
      image: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=1200",
      description: "A full day of family entertainment — rides, shows, and food.",
      featured: false,
      status: "active",
      ticketTiers: [
        { id: "t-adult", name: "Adult", description: "Full day access.", price: 120, capacity: 2000, available: 1400, tier: "general" },
        { id: "t-child", name: "Child (under 12)", description: "Full day access for kids.", price: 80, capacity: 1500, available: 980, tier: "general" },
        { id: "t-family", name: "Family Pack (4)", description: "2 adults + 2 children.", price: 320, capacity: 500, available: 210, tier: "premium" },
      ],
    },
    {
      id: "tech-summit",
      title: "Africa Tech Summit",
      slug: "tech-summit",
      category: "business",
      venueId: "v-sandton",
      city: "jhb",
      date: "2026-10-20",
      dateLabel: "TUE, 20 OCT",
      time: "09:00 – 18:00",
      timeLabel: "09:00",
      priceFrom: 2500,
      image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200",
      description: "Where Africa's tech leaders meet. Keynotes, panels, and networking.",
      featured: false,
      status: "active",
      ticketTiers: [
        { id: "t-standard", name: "Standard", description: "All talks and panels.", price: 2500, capacity: 1200, available: 620, tier: "premium" },
        { id: "t-executive", name: "Executive", description: "Executive pass with lounge access.", price: 5500, capacity: 300, available: 88, tier: "vip" },
        { id: "t-corporate", name: "Corporate Table", description: "Table for 8 with branding.", price: 35000, capacity: 30, available: 6, tier: "platinum" },
      ],
    },
    {
      id: "gqom-nights",
      title: "Gqom Nights",
      slug: "gqom-nights",
      category: "nightlife",
      venueId: "v-basement",
      city: "jhb",
      date: "2026-09-13",
      dateLabel: "SAT, 13 SEP",
      time: "22:00 – 04:00",
      timeLabel: "22:00",
      priceFrom: 200,
      image: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=1200",
      description: "The rawest Gqom night in Joburg. Strictly for the heads.",
      featured: false,
      status: "active",
      ticketTiers: [
        { id: "t-general", name: "Entry", description: "Standard entry.", price: 200, capacity: 300, available: 145, tier: "general" },
        { id: "t-booth", name: "Booth", description: "Private booth for 4.", price: 2000, capacity: 20, available: 5, tier: "premium" },
      ],
    },
    {
      id: "gala-dinner",
      title: "Annual Gala Dinner",
      slug: "gala-dinner",
      category: "business",
      venueId: "v-sandton",
      city: "jhb",
      date: "2026-12-05",
      dateLabel: "SAT, 05 DEC",
      time: "18:30 – 23:30",
      timeLabel: "18:30",
      priceFrom: 5000,
      image: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200",
      description: "A black-tie evening celebrating excellence in African business.",
      featured: false,
      status: "active",
      ticketTiers: [
        { id: "t-single", name: "Individual Seat", description: "One seat at the gala.", price: 5000, capacity: 200, available: 88, tier: "vip" },
        { id: "t-table", name: "Table (10)", description: "Full table for 10 with champagne.", price: 45000, capacity: 20, available: 4, tier: "platinum" },
      ],
    },
  ];

  /* ============================================================
     6. CURATOR MOCK DATA
     ============================================================ */

  const CURATORS = [
    {
      id: "c-001",
      name: "Sunset Events Co.",
      email: "curator@example.com",
      events: ["east-meets-west", "summer-sound", "gqom-nights"],
      balance: 428500,
      totalRevenue: 1893000,
      totalPayout: 1464500,
    },
  ];

  /* ============================================================
     7. CORE GETTERS
     ============================================================ */

  function getEvents() {
    return EVENTS.slice();
  }

  function getEvent(id) {
    return EVENTS.find(e => e.id === id) || null;
  }

  function getEventBySlug(slug) {
    return EVENTS.find(e => e.slug === slug) || null;
  }

  function getVenues() {
    return VENUES.slice();
  }

  function getVenue(id) {
    return VENUES.find(v => v.id === id) || null;
  }

  function getCities() {
    return CITIES.slice();
  }

  function getCity(id) {
    return CITIES.find(c => c.id === id) || null;
  }

  function getCategories() {
    return CATEGORIES.slice();
  }

  function getCategory(id) {
    return CATEGORIES.find(c => c.id === id) || null;
  }

  function getCurator(id) {
    return CURATORS.find(c => c.id === id) || null;
  }

  /* ============================================================
     8. FILTERS
     ============================================================ */

  function getFeaturedEvents() {
    return EVENTS.filter(e => e.featured);
  }

  function getEventsByCity(cityId) {
    return EVENTS.filter(e => e.city === cityId);
  }

  function getEventsByCategory(categoryId) {
    return EVENTS.filter(e => e.category === categoryId);
  }

  function getEventsByVenue(venueId) {
    return EVENTS.filter(e => e.venueId === venueId);
  }

  function searchEvents(query) {
    if (!query) return EVENTS.slice();
    const q = String(query).toLowerCase().trim();
    return EVENTS.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (getVenue(e.venueId)?.name || "").toLowerCase().includes(q)
    );
  }

  function getUpcomingEvents(limit) {
    const sorted = EVENTS.slice().sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  }

  /* ============================================================
     9. TICKET AVAILABILITY
     ============================================================ */

  function getTierAvailability(eventId, tierId) {
    const event = getEvent(eventId);
    if (!event) return null;
    const tier = event.ticketTiers.find(t => t.id === tierId);
    if (!tier) return null;
    return {
      capacity: tier.capacity,
      available: tier.available,
      sold: tier.capacity - tier.available,
      percentage: Math.round(
        ((tier.capacity - tier.available) / tier.capacity) * 100
      ),
      isAvailable: tier.available > 0,
    };
  }

  function getEventAvailability(eventId) {
    const event = getEvent(eventId);
    if (!event) return null;
    const totalCap = event.ticketTiers.reduce((s, t) => s + t.capacity, 0);
    const totalAvail = event.ticketTiers.reduce((s, t) => s + t.available, 0);
    return {
      total: totalCap,
      available: totalAvail,
      sold: totalCap - totalAvail,
      percentage: Math.round(((totalCap - totalAvail) / totalCap) * 100),
      isSoldOut: totalAvail === 0,
    };
  }

  function getLowestPrice(eventId) {
    const event = getEvent(eventId);
    if (!event || !event.ticketTiers.length) return 0;
    return Math.min(...event.ticketTiers.map(t => t.price));
  }

  /* ============================================================
     10. STORAGE HELPERS
     ============================================================ */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn(`[Data] Failed to read ${key}:`, err);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[Data] Failed to write ${key}:`, err);
      return false;
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[Data] Failed to remove ${key}:`, err);
    }
  }

  /* ============================================================
     11. CART
     ============================================================ */

  function getCart() {
    return readJSON(KEYS.cart, []);
  }

  function saveCart(cart) {
    return writeJSON(KEYS.cart, cart);
  }

  function addToCart(item) {
    const cart = getCart();
    // Merge if same event + tier
    const existing = cart.find(
      c => c.eventId === item.eventId && c.tierId === item.tierId
    );
    if (existing) {
      existing.quantity += item.quantity || 1;
    } else {
      cart.push({
        eventId: item.eventId,
        tierId: item.tierId,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice,
        selectedSeats: item.selectedSeats || [],
        addedAt: Date.now(),
      });
    }
    saveCart(cart);
    return cart;
  }

  function removeFromCart(eventId, tierId) {
    const cart = getCart().filter(
      c => !(c.eventId === eventId && c.tierId === tierId)
    );
    saveCart(cart);
    return cart;
  }

  function clearCart() {
    removeKey(KEYS.cart);
  }

  function getCartTotal() {
    const cart = getCart();
    return cart.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );
  }

  function getCartCount() {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
  }

  /* ============================================================
     12. ORDERS
     ============================================================ */

  function getOrders() {
    return readJSON(KEYS.orders, []);
  }

  function getOrder(reference) {
    return getOrders().find(o => o.reference === reference) || null;
  }

  function saveOrder(order) {
    const orders = getOrders();
    orders.push({
      ...order,
      createdAt: Date.now(),
    });
    writeJSON(KEYS.orders, orders);
    return order;
  }

  function clearOrders() {
    removeKey(KEYS.orders);
  }

  function generateOrderReference() {
    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);
    return `TA-${year}-${random}`;
  }

  /* ============================================================
     13. SELECTED SEATS
     ============================================================ */

  function getSelectedSeats() {
    return readJSON(KEYS.selectedSeats, []);
  }

  function saveSelectedSeats(seats) {
    return writeJSON(KEYS.selectedSeats, seats);
  }

  function clearSelectedSeats() {
    removeKey(KEYS.selectedSeats);
  }

  /* ============================================================
     14. PUBLIC API
     ============================================================ */

  const Data = {
    // Static
    cities: CITIES,
    categories: CATEGORIES,
    venues: VENUES,
    events: EVENTS,
    curators: CURATORS,

    // Getters
    getEvents,
    getEvent,
    getEventBySlug,
    getVenues,
    getVenue,
    getCities,
    getCity,
    getCategories,
    getCategory,
    getCurator,

    // Filters
    getFeaturedEvents,
    getEventsByCity,
    getEventsByCategory,
    getEventsByVenue,
    searchEvents,
    getUpcomingEvents,

    // Availability
    getTierAvailability,
    getEventAvailability,
    getLowestPrice,

    // Cart
    getCart,
    saveCart,
    addToCart,
    removeFromCart,
    clearCart,
    getCartTotal,
    getCartCount,

    // Orders
    getOrders,
    getOrder,
    saveOrder,
    clearOrders,
    generateOrderReference,

    // Seats
    getSelectedSeats,
    saveSelectedSeats,
    clearSelectedSeats,

    // Storage (escape hatch)
    readJSON,
    writeJSON,
    removeKey,

    // Keys (for debugging)
    KEYS,
  };

  // Expose globally
  global.Data = Data;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Data;
  }

})(typeof window !== "undefined" ? window : this);
