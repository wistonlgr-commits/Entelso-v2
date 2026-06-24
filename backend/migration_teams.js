const db = require('./src/config/database');

async function migrate() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(80) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Seed with current teams
    const teams = ['Transmission', 'Energy', 'Networks', 'Maintenance', 'Calibration', 'Instrumentation', 'Civil Works', 'IT / Infrastructure'];
    for (const t of teams) {
      await db.query('INSERT INTO teams (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [t]);
    }
    
    console.log('Migration complete: teams table created and seeded.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

migrate();
