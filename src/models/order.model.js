const { Schema, model } = require("mongoose");

const orderItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      default: null,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const shippingAddressSchema = new Schema(
  {
    department: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    neighborhood: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    // Opcional: una orden de invitado no necesita cuenta.
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Token público para consultar el pedido desde la página de gracias.
    publicToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    customer: {
      type: customerSchema,
      required: true,
    },

    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "La orden debe tener al menos un producto",
      },
    },

    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "COP" },

    paymentMethod: {
      type: String,
      enum: ["wompi", "cod", "mercadopago", "paypal"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "approved",
        "declined",
        "voided",
        "error",
        "not_required",
      ],
      default: "pending",
    },
    status: {
      type: String,
      enum: [
        "pending_payment",
        "processing",
        "paid",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending_payment",
    },

    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },

    providerTransactionId: { type: String, default: null },
    providerCheckoutUrl: { type: String, default: null },
    stockReserved: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
  },
  { versionKey: false, timestamps: true }
);

module.exports = model("Order", orderSchema);
