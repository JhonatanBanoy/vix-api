const express = require("express");
const router = express.Router();

const {
  createGuestOrder,
  getAdminOrders,
  getGuestOrderByToken,
  getUserOrders,
  syncWompiOrder,
  updateOrderStatus,
  wompiWebhook,
} = require("../controllers/order.controller");
const authenticateToken = require("../middlewares/authMiddleware");
const checkRole = require("../middlewares/roleMiddleware");

// Checkout público: no requiere iniciar sesión.
router.post("/guest", createGuestOrder);
router.get("/guest/token/:token", getGuestOrderByToken);

// Wompi: webhook firmado y sincronización al volver del checkout.
router.post("/wompi/webhook", wompiWebhook);
router.post("/wompi/sync", syncWompiOrder);

// Historial del usuario autenticado.
router.get("/", authenticateToken, getUserOrders);

// Administración de pedidos.
router.get("/admin", authenticateToken, checkRole(["admin"]), getAdminOrders);
router.patch(
  "/:id/status",
  authenticateToken,
  checkRole(["admin"]),
  updateOrderStatus
);

module.exports = router;
