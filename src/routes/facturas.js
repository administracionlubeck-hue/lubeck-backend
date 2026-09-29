const express = require('express');
const { crearFacturaVenta } = require('../xubio/client');

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
router.post('/', async (req, res) => {
  const { dni, nombreCliente, precio, tipoServicio } = req.body || {};

  if (!dni || !nombreCliente || !precio || !tipoServicio) {
    return res.status(400).json({
      error: 'Faltan datos obligatorios: dni, nombreCliente, tipoServicio y precio.',
    });
  }

  try {
    const factura = await crearFacturaVenta(req.body);
    res.json({ ok: true, factura });
  } catch (err) {
    // 28/9: antes esto solo devolvía err.message ("Xubio respondió 401 en
    // POST /facturar"), que es justo el código de estado enganoso que viene
    // repitiéndose en toda esta integración — no dice CUÁL fue el error de
    // validación real. Ahora también devolvemos err.body ("detalle"), que
    // es donde Xubio manda el mensaje real (ej. la FunctionalException que
    // explicó soporte) — mismo campo que ya usa xubio-debug.js.
    res.status(err.status || 501).json({ ok: false, error: err.message, detalle: err.body });
  }
});

module.exports = router;
