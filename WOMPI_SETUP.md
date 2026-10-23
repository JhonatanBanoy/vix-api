# Activar pagos con Wompi

El checkout ya está preparado para Wompi. Mientras no existan las llaves,
la tienda muestra **pago contra entrega** y el pago en línea queda oculto.

## 1. Abrir la cuenta de comercio

Wompi es de Bancolombia. Para recibir desembolsos necesitas:

- RUT actualizado (persona natural o jurídica).
- Cédula del titular.
- Cuenta Bancolombia de ahorros o corriente a nombre del titular.
  También puedes usar Nequi si eres persona natural y la cuenta tiene más de
  30 días.
- Correo de contacto real.

Regístrate en <https://comercios.wompi.co/> y completa la vinculación. Wompi
te entrega cuatro credenciales desde **Desarrolladores > Secretos para
integración técnica**:

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

En el dashboard de Wompi, configura la URL de eventos:

```text
https://api.tudominio.com/api/orders/wompi/webhook
```

Wompi enviará el evento `transaction.updated`. El backend valida la firma con
`WOMPI_EVENTS_SECRET` y actualiza la orden. La página de gracias no marca un
pago como aprobado: solo el webhook (o la consulta autenticada a Wompi) puede
hacerlo.

Para probar en local necesitas una URL pública con HTTPS (por ejemplo,
ngrok) y configurarla tanto en `FRONTEND_URL` como en el dashboard de Wompi.

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
