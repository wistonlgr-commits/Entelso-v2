const app    = require('./app');
const env    = require('./config/environment');
const db     = require('./config/database');
const logger = require('./common/utils/logger');

let server;

async function start() {
  try {
    // Verificar conexión a la DB antes de arrancar
    await db.query('SELECT 1');
    logger.info('✅ Conexión a PostgreSQL/Supabase verificada.');

    server = app.listen(env.PORT, () =>
      logger.info(`🚀 Backend Entelso escuchando en http://localhost:${env.PORT} [${env.NODE_ENV}]`)
    );
  } catch (err) {
    logger.error('❌ No se pudo conectar a la base de datos al iniciar.', err);
    process.exit(1);
  }
}

const gracefulShutdown = async (signal) => {
  logger.warn(`Señal ${signal} recibida. Cerrando servidor...`);
  server?.close(async () => {
    await db.pool.end();
    logger.info('Servidor y pool de DB cerrados correctamente.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

start();
