const express = require("express");
const { isWompiEnabled } = require("../utils/wompi");

const router = express.Router();

// El frontend consulta esto para mostrar solo los pagos disponibles.
router.get("/config", (req, res) => {
  const wompiEnabled = isWompiEnabled();
  const codEnabled = process.env.ENABLE_COD !== "false";

  res.json({
    provider: "wompi",
    wompiEnabled,
    codEnabled,
    methods: [
      ...(wompiEnabled ? ["wompi"] : []),
      ...(codEnabled ? ["cod"] : []),
    ],
  });
});

module.exports = router;
