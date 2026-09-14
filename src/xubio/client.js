// Cliente de la API de Xubio (https://xubio.com/API/documentation/index.html).
//
// Confirmado contra la documentación oficial (spec Swagger completo, provisto
// por Xubio el 14/9) y contra pruebas reales hechas con la cuenta de Lubeck:
//   - Token:  POST https://xubio.com/API/1.1/TokenEndpoint
//             grant_type=client_credentials, Basic auth con Client-ID:Secret-ID
//             devuelve { access_token, expires_in, token_type }
//   - Recursos: https://xubio.com/API/1.1/<recurso>  con "Authorization: Bearer <token>"
//     OJO: los nombres de recurso distinguen mayúsculas/minúsculas y NO siguen
//     un patrón único — confirmados: "clienteBean", "comprobanteVentaBean"
//     (facturas, GET/POST), "ProductoVentaBean" (con P y V mayúsculas, catálogo
//     de productos/servicios).
//   - Cómo factura Lubeck hoy en Xubio (confirmado con Leandro): para la
//     inmensa mayoría de las ventas (Factura B) NO registran un cliente por
//     cada persona — usan siempre el mismo cliente genérico "Consumidor
//     Final" y anotan el DNI real en el campo "descripcion" de la factura
//     (que en la pantalla de Xubio se ve como "Observaciones"). Solo para
//     Factura A (con CUIT) registran un cliente de verdad. Por eso
//     crearFacturaVenta() de acá abajo solo cubre el caso Consumidor Final.
//
// ⚠️ IMPORTANTE — esto no es un sandbox: un POST a /comprobanteVentaBean que
// Xubio acepte emite una factura fiscal real, con CAE real de AFIP. No es
// una operación reversible como las lecturas (GET) que se probaron hasta
// ahora. Antes de mandar un POST real (con datos verdaderos, no inventados),
// conviene probarlo primero con un payload deliberadamente incompleto para
// ver qué devuelve Xubio como error de validación (eso es seguro: un pedido
// que Xubio rechaza por datos faltantes no llega a crear nada), y recién
// cuando el payload esté completo, mandarlo con una venta real.
//
// Todavía sin confirmar con certeza (la spec los marca "required" pero varios
// tienen pinta de ser autogenerados por Xubio, no algo que uno deba mandar):
//   - numeroDocumento: se deja sin mandar, asumiendo que Xubio lo asigna solo
//     según la numeración del punto de venta (modo "automático").
//   - vendedor / provincia: la spec los pide, pero Lubeck no usa "vendedores"
//     en Xubio hoy. Quedan como variables de entorno opcionales
//     (XUBIO_VENDEDOR_ID / XUBIO_PROVINCIA_ID) — si Xubio los pide de verdad,
//     el error de validación lo va a decir explícitamente.
//   - condicionDePago: la spec documenta 1=Cuenta Corriente, 2=Contado, pero
//     las facturas reales que vimos tenían 4 y 7 — no coincide. Se usa 2 por
//     default (parece lo más razonable para venta de contado) hasta
//     confirmar qué son esos otros códigos.

const XUBIO_DEFAULTS = {
  clienteConsumidorFinalId: process.env.XUBIO_CLIENTE_CONSUMIDOR_FINAL_ID || '7799597',
  puntoVentaId: process.env.XUBIO_PUNTO_VENTA_ID || '188771',
  listaDePrecioId: process.env.XUBIO_LISTA_PRECIO_ID || '15653',
  depositoId: process.env.XUBIO_DEPOSITO_ID || '-2',
  circuitoContableId: process.env.XUBIO_CIRCUITO_CONTABLE_ID || '-2',
  condicionDePago: Number(process.env.XUBIO_CONDICION_PAGO || 2),
  vendedorId: process.env.XUBIO_VENDEDOR_ID || null,
  provinciaId: process.env.XUBIO_PROVINCIA_ID || null,
};

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
 * Busca un producto en el catálogo de Xubio por nombre exacto (o parecido —
 * Xubio hace el matching de su lado, ver el parámetro "nombre" documentado
 * en GET /ProductoVentaBean). Devuelve el primer resultado o null.
 *
 * Sirve para traducir el nombre de una batería del catálogo propio de Lubeck
 * (ej. "Bateria Lubeck 12/75") al ID real que espera Xubio en las facturas.
 *
 * @param {string} nombre
 * @returns {Promise<{ID:number, nombre:string, codigo:string}|null>}
 */
async function buscarProductoPorNombre(nombre) {
  const data = await xubioRequest(`/ProductoVentaBean?nombre=${encodeURIComponent(nombre)}`);
  const lista = Array.isArray(data) ? data : data ? [data] : [];
  if (lista.length === 0) return null;
  // productoid es el campo real en ProductoVentaBean (no "ID"/"id" como en
  // los objetos "selector" chicos que aparecen dentro de las facturas).
  const p = lista[0];
  return { ID: p.productoid, nombre: p.nombre, codigo: p.codigo };
}

/**
 * Crea una factura de venta (Factura B, Consumidor Final) en Xubio a partir
 * de un servicio ya cerrado.
 *
 * Payload confirmado contra el schema real "ComprobanteVentaBean" de Xubio.
 * Ver el comentario grande al principio de este archivo para las partes
 * todavía no confirmadas al 100% (numeroDocumento, vendedor, provincia,
 * condicionDePago) y la advertencia sobre el CAE real.
 *
 * @param {object} servicio
 * @param {string} servicio.dni
 * @param {string} servicio.nombreCliente - no se usa en el payload (Consumidor
 *   Final no lleva nombre real), pero queda en la firma para cuando se sume
 *   el caso Factura A.
 * @param {string} servicio.tipoServicio - p.ej. "Cambio de batería"
 * @param {string} [servicio.bateria] - nombre del producto en el catálogo de
 *   Xubio (ej. "Bateria Lubeck 12/75") — tiene que existir ahí previamente.
 * @param {number} servicio.precio - precio final, con IVA incluido.
 */
async function crearFacturaVenta(servicio) {
  if (!servicio.bateria) {
    throw new Error(
      'crearFacturaVenta: falta "bateria" — hace falta el nombre exacto del producto ' +
        'tal como está cargado en el catálogo de Xubio (ProductoVentaBean), para poder ' +
        'encontrar su ID y armar el ítem de la factura.'
    );
  }

  const producto = await buscarProductoPorNombre(servicio.bateria);
  if (!producto) {
    throw new Error(
      `crearFacturaVenta: no se encontró en Xubio ningún producto llamado "${servicio.bateria}". ` +
        'Revisá que el nombre coincida exactamente con el catálogo de Xubio (ProductoVentaBean).'
    );
  }

  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const payload = {
    tipo: 1, // Factura
    fecha: hoy,
    fechaVto: hoy,
    descripcion: servicio.dni, // "Observaciones" en la pantalla de Xubio — así buscan al cliente real después
    cliente: { ID: Number(XUBIO_DEFAULTS.clienteConsumidorFinalId) },
    puntoVenta: { ID: Number(XUBIO_DEFAULTS.puntoVentaId) },
    listaDePrecio: { ID: Number(XUBIO_DEFAULTS.listaDePrecioId) },
    deposito: { ID: Number(XUBIO_DEFAULTS.depositoId) },
    circuitoContable: { ID: Number(XUBIO_DEFAULTS.circuitoContableId) },
    condicionDePago: XUBIO_DEFAULTS.condicionDePago,
    cotizacion: 1,
    cotizacionListaDePrecio: 1,
    facturaNoExportacion: false,
    cbuinformada: false,
    transaccionProductoItems: [
      {
        producto: { ID: producto.ID },
        cantidad: 1,
        precio: servicio.precio, // con IVA incluido, según indica la spec
        total: servicio.precio,
        importe: servicio.precio,
        iva: 0,
        montoExento: 0,
        porcentajeDescuento: 0,
        descripcion: servicio.tipoServicio || '',
      },
    ],
    transaccionPercepcionItems: [],
    transaccionCobranzaItems: [],
  };

  if (XUBIO_DEFAULTS.vendedorId) {
    payload.vendedor = { vendedorId: Number(XUBIO_DEFAULTS.vendedorId) };
  }
  if (XUBIO_DEFAULTS.provinciaId) {
    payload.provincia = { ID: Number(XUBIO_DEFAULTS.provinciaId) };
  }

  return xubioRequest('/comprobanteVentaBean', { method: 'POST', body: payload });
}

module.exports = {
  getAccessToken,
  xubioRequest,
  buscarProductoPorNombre,
  crearFacturaVenta,
};
