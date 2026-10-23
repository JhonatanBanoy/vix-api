// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");

// Importar las rutas
const productRoutes = require("./routes/product.routes");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const ordersRouter = require("./routes/order.routes");
const shippingRoutes = require("./routes/shipping.routes");
const paymentRoutes = require("./routes/payment.routes");

const app = express();

// Conexión a MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Conectado a la base de datos de MongoDB"))
  .catch((error) => {
    // No imprimir la URI: puede contener credenciales.
    console.error("Error al conectar con MongoDB:", error.message);
  });

// Middlewares
app.use(express.json({ limit: "1mb" }));
app.use(cors());
app.use(morgan("dev"));

// Rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/auth", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", ordersRouter);
app.use("/api/shipping", shippingRoutes);
app.use("/api/payments", paymentRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "vix-api" });
});

// Ruta principal
app.get("/", (req, res) => {
  res.send("API Ecommerce funcionando 🚀");
});

// Puerto
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
