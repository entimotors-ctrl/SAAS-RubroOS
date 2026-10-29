if (process.env.SKIP_ENV_FILE !== '1') require('dotenv').config({ quiet: true });
require('./config/environment').validateEnvironment();
// Permite que los route handlers sean async y que un throw/rejection dentro
// de ellos llegue al error handler de abajo sin envolver cada ruta a mano.
// No-op para handlers síncronos existentes (ver docs/MIGRACION-SUPABASE-POSTGRES.md).
require('express-async-errors');

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
const whatsappIdentityRoutes = require('./routes/whatsappIdentity');

const app = express();

app.use(helmet({contentSecurityPolicy:{directives:{'upgrade-insecure-requests':process.env.NODE_ENV==='production'?[]:null}}}));
if(process.env.TRUST_PROXY==='loopback')app.set('trust proxy','loopback');
const db=require('./db');
const backupManager=require('./maintenance/backups').start(db);
app.locals.backups=backupManager;

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
app.get('/api/ready',async(req,res)=>{try{await db.prepare('SELECT 1').get();res.json({ok:true});}catch{res.status(503).json({ok:false});}});
app.get('/api/business-types', (req, res) => res.json(BUSINESS_TYPES));

app.use('/api/auth', authRoutes);
app.use('/api/owner', requireAuth, requireOwner, ownerRoutes);

app.use('/api/staff-public',require('./routes/staffPublic'));
app.use('/api/staff',requireAuth,requireTenant,require('./routes/staff'));
// Workers cannot reach broad business data through old APIs or the chat.
app.use(['/api/taller','/api/barberia','/api/agro','/api/ganaderia','/api/carwash','/api/ai'],requireAuth,require('../src/security/access').requireAdmin);

app.use('/api/taller', requireAuth, requireTenant, requireBusinessType('taller'), tallerRoutes);
app.use('/api/barberia', requireAuth, requireTenant, requireBusinessType('barberia'), barberiaRoutes);
app.use('/api/agro', requireAuth, requireTenant, requireBusinessType('agro'), agroRoutes);
app.use('/api/ganaderia', requireAuth, requireTenant, requireBusinessType('ganaderia'), ganaderiaRoutes);
app.use('/api/carwash', requireAuth, requireTenant, requireBusinessType('carwash'), carwashRoutes);

// Chat de IA: no requireBusinessType — funciona igual para cualquier rubro,
// el propio AiContext ya trae el businessType del JWT y filtra las tools.
app.use('/api/operations',requireAuth,requireTenant,require('./security/access').requireAdmin,require('./routes/operations'));
app.use('/api/ai', requireAuth, requireTenant, aiRoutes);

// Configuración de la vinculación (requiere sesión normal de RubroOS,
// distinto del webhook de abajo que Meta llama sin JWT).
app.use('/api/whatsapp-identity', requireAuth, requireTenant, whatsappIdentityRoutes);

// Webhook de WhatsApp: sin requireAuth (Meta no manda nuestro JWT). Solo
// actúa sobre números ya vinculados (ver server/src/whatsapp/identityResolver.js).
app.use('/api/whatsapp', require('./routes/whatsapp'));

if (process.env.LOCAL_DEMO === '1' || process.env.SERVE_WEB === '1') {
  const path=require('path');
  if(!require('fs').existsSync(path.resolve(__dirname,'../../web/dist/index.html')))throw Error('Compila el frontend antes de iniciar SERVE_WEB');
  app.use(express.static(path.resolve(__dirname,'../../web/dist')));
  app.get(/^(?!\/api(?:\/|$)).*/, (req,res)=>res.sendFile(path.resolve(__dirname,'../../web/dist/index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if(err.type==='entity.parse.failed')return res.status(400).json({error:'JSON inválido'});
  if(err.type==='entity.too.large')return res.status(413).json({error:'Solicitud demasiado grande'});
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === '23505') {
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

// ensureSeed() ya es async (Fase 2: toda la capa de datos lo es) — el
// servidor solo empieza a aceptar conexiones después de que la cuenta owner
// (y, en desarrollo, los tenants demo) queden creados. Si ensureSeed()
// rechaza (p. ej. falta OWNER_SEED_PASSWORD), el proceso nunca llega a
// escuchar — mismo comportamiento que el throw síncrono de antes.
const PORT = process.env.PORT || 4000;
require('./seed').ensureSeed().then(() => {
  const server = app.listen(PORT, process.env.LOCAL_DEMO === '1' ? '127.0.0.1' : process.env.HOST || '127.0.0.1', () => console.log(`RubroOS API escuchando en http://localhost:${PORT}`));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{const backupsFinished=backupManager.stop();server.close(async()=>{await backupsFinished;db.close();process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();});
}).catch((err) => { console.error(err); process.exit(1); });
