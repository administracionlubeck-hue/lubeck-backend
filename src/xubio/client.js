// Cliente de la API de Xubio (https://xubio.com/API/documentation/index.html).
//
// Confirmado contra la documentación oficial:
//   - Token:  POST https://xubio.com/API/1.1/TokenEndpoint
//             grant_type=client_credentials, Basic auth con Client-ID:Secret-ID
//             devuelve { access_token, expires_in, token_type }
//   - Recursos: https://xubio.com/API/1.1/<recurso>  con "Authorization: Bearer <token>"
//
// NO confirmado todavía (no hay forma de verlo sin estar logueado en la cuenta
// real de Xubio, ni de probarlo desde este entorno — ver README):
//   - El JSON exacto que espera facturaVenta al crear una factura.
//   - El JSON exacto de clienteBean para buscar/crear un cliente por DNI.
//
// Por eso getAccessToken() y xubioRequest() son de fiar tal cual están.
// crearFacturaVenta() es un punto de partida: hay que completarlo mirando
// un ejemplo real (ver GET /api/xubio/recurso/:nombre en las rutas).

const BASE_URL = 'https://xubio.com/API/1.1';

let cachedToken = null;
let cachedTokenExpiresAt = 0; // epoch ms

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.XUBIO_CLIENT_ID;
  const secretId = process.env.XUBIO_SECRET_ID;
  if (!clientId || !secretId) {
    throw new Error('Faltan XUBIO_CLIENT_ID / XUBIO_SECRET_ID en el .env.');
  }

  const basicAuth = Buffer.from(`${clientId}:${secretId}`).toString('base64');

  const resp = await fetch(`${BASE_URL}/TokenEndpoint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: 'grant_type=client_credentials',
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Xubio no dio token (HTTP ${resp.status}): ${text.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Xubio devolvió algo que no es JSON: ${text.slice(0, 300)}`);
  }

  if (!data.access_token) {
    throw new Error(`La respuesta de Xubio no trae access_token: ${text.slice(0, 300)}`);
  }

  cachedToken = data.access_token;
  // Restamos 60s de margen para no usarlo justo cuando está por vencer.
  const ttlSeconds = Number(data.expires_in || 3600) - 60;
  cachedTokenExpiresAt = now + Math.max(ttlSeconds, 30) * 1000;

  return cachedToken;
}

// Helper genérico para pegarle a cualquier recurso de Xubio ya autenticado.
async function xubioRequest(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();

  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!resp.ok) {
    const err = new Error(`Xubio respondió ${resp.status} en ${method} ${path}`);
    err.status = resp.status;
    err.body = data;
    throw err;
  }

  return data;
}

/**
 * Crea una factura de venta en Xubio a partir de un servicio ya cerrado.
 *
 * TODO — falta completar antes de usar esto en serio:
 * el "payload" de acá abajo es un ejemplo razonable (parecido a otras APIs
 * de facturación argentinas: punto de venta, tipo de comprobante, cliente,
 * detalle de items), pero NO está confirmado contra el schema real de Xubio.
 *
 * Cómo terminarlo (ver README, sección "Antes de usar esto en producción"):
 *   1. GET /api/xubio/recurso/facturaVenta  → mirar una factura real ya
 *      cargada a mano en Xubio, y copiar exactamente esos nombres de campo.
 *   2. GET /api/xubio/recurso/clienteBean   → lo mismo para el cliente.
 *   3. Ajustar el objeto "payload" de acá abajo para que calce.
 *
 * @param {object} servicio
 * @param {string} servicio.dni
 * @param {string} servicio.nombreCliente
 * @param {string} servicio.tipoServicio - p.ej. "Cambio de batería"
 * @param {string} [servicio.bateria] - p.ej. "Moura M22FD"
 * @param {number} servicio.precio
 */
async function crearFacturaVenta(servicio) {
  throw new Error(
    'crearFacturaVenta: todavía no está completado el schema real de Xubio. ' +
      'Mirá GET /api/xubio/recurso/facturaVenta para ver el formato de una factura existente, ' +
      'y completá esta función en src/xubio/client.js (ver el comentario de arriba).'
  );

  // Ejemplo de por dónde va a venir, una vez confirmado el schema real:
  // const payload = {
  //   cliente: { dni: servicio.dni, nombre: servicio.nombreCliente },
  //   detalle: [
  //     { producto: servicio.bateria || servicio.tipoServicio, cantidad: 1, precioUnitario: servicio.precio },
  //   ],
  // };
  // return xubioRequest('/facturaVenta', { method: 'POST', body: payload });
}

module.exports = {
  getAccessToken,
  xubioRequest,
  crearFacturaVenta,
};
