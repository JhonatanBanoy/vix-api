const crypto = require("crypto");

const CHECKOUT_URL = "https://checkout.wompi.co/p/";

function getConfig() {
  const environment = (process.env.WOMPI_ENV || "sandbox").toLowerCase();
  const production = environment === "production";

  return {
    environment,
    production,
    publicKey: process.env.WOMPI_PUBLIC_KEY || "",
    privateKey: process.env.WOMPI_PRIVATE_KEY || "",
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET || "",
    eventsSecret: process.env.WOMPI_EVENTS_SECRET || "",
    apiBase: production
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1",
  };
}

function isWompiEnabled() {
  const config = getConfig();
  return Boolean(config.publicKey && config.integritySecret);
}

function isWebhookConfigured() {
  const config = getConfig();
  return Boolean(config.eventsSecret);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Firma de integridad del Web Checkout.
 * Wompi exige: referencia + monto en centavos + moneda [+ expiración] + secreto.
 */
function buildIntegritySignature({
  reference,
  amountInCents,
  currency = "COP",
  expirationTime,
}) {
  const { integritySecret } = getConfig();
  if (!integritySecret) {
    throw new Error("WOMPI_INTEGRITY_SECRET no está configurado");
  }

  const base = `${reference}${amountInCents}${currency}${
    expirationTime ? expirationTime : ""
  }${integritySecret}`;

  return sha256(base);
}

function buildCheckoutUrl({
  reference,
  amountInCents,
  currency = "COP",
  customer = {},
  shippingAddress = {},
  redirectUrl,
  expirationTime,
}) {
  const { publicKey } = getConfig();
  if (!publicKey) {
    throw new Error("WOMPI_PUBLIC_KEY no está configurado");
  }

  const signature = buildIntegritySignature({
    reference,
    amountInCents,
    currency,
    expirationTime,
  });

  const params = new URLSearchParams({
    "public-key": publicKey,
    currency,
    "amount-in-cents": String(amountInCents),
    reference,
    "signature:integrity": signature,
  });

  if (redirectUrl) params.set("redirect-url", redirectUrl);
  if (expirationTime) params.set("expiration-time", expirationTime);

  if (customer.email) params.set("customer-data:email", customer.email);
  if (customer.name) params.set("customer-data:full-name", customer.name);
  if (customer.phone) {
    params.set("customer-data:phone-number", customer.phone);
    params.set("customer-data:phone-number-prefix", "+57");
  }

  if (shippingAddress.address) {
    params.set("shipping-address:address-line-1", shippingAddress.address);
  }
  if (shippingAddress.neighborhood) {
    params.set("shipping-address:address-line-2", shippingAddress.neighborhood);
  }
  if (shippingAddress.city) {
    params.set("shipping-address:city", shippingAddress.city);
  }
  if (shippingAddress.department) {
    params.set("shipping-address:region", shippingAddress.department);
  }
  if (customer.phone) {
    params.set("shipping-address:phone-number", customer.phone);
  }
  params.set("shipping-address:country", "CO");
  if (customer.name) params.set("shipping-address:name", customer.name);

  return `${CHECKOUT_URL}?${params.toString()}`;
}

function getByPath(source, path) {
  return String(path || "")
    .split(".")
    .reduce((value, key) => (value == null ? undefined : value[key]), source);
}

/**
 * Valida la firma del evento transaction.updated.
 * Los campos de signature.properties son rutas relativas a `data`.
 */
function isValidEvent(body, headerChecksum) {
  const { eventsSecret } = getConfig();
  if (!eventsSecret) return false;

  const signature = body?.signature;
  const properties = signature?.properties;
  const checksum = signature?.checksum;
  const timestamp = signature?.timestamp;

  if (!Array.isArray(properties) || !checksum || timestamp === undefined) {
    return false;
  }

  if (headerChecksum && headerChecksum !== checksum) return false;

  const root = body?.data && typeof body.data === "object" ? body.data : body;
  const concatenated = properties
    .map((property) => {
      const normalized = String(property || "").startsWith("data.")
        ? getByPath(body, property)
        : getByPath(root, property);
      return normalized == null ? "" : String(normalized);
    })
    .join("");

  const expected = sha256(`${concatenated}${timestamp}${eventsSecret}`);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(String(checksum), "utf8")
    );
  } catch {
    return false;
  }
}

async function fetchTransaction(transactionId) {
  const { privateKey, apiBase } = getConfig();
  if (!privateKey) {
    throw new Error("WOMPI_PRIVATE_KEY no está configurado");
  }

  const response = await fetch(
    `${apiBase}/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: `Bearer ${privateKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Wompi respondió ${response.status}`);
  }

  const data = await response.json();
  return data?.data || null;
}

module.exports = {
  buildCheckoutUrl,
  buildIntegritySignature,
  fetchTransaction,
  getConfig,
  isWebhookConfigured,
  isWompiEnabled,
  isValidEvent,
};
