/**
 * Tarifas provisionales de envío.
 *
 * El checkout y el backend usan esta misma tabla, así el total que ve el
 * cliente siempre coincide con el que se guarda en la orden.
 *
 * Para cambiarlas solo hay que editar los valores de ZONE_RATES.
 */
const ZONE_RATES = {
  bogota: 8000,
  medellin: 12000,
  cali: 12000,
  barranquilla: 12000,
};

const ZONE_LABELS = {
  bogota: "Bogotá",
  medellin: "Medellín y área metropolitana",
  cali: "Cali",
  barranquilla: "Barranquilla",
};

const DEFAULT_RATE = 18000;

/** Ciudades del área metropolitana de Medellín que comparten tarifa. */
const MEDELLIN_AREA = [
  "medellin",
  "envigado",
  "bello",
  "itagui",
  "sabaneta",
  "la estrella",
  "copacabana",
  "girardota",
  "barbosa",
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function getZone(city) {
  const normalized = normalize(city);

  if (!normalized) {
    return { zone: "unknown", rate: 0, label: "Sin ciudad" };
  }

  if (normalized.includes("bogota")) {
    return { zone: "bogota", rate: ZONE_RATES.bogota, label: ZONE_LABELS.bogota };
  }

  if (MEDELLIN_AREA.some((name) => normalized === name || normalized.includes(name))) {
    return {
      zone: "medellin",
      rate: ZONE_RATES.medellin,
      label: ZONE_LABELS.medellin,
    };
  }

  if (normalized.includes("cali")) {
    return { zone: "cali", rate: ZONE_RATES.cali, label: ZONE_LABELS.cali };
  }

  if (normalized.includes("barranquilla")) {
    return {
      zone: "barranquilla",
      rate: ZONE_RATES.barranquilla,
      label: ZONE_LABELS.barranquilla,
    };
  }

  return {
    zone: "resto",
    rate: DEFAULT_RATE,
    label: "Resto del país",
  };
}

function getShippingQuote({ city, department } = {}) {
  const result = getZone(city);

  return {
    city: String(city || "").trim(),
    department: String(department || "").trim(),
    currency: "COP",
    zone: result.zone,
    zoneLabel: result.label,
    rate: result.rate,
  };
}

module.exports = {
  DEFAULT_RATE,
  ZONE_RATES,
  getShippingQuote,
  normalize,
};
