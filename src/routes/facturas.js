const express = require('express');
const { crearFacturaVenta } = require('../xubio/client');
const { enviarFacturaPorWhatsApp } = require('../whatsapp/client');

const router = express.Router();

// POST /api/facturas
// Body esperado (lo que la app del técnico manda al cerrar un servicio):
// {
//   "dni": "28.451.902",
//   "nombreCliente": "Roberto Fassi",
//   "telefono": "5491155662201",
//   "tipoServicio": "Cambio de batería",
//   "bateria": "Moura M22FD",
//   "precio": 145000,
//   "medioPago": "Contado (efectivo)",   // 29/9: opcional — ver normalizarMedioPago() en xubio/client.js.
//                                        // Acepta "Tarjeta de crédito" / "Tarjeta de débito" / "Contado (efectivo)" /
//                                        // "Transferencia" / "Cuenta corriente". Si no viene, usa el default (Contado).
//   "comentarios": "..."
// }
//
// 29/9: además de crear la factura en Xubio, este endpoint ahora intenta
// avisarle al cliente por WhatsApp automáticamente (si vino "telefono" en
// el body) — antes eran dos pasos sueltos (crear factura acá, mandar el
// WhatsApp aparte con POST /api/whatsapp/enviar). Ver la nota grande más
// abajo sobre por qué un fallo del WhatsApp NO hace fallar la respuesta.
router.post('/', async (req, res) => {
  const { dni, nombreCliente, precio, tipoServicio, telefono } = req.body || {};

  if (!dni || !nombreCliente || !precio || !tipoServicio) {
    return res.status(400).json({
      error: 'Faltan datos obligatorios: dni, nombreCliente, tipoServicio y precio.',
    });
  }

  let factura;
  try {
    factura = await crearFacturaVenta(req.body);
  } catch (err) {
    // 28/9: antes esto solo devolvía err.message ("Xubio respondió 401 en
    // POST /facturar"), que es justo el código de estado enganoso que viene
    // repitiéndose en toda esta integración — no dice CUÁL fue el error de
    // validación real. Ahora también devolvemos err.body ("detalle"), que
    // es donde Xubio manda el mensaje real (ej. la FunctionalException que
    // explicó soporte) — mismo campo que ya usa xubio-debug.js.
    return res.status(err.status || 501).json({ ok: false, error: err.message, detalle: err.body });
  }

  // ⚠️ IMPORTANTE: la factura YA se creó en este punto — es un documento
  // fiscal real, con CAE de AFIP/ARCA, y no se puede "deshacer" simplemente
  // porque el WhatsApp falle (por ejemplo, mientras Meta Business Manager
  // todavía no esté configurado — ver whatsapp/client.js). Por eso el envío
  // de WhatsApp va en su propio try/catch, aparte, y un error ahí NO hace
  // fallar la respuesta de este endpoint — solo se informa en el campo
  // "whatsapp" de la respuesta, para que se pueda reintentar el envío a
  // mano (con POST /api/whatsapp/enviar) sin tener que facturar de nuevo.
  let whatsapp;
  if (!telefono) {
    whatsapp = { enviado: false, motivo: 'No se intentó: no vino "telefono" en el pedido.' };
  } else {
    try {
      const resultado = await enviarFacturaPorWhatsApp({
        telefono,
        nombreCliente,
        monto: precio,
      });
      whatsapp = { enviado: true, resultado };
    } catch (err) {
      whatsapp = { enviado: false, motivo: err.message, detalle: err.body };
    }
  }

  res.json({ ok: true, factura, whatsapp });
});

module.exports = router;
