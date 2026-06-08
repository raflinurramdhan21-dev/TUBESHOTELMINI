const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 8080;

// ── SERVICE URLs (dari environment atau default docker-compose) ──
const GUEST_SERVICE_URL   = process.env.GUEST_SERVICE_URL   || "http://guest-service:8000";
const ROOM_SERVICE_URL    = process.env.ROOM_SERVICE_URL    || "http://room-service:5000";
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://booking-service:3000";
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://payment-service:4000";

// ── MIDDLEWARE GLOBAL ──────────────────────────────────
app.use(cors());
app.use(morgan("dev"));

// ── HEALTH CHECK API GATEWAY ──────────────────────────
app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "running",
    port: PORT,
    routes: {
      guests:   "/api/guests/**   → guest-service:8000",
      rooms:    "/api/rooms/**    → room-service:5000",
      bookings: "/api/bookings/** → booking-service:3000",
      payments: "/api/payments/** → payment-service:4000",
    },
  });
});

// ── HEALTH CHECK SEMUA SERVICE ────────────────────────
app.get('/health/all', async (req, res) => {
    const services = [
        {
            name: 'guest-service',
            url: `${GUEST_SERVICE_URL}/health`,
        },
        {
            name: 'room-service',
            url: `${ROOM_SERVICE_URL}/health`,
        },
        {
            name: 'booking-service',
            url: `${BOOKING_SERVICE_URL}/health`,
        },
        {
            name: 'payment-service',
            url: `${PAYMENT_SERVICE_URL}/health`,
        },
    ];

    const results = await Promise.all(
        services.map(async (service) => {
            try {

               const result = await fetchJson(service.url);

               if (!result.ok) {
                   return {
                       name: service.name,
                       status: 'down',
                       error: result.error || result.data,
                   };
               }

               return {
                   name: service.name,
                   status: 'up',
                   data: result.data,
               };
            } catch (error) {
                return {
                    name: service.name,
                    status: 'down',
                    error: error.message,
                };
            }
        })
    );

    const overall = results.every((service) => service.status === 'up')
        ? 'healthy'
        : 'degraded';

    res.json({
        gateway: 'api-gateway',
        overall,
        services: results,
    });
});

// ── PROXY OPTIONS FACTORY ─────────────────────────────
function makeProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, req, res) => {
        console.error(`[PROXY ERROR] ${req.method} ${req.url} → ${target} :`, err.message);
        if (!res.headersSent) {
          res.status(502).json({
            service: "api-gateway",
            message: "Service tidak dapat dijangkau",
            target,
            error: err.message,
          });
        }
      },
    },
  });
}

// ── ROUTE: GUEST SERVICE ──────────────────────────────
// /api/guests/** → http://guest-service:8000/api/guests/**
app.use(
  "/api/guests",
  makeProxy(GUEST_SERVICE_URL, { "^/api/guests": "/api/guests" })
);

// ── ROUTE: ROOM SERVICE ───────────────────────────────
// /api/rooms/**  → http://room-service:5000/rooms/**
app.use(
  "/api/rooms",
  makeProxy(ROOM_SERVICE_URL, { "^/api/rooms": "/rooms" })
);

// ── ROUTE: BOOKING SERVICE ────────────────────────────
// /api/bookings/** → http://booking-service:3000/bookings/**
app.use(
  "/api/bookings",
  makeProxy(BOOKING_SERVICE_URL, { "^/api/bookings": "/bookings" })
);

// ── ROUTE: PAYMENT SERVICE ────────────────────────────
// /api/payments/** → http://payment-service:4000/payments/**
app.use(
  "/api/payments",
  makeProxy(PAYMENT_SERVICE_URL, { "^/api/payments": "/payments" })
);

// ── 404 HANDLER ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    service: "api-gateway",
    message: `Route '${req.method} ${req.url}' tidak ditemukan`,
    available_routes: [
      "GET  /health",
      "GET  /health/all",
      "---  GUEST SERVICE ---",
      "GET    /api/guests",
      "POST   /api/guests",
      "GET    /api/guests/:id",
      "PUT    /api/guests/:id",
      "DELETE /api/guests/:id",
      "---  ROOM SERVICE ---",
      "GET    /api/rooms",
      "POST   /api/rooms",
      "GET    /api/rooms/available",
      "GET    /api/rooms/:id",
      "PUT    /api/rooms/:id",
      "PATCH  /api/rooms/:id/status",
      "DELETE /api/rooms/:id",
      "---  BOOKING SERVICE ---",
      "GET    /api/bookings",
      "POST   /api/bookings",
      "GET    /api/bookings/:id",
      "---  PAYMENT SERVICE ---",
      "GET    /api/payments",
      "POST   /api/payments",
      "GET    /api/payments/:id",
      "GET    /api/payments/order/:orderId",
      "PATCH  /api/payments/:id/status",
      "PATCH  /api/payments/:id/cancel",
      "DELETE /api/payments/:id",
    ],
  });
});

// ── START ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n=== API GATEWAY berjalan di http://localhost:${PORT} ===`);
  console.log(`Services:`);
  console.log(`  /api/guests/**   → ${GUEST_SERVICE_URL}`);
  console.log(`  /api/rooms/**    → ${ROOM_SERVICE_URL}`);
  console.log(`  /api/bookings/** → ${BOOKING_SERVICE_URL}`);
  console.log(`  /api/payments/** → ${PAYMENT_SERVICE_URL}`);
  console.log(`===============================================\n`);
});