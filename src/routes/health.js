const express = require('express');
const router = express.Router();

// Sin autenticación a propósito: sirve para que el VPS (o un monitoreo tipo
// UptimeRobot) chequee que el proceso está vivo, sin necesitar la clave interna.
router.get('/', (req, res) => {
  res.json({ ok: true, servicio: 'lubeck-backend', hora: new Date().toISOString() });
});

module.exports = router;
