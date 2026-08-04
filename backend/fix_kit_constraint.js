/**
 * Migration: Fix the CHECK constraint on the `items` table to allow tipo='kit'.
 * 
 * The original constraint only allows 'herramienta' and 'consumible'.
 * This script drops that constraint and recreates it to also allow 'kit'.
 * 
 * Usage: node fix_kit_constraint.js
 * Run from the backend directory.
 */
require('dotenv').config();
const db = require('./src/config/database');

async function migrate() {
  console.log('🔧 Fixing CHECK constraint on items table...');
  
  try {
    // Drop the old constraint that doesn't allow 'kit'
    await db.query('ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_stock_consumible');
    console.log('  ✓ Dropped old constraint chk_stock_consumible');

    // Recreate with 'kit' support
    await db.query(`
      ALTER TABLE items ADD CONSTRAINT chk_stock_consumible CHECK (
        (tipo = 'consumible' AND stock_global_consumibles >= 0) OR
        (tipo = 'herramienta') OR
        (tipo = 'kit')
      )
    `);
    console.log('  ✓ Created new constraint with kit support');

    // Also ensure categoria_padre column exists
    await db.query('ALTER TABLE items ADD COLUMN IF NOT EXISTS categoria_padre VARCHAR(100)');
    console.log('  ✓ Ensured categoria_padre column exists');

    console.log('\n✅ Migration complete! Kit creation will now work.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();
