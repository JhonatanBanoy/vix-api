# Activar pagos con Wompi

El checkout ya está preparado para Wompi. Mientras no existan las llaves,
la tienda muestra **pago contra entrega** y el pago en línea queda oculto.

## 1. Abrir la cuenta de comercio

**Crear la cuenta no tiene costo de vinculación ni mensualidad.** Wompi cobra
una comisión solo cuando una venta se completa. La tarifa publicada del Plan
Avanzado es:

- **2,65% + $700 + IVA por transacción exitosa** (tarjetas, PSE, Nequi, etc.).
- El Código QR tiene una tarifa especial del 1%, pero no aplica al checkout web.

Confirma la tarifa vigente en <https://wompi.com/es/co/planes-tarifas/> antes de
publicar precios.

Wompi es de Bancolombia. Para una cuenta de **persona natural** necesitas:

- Cédula del titular.
- RUT actualizado (sin contraseña).
- Cuenta Bancolombia de ahorros o corriente a nombre del titular, con más de
  30 días de antigüedad. Nequi puede servir para persona natural, pero confirma
  con Wompi antes de iniciar el trámite.
- Correo y teléfono reales.
- Una URL pública de la tienda. `localhost` no sirve para producción: primero
  hay que desplegar el frontend y el backend con HTTPS.

El primer desembolso para persona natural se hace **30 días después de la
primera venta**. Los siguientes desembolsos son al siguiente día hábil.

Regístrate en <https://registro.wompi.co/es/onboarding/aggregator>, elige
**Persona Natural**, crea tu usuario y tu comercio, y carga los documentos.
Wompi revisa la solicitud; no es instantáneo.

Cuando te aprueben, entra a **Desarrolladores > Secretos para integración
técnica**. Allí están las cuatro credenciales:

- Llave pública (`pub_test_...` o `pub_prod_...`).
- Llave privada (`prv_test_...` o `prv_prod_...`).
- Secreto de integridad (`test_integrity_...` o `prod_integrity_...`).
- Secreto de eventos.

> No pongas estas llaves en el frontend ni las subas a GitHub. Van solo en el
> archivo `.env` del backend.

## 2. Configurar el backend

Edita `ecommerce-api/ecommerce-api/.env`:

```env
FRONTEND_URL=https://tudominio.com
WOMPI_ENV=sandbox
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_PRIVATE_KEY=prv_test_...
WOMPI_INTEGRITY_SECRET=test_integrity_...
WOMPI_EVENTS_SECRET=...
```

Para pruebas usa el ambiente **sandbox**. Cuando ya hayas probado todo,
cambia a `WOMPI_ENV=production` y reemplaza las cuatro credenciales por las de
producción.

Reinicia el backend después de cambiar el `.env`:

```bash
docker compose restart api
```

## 3. Configurar el webhook

En el dashboard de Wompi entra a **Desarrollo > Eventos**, agrega una URL y
selecciona el evento `transaction.updated`. La URL debe ser pública y HTTPS:

```text
https://api.tudominio.com/api/orders/wompi/webhook
```

Wompi enviará el evento `transaction.updated`. El backend valida la firma con
`WOMPI_EVENTS_SECRET` y actualiza la orden. La página de gracias no marca un
pago como aprobado: solo el webhook (o la consulta autenticada a Wompi) puede
hacerlo.

La URL de eventos debe ser del mismo ambiente que las llaves: si usas llaves
`test`, configura la URL de pruebas; si usas llaves `prod`, configura la de
producción. Para probar en local necesitas una URL pública con HTTPS (por
ejemplo, ngrok) y configurarla tanto en `FRONTEND_URL` como en el dashboard de
Wompi.

## 4. Cómo comprobar que quedó activo

```bash
curl http://localhost:5000/api/payments/config
```

Debe responder:

```json
{
  "provider": "wompi",
  "wompiEnabled": true,
  "codEnabled": true,
  "methods": ["wompi", "cod"]
}
```

El checkout mostrará automáticamente la opción **Pago en línea**. Si
`wompiEnabled` sigue en `false`, revisa que las llaves estén completas y que
el backend se haya reiniciado.

## 5. Tarifas de envío

Las tarifas provisionales están en:

```text
src/utils/shipping.js
```

Allí puedes cambiar:

- Bogotá: `$ 8.000`
- Medellín, Cali y Barranquilla: `$ 12.000`
- Resto del país: `$ 18.000`

El frontend consulta esas tarifas al backend, así que no hay que duplicarlas.

## 6. Antes de recibir dinero real

- Actualiza los precios de los productos a pesos colombianos reales. Varios
  productos de prueba están en `$ 1.250`, `$ 890`, etc., que no cubren ni el
  envío.
- Revisa el stock de cada producto.
- Configura un correo real para las confirmaciones (Resend) si lo vas a usar.
- Usa HTTPS en el frontend y en el backend.
- Haz una compra de prueba completa en sandbox y verifica que la orden cambie
  a `paymentStatus: approved` y `status: processing`.
