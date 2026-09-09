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
    // Mientras crearFacturaVenta() no esté completada (ver src/xubio/client.js),
    // esto va a devolver ese error explicando qué falta — es lo esperado por ahora.
    res.status(501).json({ ok: false, error: err.message });
  }
});

module.exports = router;
