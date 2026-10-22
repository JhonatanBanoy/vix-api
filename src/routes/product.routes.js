const express = require("express");
const { check } = require("express-validator");
const router = express.Router();

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,   // <-- agrega esto
  deleteProduct
} = require("../controllers/product.controller");

const validateFields = require("../middlewares/validateFields");
const authenticateToken = require("../middlewares/authMiddleware");
const checkRole = require("../middlewares/roleMiddleware");

// ✅ Obtener todos los productos (público)
router.get("/", getProducts);

// ✅ Obtener un producto por ID (público)
router.get(
  "/:id",
  [
    check("id", "El ID debe ser un ObjectId válido").isMongoId(),
    validateFields,
  ],
  getProductById
);

// ✅ Crear un producto (privado: solo admins con token)
router.post(
  "/",
  [
    authenticateToken,
    checkRole(["admin"]),
    check("name", "El nombre es obligatorio").not().isEmpty(),
    check("price", "El precio debe ser un número válido").isFloat({ gt: 0 }),
    validateFields,
  ],
  createProduct
);



// ✅ Actualizar un producto (privado: solo admins con token)
router.put(
  "/:id",
  [
    authenticateToken,
    checkRole(["admin"]),
    check("id", "El ID debe ser válido").isMongoId(),
    validateFields,
  ],
  updateProduct
);

// ✅ Eliminar un producto (privado: solo admins con token)
router.delete(
  "/:id",
  [
    authenticateToken,
    checkRole(["admin"]),
    check("id", "El ID debe ser válido").isMongoId(),
    validateFields,
  ],
  deleteProduct
);

module.exports = router;
