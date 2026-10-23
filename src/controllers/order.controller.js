const crypto = require("crypto");

const Order = require("../models/order.model");
const Product = require("../models/product.model");
const { getShippingQuote } = require("../utils/shipping");
const {
  buildCheckoutUrl,
  fetchTransaction,
  isWebhookConfigured,
  isWompiEnabled,
  isValidEvent,
} = require("../utils/wompi");

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicOrder(order) {
  if (!order) return null;
  const data = typeof order.toObject === "function" ? order.toObject() : order;

  return {
    id: String(data._id),
    reference: data.reference,
    status: data.status,
    paymentMethod: data.paymentMethod,
    paymentStatus: data.paymentStatus,
    isPaid: data.isPaid,
    items: (data.items || []).map((item) => ({
      productId: String(item.productId),
      name: item.name,
      image: item.image || null,
      price: item.price,
      quantity: item.quantity,
    })),
    subtotal: data.subtotal,
    shipping: data.shipping,
    total: data.total,
    currency: data.currency,
    customer: data.customer,
    shippingAddress: data.shippingAddress,
    providerTransactionId: data.providerTransactionId || null,
    createdAt: data.createdAt,
  };
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "El carrito está vacío." };
  }

  if (rawItems.length > 50) {
    return { error: "Hay demasiados productos en el pedido." };
  }

  const merged = new Map();

  for (const raw of rawItems) {
    const productId = String(raw?.productId || raw?.id || "").trim();
    const quantity = Math.floor(Number(raw?.quantity));

    if (!/^[a-f0-9]{24}$/i.test(productId)) {
      return { error: "Uno de los productos no es válido." };
    }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      return { error: "La cantidad de uno de los productos no es válida." };
    }

    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }

  return {
    items: [...merged.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
    })),
  };
}

function normalizeCustomer(customer = {}) {
  const name = String(customer.name || "").trim();
  const email = String(customer.email || "").trim().toLowerCase();
  const phone = String(customer.phone || "").replace(/[^\d+]/g, "").trim();

  if (name.length < 3) return { error: "Escribe tu nombre completo." };
  if (!EMAIL_RE.test(email)) return { error: "Escribe un correo válido." };
  if (phone.replace(/\D/g, "").length < 7) {
    return { error: "Escribe un teléfono válido." };
  }

  return { customer: { name, email, phone } };
}

function normalizeAddress(address = {}) {
  const department = String(address.department || "").trim();
  const city = String(address.city || "").trim();
  const line = String(address.address || "").trim();
  const neighborhood = String(address.neighborhood || "").trim();
  const notes = String(address.notes || "").trim();

  if (!department) return { error: "Selecciona tu departamento." };
  if (city.length < 3) return { error: "Escribe tu ciudad." };
  if (line.length < 6) return { error: "Escribe tu dirección de entrega." };

  return {
    shippingAddress: {
      department,
      city,
      address: line,
      neighborhood,
      notes,
    },
  };
}

function buildReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `VIX-${stamp}-${random}`;
}

async function restoreStock(order) {
  if (!order?.stockReserved) return;

  for (const item of order.items || []) {
    await Product.updateOne(
      { _id: item.productId },
      { $inc: { stock: item.quantity } }
    );
  }

  order.stockReserved = false;
}

async function reserveStock(order) {
  const reserved = [];

  for (const item of order.items) {
    const updated = await Product.findOneAndUpdate(
      {
        _id: item.productId,
        isActive: true,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { new: false }
    );

    if (!updated) {
      for (const reservedItem of reserved) {
        await Product.updateOne(
          { _id: reservedItem.productId },
          { $inc: { stock: reservedItem.quantity } }
        );
      }
      return {
        ok: false,
        message: `“${item.name}” ya no tiene suficiente stock.`,
      };
    }

    reserved.push(item);
  }

  order.stockReserved = true;
  return { ok: true };
}

async function releaseExpiredOrders() {
  const expired = await Order.find({
    paymentMethod: "wompi",
    status: "pending_payment",
    stockReserved: true,
    expiresAt: { $lt: new Date() },
  }).limit(25);

  for (const order of expired) {
    await restoreStock(order);
    order.status = "cancelled";
    order.paymentStatus = "voided";
    await order.save();
  }
}

/**
 * Aplica el estado de una transacción Wompi a una orden.
 * Es idempotente: Wompi puede enviar el mismo evento varias veces.
 */
async function applyWompiTransaction(order, transaction) {
  if (!order || !transaction) return order;

  const status = String(transaction.status || "").toUpperCase();
  order.providerTransactionId = transaction.id || order.providerTransactionId;

  if (status === "APPROVED") {
    const amountOk =
      Number(transaction.amount_in_cents) === Math.round(order.total * 100);
    const currencyOk = !transaction.currency || transaction.currency === "COP";

    if (!amountOk || !currencyOk) {
      // El dinero llegó, pero el monto no coincide: no se despacha.
      order.isPaid = true;
      order.paidAt = order.paidAt || new Date();
      order.paymentStatus = "error";
      order.status = "cancelled";
      await restoreStock(order);
    } else {
      order.isPaid = true;
      order.paidAt = order.paidAt || new Date();
      order.paymentStatus = "approved";
      order.status = order.status === "shipped" || order.status === "delivered"
        ? order.status
        : "processing";
    }
  } else if (["DECLINED", "VOIDED", "ERROR"].includes(status)) {
    await restoreStock(order);
    order.paymentStatus = status.toLowerCase();
    order.status = "cancelled";
  } else {
    order.paymentStatus = "pending";
  }

  await order.save();
  return order;
}

/**
 * Crea una orden de invitado. Nunca confía en los precios del frontend:
 * vuelve a leer los productos y calcula subtotal, envío y total.
 */
async function createGuestOrder(req, res) {
  try {
    // Libera reservas de pagos Wompi que quedaron abandonados.
    await releaseExpiredOrders().catch((error) => {
      console.error("No se pudieron liberar pedidos vencidos:", error.message);
    });

    const normalizedItems = normalizeItems(req.body?.items);
    if (normalizedItems.error) {
      return res.status(400).json({ message: normalizedItems.error });
    }

    const normalizedCustomer = normalizeCustomer(req.body?.customer);
    if (normalizedCustomer.error) {
      return res.status(400).json({ message: normalizedCustomer.error });
    }

    const normalizedAddress = normalizeAddress(req.body?.shippingAddress);
    if (normalizedAddress.error) {
      return res.status(400).json({ message: normalizedAddress.error });
    }

    const paymentMethod = String(req.body?.paymentMethod || "cod").toLowerCase();
    if (!["wompi", "cod"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Método de pago no válido." });
    }
    if (paymentMethod === "wompi" && !isWompiEnabled()) {
      return res.status(503).json({
        code: "WOMPI_NOT_CONFIGURED",
        message:
          "El pago en línea todavía no está activo. Puedes pagar contra entrega.",
      });
    }
    if (paymentMethod === "cod" && process.env.ENABLE_COD === "false") {
      return res.status(400).json({
        message: "El pago contra entrega no está disponible en este momento.",
      });
    }

    const productIds = normalizedItems.items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    const productsById = new Map(
      products.map((product) => [String(product._id), product])
    );

    const orderItems = [];

    for (const item of normalizedItems.items) {
      const product = productsById.get(item.productId);

      if (!product) {
        return res.status(409).json({
          message: "Uno de los productos ya no está disponible.",
        });
      }
      if (product.isActive === false) {
        return res.status(409).json({
          message: `“${product.name}” ya no está disponible.`,
        });
      }
      if (Number(product.stock) < item.quantity) {
        return res.status(409).json({
          message: `“${product.name}” ya no tiene suficiente stock.`,
        });
      }

      orderItems.push({
        productId: product._id,
        name: product.name,
        image: product.image || null,
        price: Number(product.price),
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const shippingQuote = getShippingQuote({
      city: normalizedAddress.shippingAddress.city,
      department: normalizedAddress.shippingAddress.department,
    });

    if (!shippingQuote.rate) {
      return res.status(400).json({
        message: "No pudimos calcular el envío para esa ciudad.",
      });
    }

    const total = subtotal + shippingQuote.rate;
    const publicToken = crypto.randomBytes(24).toString("hex");
    const expiresAt =
      paymentMethod === "wompi"
        ? new Date(Date.now() + 30 * 60 * 1000)
        : null;

    const order = new Order({
      reference: buildReference(),
      publicToken,
      customer: normalizedCustomer.customer,
      shippingAddress: normalizedAddress.shippingAddress,
      items: orderItems,
      subtotal,
      shipping: shippingQuote.rate,
      total,
      currency: "COP",
      paymentMethod,
      paymentStatus: "pending",
      status: paymentMethod === "cod" ? "processing" : "pending_payment",
      expiresAt,
    });

    await order.save();

    const stockResult = await reserveStock(order);
    if (!stockResult.ok) {
      await Order.deleteOne({ _id: order._id });
      return res.status(409).json({ message: stockResult.message });
    }

    await order.save();

    const successUrl = `${FRONTEND_URL}/checkout/gracias/${order.publicToken}`;

    if (paymentMethod === "cod") {
      return res.status(201).json({
        order: toPublicOrder(order),
        redirectUrl: `${FRONTEND_URL}/checkout/gracias?token=${order.publicToken}`,
      });
    }

    try {
      const checkoutUrl = buildCheckoutUrl({
        reference: order.reference,
        amountInCents: Math.round(order.total * 100),
        currency: "COP",
        customer: order.customer,
        shippingAddress: order.shippingAddress,
        redirectUrl: successUrl,
        expirationTime: order.expiresAt.toISOString(),
      });

      order.providerCheckoutUrl = checkoutUrl;
      await order.save();

      return res.status(201).json({
        order: toPublicOrder(order),
        checkoutUrl,
        redirectUrl: successUrl,
      });
    } catch (error) {
      await restoreStock(order);
      await Order.deleteOne({ _id: order._id });
      console.error("No se pudo crear el checkout de Wompi:", error.message);
      return res.status(500).json({
        message: "No pudimos iniciar el pago en línea. Intenta de nuevo.",
      });
    }
  } catch (error) {
    console.error("Error al crear la orden:", error);
    return res.status(500).json({
      message: "No pudimos crear tu pedido. Intenta de nuevo.",
    });
  }
}

async function getGuestOrderByToken(req, res) {
  try {
    const { token } = req.params;
    if (!token || token.length < 20) {
      return res.status(400).json({ message: "Token de pedido no válido." });
    }

    const order = await Order.findOne({ publicToken: token });
    if (!order) {
      return res.status(404).json({ message: "Pedido no encontrado." });
    }

    return res.json({ order: toPublicOrder(order) });
  } catch (error) {
    console.error("Error al consultar la orden:", error);
    return res.status(500).json({ message: "No pudimos consultar tu pedido." });
  }
}

async function syncWompiOrder(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    const transactionId = String(req.body?.transactionId || "").trim();

    if (!token || !transactionId) {
      return res.status(400).json({ message: "Faltan datos del pago." });
    }

    const order = await Order.findOne({ publicToken: token });
    if (!order || order.paymentMethod !== "wompi") {
      return res.status(404).json({ message: "Pedido no encontrado." });
    }

    const transaction = await fetchTransaction(transactionId);
    if (!transaction || transaction.reference !== order.reference) {
      return res.status(409).json({
        message: "La transacción no corresponde a este pedido.",
      });
    }

    await applyWompiTransaction(order, transaction);
    return res.json({ order: toPublicOrder(order) });
  } catch (error) {
    console.error("Error al sincronizar el pago:", error.message);
    return res.status(500).json({
      message: "Todavía estamos confirmando tu pago.",
    });
  }
}

async function wompiWebhook(req, res) {
  try {
    if (!isWebhookConfigured()) {
      return res.status(503).json({ message: "Webhook no configurado." });
    }

    const headerChecksum = req.get("X-Event-Checksum");
    if (!isValidEvent(req.body, headerChecksum)) {
      return res.status(401).json({ message: "Firma de evento inválida." });
    }

    if (req.body?.event !== "transaction.updated") {
      return res.json({ received: true });
    }

    const bodyTransaction = req.body?.data?.transaction;
    if (!bodyTransaction?.reference) {
      return res.status(400).json({ message: "Evento sin transacción." });
    }

    const order = await Order.findOne({ reference: bodyTransaction.reference });
    if (!order) {
      // Respondemos 200 para que Wompi no reintente un pedido que no existe.
      console.warn("Webhook Wompi sin orden:", bodyTransaction.reference);
      return res.json({ received: true });
    }

    let transaction = bodyTransaction;

    try {
      if (bodyTransaction.id) {
        const fresh = await fetchTransaction(bodyTransaction.id);
        if (fresh) transaction = fresh;
      }
    } catch (error) {
      // Si la consulta falla, usamos la transacción firmada del evento.
      console.error("No se pudo consultar la transacción Wompi:", error.message);
    }

    await applyWompiTransaction(order, transaction);
    return res.json({ received: true });
  } catch (error) {
    console.error("Error en webhook Wompi:", error);
    return res.status(500).json({ message: "Error procesando el evento." });
  }
}

async function getUserOrders(req, res) {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({
      createdAt: -1,
    });
    return res.json(orders.map(toPublicOrder));
  } catch (error) {
    console.error("Error al obtener las órdenes:", error);
    return res.status(500).json({ message: "Error al obtener las órdenes" });
  }
}

async function getAdminOrders(req, res) {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(200);
    return res.json(orders.map(toPublicOrder));
  } catch (error) {
    console.error("Error al obtener las órdenes:", error);
    return res.status(500).json({ message: "Error al obtener las órdenes" });
  }
}

async function updateOrderStatus(req, res) {
  try {
    const allowed = [
      "processing",
      "paid",
      "shipped",
      "delivered",
      "cancelled",
    ];
    const status = String(req.body?.status || "").trim();

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Estado no válido." });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Pedido no encontrado." });
    }

    if (status === "cancelled") {
      await restoreStock(order);
      order.status = "cancelled";
    } else {
      order.status = status;
    }

    if (status === "delivered" && order.paymentMethod === "cod") {
      order.isPaid = true;
      order.paidAt = order.paidAt || new Date();
      order.paymentStatus = "approved";
    }

    await order.save();
    return res.json({ order: toPublicOrder(order) });
  } catch (error) {
    console.error("Error al actualizar la orden:", error);
    return res.status(500).json({ message: "Error al actualizar el pedido." });
  }
}

module.exports = {
  createGuestOrder,
  getAdminOrders,
  getGuestOrderByToken,
  getUserOrders,
  releaseExpiredOrders,
  syncWompiOrder,
  updateOrderStatus,
  wompiWebhook,
};
