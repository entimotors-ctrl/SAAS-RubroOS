require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { BUSINESS_TYPES } = require('./business-types');
const { requireAuth, requireOwner, requireTenant, requireBusinessType } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const ownerRoutes = require('./routes/owner');
const tallerRoutes = require('./routes/taller');
const barberiaRoutes = require('./routes/barberia');
const agroRoutes = require('./routes/agro');
const ganaderiaRoutes = require('./routes/ganaderia');
const carwashRoutes = require('./routes/carwash');
const aiRoutes = require('./routes/ai');

require('./seed').ensureSeed();

const app = express();

app.use(helmet());

// CORS_ORIGIN acepta una lista separada por comas. En desarrollo, si no se
// define, cae de vuelta al origen por defecto de Vite para no romper el flujo local.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim());
app.use(cors({ origin: corsOrigins }));

// Se guarda el body crudo (bytes exactos) además del JSON ya parseado: la
// verificación de firma X-Hub-Signature-256 de Meta necesita los bytes tal
// cual llegaron, no una re-serialización de req.body (que podría no dar
// byte-a-byte el mismo resultado). No afecta a ninguna otra ruta.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'RubroOS API' }));
app.get('/api/business-types', (req, res) => res.json(BUSINESS_TYPES));

app.use('/api/auth', authRoutes);
app.use('/api/owner', requireAuth, requireOwner, ownerRoutes);

app.use('/api/taller', requireAuth, requireTenant, requireBusinessType('taller'), tallerRoutes);
app.use('/api/barberia', requireAuth, requireTenant, requireBusinessType('barberia'), barberiaRoutes);
app.use('/api/agro', requireAuth, requireTenant, requireBusinessType('agro'), agroRoutes);
app.use('/api/ganaderia', requireAuth, requireTenant, requireBusinessType('ganaderia'), ganaderiaRoutes);
app.use('/api/carwash', requireAuth, requireTenant, requireBusinessType('carwash'), carwashRoutes);

// Chat de IA: no requireBusinessType — funciona igual para cualquier rubro,
// el propio AiContext ya trae el businessType del JWT y filtra las tools.
app.use('/api/ai', requireAuth, requireTenant, aiRoutes);

// Webhook de WhatsApp: sin requireAuth (Meta no manda nuestro JWT), inerte
// hasta que exista vinculación número→usuario. Ver server/src/routes/whatsapp.js.
app.use('/api/whatsapp', require('./routes/whatsapp'));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos (por ejemplo, un arete duplicado).' });
  }
  // Errores de la capa de servicios (server/src/services/*): ya vienen con
  // un mensaje seguro para mostrar al usuario y el status HTTP correcto.
  if (err.name === 'ServiceError' && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`RubroOS API escuchando en http://localhost:${PORT}`));
