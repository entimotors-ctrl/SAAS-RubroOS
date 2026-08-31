const express = require('express');
const cors = require('cors');

const { BUSINESS_TYPES } = require('./business-types');
const { requireAuth, requireOwner, requireTenant, requireBusinessType } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const ownerRoutes = require('./routes/owner');
const tallerRoutes = require('./routes/taller');
const barberiaRoutes = require('./routes/barberia');
const agroRoutes = require('./routes/agro');
const ganaderiaRoutes = require('./routes/ganaderia');
const carwashRoutes = require('./routes/carwash');

require('./seed').ensureSeed();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'RubroOS API' }));
app.get('/api/business-types', (req, res) => res.json(BUSINESS_TYPES));

app.use('/api/auth', authRoutes);
app.use('/api/owner', requireAuth, requireOwner, ownerRoutes);

app.use('/api/taller', requireAuth, requireTenant, requireBusinessType('taller'), tallerRoutes);
app.use('/api/barberia', requireAuth, requireTenant, requireBusinessType('barberia'), barberiaRoutes);
app.use('/api/agro', requireAuth, requireTenant, requireBusinessType('agro'), agroRoutes);
app.use('/api/ganaderia', requireAuth, requireTenant, requireBusinessType('ganaderia'), ganaderiaRoutes);
app.use('/api/carwash', requireAuth, requireTenant, requireBusinessType('carwash'), carwashRoutes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos (por ejemplo, un arete duplicado).' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`RubroOS API escuchando en http://localhost:${PORT}`));
