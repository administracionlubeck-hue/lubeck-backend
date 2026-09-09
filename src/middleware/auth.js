// Todas las rutas que pasan por acá exigen el header:
//   Authorization: Bearer <INTERNAL_API_KEY>
// Esta clave la comparten SOLO este backend y las apps internas de Lubeck
// (la app del técnico, el panel de despacho). No tiene nada que ver con
// las claves de Xubio ni de WhatsApp — esas nunca salen de este servidor.

module.exports = function authMiddleware(req, res, next) {
  if (!process.env.INTERNAL_API_KEY) {
    return res.status(500).json({
      error: 'El servidor no tiene configurada INTERNAL_API_KEY (revisá el .env).',
    });
  }

  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!token || token !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  next();
};
