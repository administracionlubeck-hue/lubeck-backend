const express = require('express');
const { enviarFacturaPorWhatsApp } = require('../whatsapp/client');

const router = express.Router();

// POST /api/whatsapp/enviar
// Body esperado:
// {
//   "telefono": "5491155662201",   // E.164 sin "+"
//   "nombreCliente": "Roberto Fassi",
//   "monto": "145.000"
// }
router.post('/enviar', async (req, res) => {
  const { telefono, nombreCliente, monto } = req.body || {};

  if (!telefono || !nombreCliente || monto === undefined) {
    return res.status(400).json({ error: 'Faltan datos: telefono, nombreCliente y monto.' });
  }

  try {
    const resultado = await enviarFacturaPorWhatsApp({ telefono, nombreCliente, monto });
    res.json({ ok: true, resultado });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
});

module.exports = router;
