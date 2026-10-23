const express = require("express");
const { quote } = require("../controllers/shipping.controller");

const router = express.Router();

// Público: el checkout lo usa para mostrar el envío antes de pagar.
router.get("/quote", quote);

module.exports = router;
