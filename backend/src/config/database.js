const { Pool } = require('pg');
const env = require('./environment');

// Supabase siempre requiere SSL. Para PostgreSQL local se puede omitir.
const sslConfig = env.DATABASE_URL.includes('supabase')
  ? { ssl: { rejectUnauthorized: false } }
  : {};

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
  ...sslConfig,
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
  process.exit(1);
});

/**
 * Ejecuta una query parametrizada usando el pool compartido.
 * @param {string} text   — SQL con placeholders $1, $2...
 * @param {any[]}  params — Valores de los parámetros
 */
const query = (text, params) => pool.query(text, params);

module.exports = { query, pool };
