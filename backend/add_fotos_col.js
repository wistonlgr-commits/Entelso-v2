
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Adding fotos column to activos...');
    await pool.query("ALTER TABLE activos ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb;");
    
    console.log('Adding fotos column to mantenimientos...');
    await pool.query("ALTER TABLE mantenimientos ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb;");
    
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrate();
