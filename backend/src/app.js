const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');

const env          = require('./config/environment');
const errorHandler = require('./common/middleware/error.middleware');
const res          = require('./common/utils/apiResponse');

const app = express();

// ── Seguridad ────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map(s => s.trim()),
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization','X-API-Key','X-Ingest-Secret'],
}));
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 1500 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: res.error('Demasiadas peticiones. Intenta más tarde.', 'RATE_LIMIT_EXCEEDED'),
}));

// ── Parseo y logging ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Health check (sin auth, para Docker) ─────────────────────────────────
app.get('/health', (_, reply) =>
  reply.json({ status: 'UP', env: env.NODE_ENV, ts: new Date().toISOString() })
);

// ── Rutas de la API ───────────────────────────────────────────────────────
app.use('/api/auth',        require('./modules/auth/auth.routes'));        // pública
app.use('/api/ingest',      require('./modules/ingest/ingest.routes'));    // protegida por X-Ingest-Secret
app.use('/api/alertas',     require('./modules/alertas/alertas.routes'));  // protegida por JWT
app.use('/api/activos',     require('./modules/activos/activos.routes'));  // protegida por JWT
app.use('/api/items',       require('./modules/items/items.routes'));       // protegida por JWT
app.use('/api/movimientos', require('./modules/movimientos/movimientos.routes')); // protegida por JWT
app.use('/api/usuarios',    require('./modules/usuarios/usuarios.routes')); // protegida por JWT
app.use('/api/ubicaciones', require('./modules/ubicaciones/ubicaciones.routes')); // protegida por JWT
app.use('/api/mantenimientos', require('./modules/mantenimientos/mantenimientos.routes')); // protegida por JWT
app.use('/api/audit',          require('./modules/audit/audit.routes')); // protegida por JWT
app.use('/api/whatsapp', require('./modules/whatsapp/whatsapp.routes')); // protegida por PIN interno
app.use('/api/teams',    require('./modules/teams/teams.routes'));        // protegida por JWT

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, reply) =>
  reply.status(404).json(res.error(`${req.method} ${req.originalUrl} no existe.`, 'NOT_FOUND'))
);

// ── Error handler global ──────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
