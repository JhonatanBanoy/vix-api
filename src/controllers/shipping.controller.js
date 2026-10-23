const { getShippingQuote } = require("../utils/shipping");

function quote(req, res) {
  const city = String(req.query.city || "").trim();
  const department = String(req.query.department || "").trim();

  if (city.length < 3) {
    return res.status(400).json({
      message: "Ingresa una ciudad válida para calcular el envío.",
    });
  }

  return res.json(getShippingQuote({ city, department }));
}

module.exports = { quote };
