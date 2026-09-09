require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authMiddleware = require('./middleware/auth');
const healthRoutes = require('./routes/health');
const facturaRoutes = require('./routes/facturas');
const whatsappRoutes = require('./routes/whatsapp');
const xubioDebugRoutes = require('./routes/xubio-debug');

const app = express();

// Habilitado para cualquier origen mientras probamos (consola de pruebas,
// prototipos en claude.ai, etc.). Cuando el panel tenga un dominio fijo
// (Netlify/Vercel/GitHub Pages), conviene restringir esto a ese dominio
// en vez de dejarlo abierto a cualquiera.
app.use(cors());

app.use(express.json());

// Sin autenticación: chequeo de salud del servicio.
app.use('/health', healthRoutes);

// De acá para abajo, todo pide "Authorization: Bearer <INTERNAL_API_KEY>".
app.use(authMiddleware);

app.use('/api/facturas', facturaRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/xubio', xubioDebugRoutes);

// Manejo de errores por las dudas de que algo se escape sin capturar.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`lubeck-backend escuchando en el puerto ${PORT}`);
});
