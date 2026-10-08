const db = require('../config/database');

module.exports = async function runMigration() {
  console.log('[Migration] Running 20261008_add_cantidad_sin_stock...');
  
  try {
    // 1. Add 'sin_stock' to estado_activo_enum safely
    try {
      await db.query(`ALTER TYPE estado_activo_enum ADD VALUE IF NOT EXISTS 'sin_stock'`);
      console.log('[Migration] Added sin_stock to estado_activo_enum');
    } catch (e) {
      if (e.code === '42710') {
        // duplicate_object error code
        console.log('[Migration] sin_stock already exists in enum');
      } else {
        console.error('[Migration] Failed to add sin_stock to enum:', e.message);
      }
    }

    // 2. Add cantidad column to activos if not exists
    await db.query(`ALTER TABLE activos ADD COLUMN IF NOT EXISTS cantidad INT NOT NULL DEFAULT 1`);
    console.log('[Migration] Added cantidad column to activos');

    console.log('[Migration] 20261008_add_cantidad_sin_stock completed successfully.');
  } catch (err) {
    console.error('[Migration] Error:', err.message);
  }
};
