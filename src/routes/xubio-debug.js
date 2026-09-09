// Rutas de diagnóstico para terminar de conectar Xubio.
// Todas requieren la clave interna (INTERNAL_API_KEY), igual que el resto.

const express = require('express');
const { getAccessToken, xubioRequest } = require('../xubio/client');

const router = express.Router();

// GET /api/xubio/test-token
// Confirma que XUBIO_CLIENT_ID / XUBIO_SECRET_ID funcionan de verdad,
// pidiendo un token real. Esto NO se puede probar desde el entorno de
// Claude (la red de ese entorno bloquea xubio.com) — probarlo desde acá,
// ya desplegado en el VPS o corriendo local en tu computadora.
router.get('/test-token', async (req, res) => {
  try {
    await getAccessToken();
    res.json({ ok: true, mensaje: 'Se pudo obtener un token de Xubio correctamente.' });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// GET /api/xubio/recurso/:nombre
// Pasamanos genérico a cualquier recurso de la API de Xubio (GET).
// Usalo para ver el formato real de tus propios datos, por ejemplo:
//   GET /api/xubio/recurso/facturaVenta
//   GET /api/xubio/recurso/clienteBean
// y así completar crearFacturaVenta() en src/xubio/client.js con los
// nombres de campo reales en vez de los de ejemplo.
router.get('/recurso/:nombre', async (req, res) => {
  try {
    const data = await xubioRequest(`/${req.params.nombre}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message, detalle: err.body });
  }
});

module.exports = router;
