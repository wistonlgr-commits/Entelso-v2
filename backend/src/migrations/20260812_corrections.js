const db = require('../config/database');

module.exports = async function runMigration() {
  console.log('[Migration] Running 20260812_corrections...');
  
  try {
    // 1. Add marca column if not exists
    await db.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS marca VARCHAR(100)`);
    console.log('[Migration] Added marca column');

    // 2. Extract brands from item names (known brands)
    const brands = [
      'DeWalt', 'Hilti', 'Fluke', 'Brady', 'Ryobi', 'VIAVI', 'Panduit',
      'Craftright', 'RIDGID', 'TOLSEN', 'B-Safe', 'Bailey', 'Kaelus',
      'CordTech', 'Frost', 'Arlec', 'Samsung', 'Dell', 'Nutan', 'JMA',
      'Makita', 'Milwaukee', 'Bosch', 'Metabo', 'Knipex', 'Wiha',
      'Klein', 'Stanley', 'Irwin', 'Torque', 'AIMOS'
    ];
    for (const brand of brands) {
      const { rowCount } = await db.query(
        `UPDATE items SET marca = $1 WHERE LOWER(nombre) LIKE $2 AND (marca IS NULL OR marca = '')`,
        [brand, `%${brand.toLowerCase()}%`]
      );
      if (rowCount > 0) console.log(`[Migration] Set brand '${brand}' on ${rowCount} items`);
    }

    // 3. Rename categories
    // PIM Testers → Testing Equipment
    await db.query(`UPDATE items SET categoria_padre = 'Testing Equipment' WHERE categoria_padre = 'PIM Testers'`);
    // Levelling Kits → Testing Equipment
    await db.query(`UPDATE items SET categoria_padre = 'Testing Equipment' WHERE categoria_padre = 'Levelling Kits'`);
    // CW Testers → Testing Equipment
    await db.query(`UPDATE items SET categoria_padre = 'Testing Equipment' WHERE categoria_padre = 'CW Testers'`);
    // Sweep Testers → Testing Equipment
    await db.query(`UPDATE items SET categoria_padre = 'Testing Equipment' WHERE categoria_padre = 'Sweep Testers'`);
    console.log('[Migration] Renamed test categories to Testing Equipment');

    // 4. Split Handy Tools into Hand Tools and Power Tools
    // Power tools: anything with drill, grinder, driver, hammer, vacuum, cordless (battery), 18V, 12V, brushless, impac
    await db.query(`
      UPDATE items SET categoria_padre = 'Power Tools' 
      WHERE categoria_padre = 'Handy Tools' AND (
        LOWER(nombre) LIKE '%drill%' OR LOWER(nombre) LIKE '%grinder%' 
        OR LOWER(nombre) LIKE '%driver%' OR LOWER(nombre) LIKE '%hammer%' 
        OR LOWER(nombre) LIKE '%vacuum%' OR LOWER(nombre) LIKE '%cordless%'
        OR LOWER(nombre) LIKE '%battery%' OR LOWER(nombre) LIKE '%charger%'
        OR LOWER(nombre) LIKE '%18v%' OR LOWER(nombre) LIKE '%12v%' 
        OR LOWER(nombre) LIKE '%brushless%' OR LOWER(nombre) LIKE '%impac%'
        OR LOWER(nombre) LIKE '%22v%' OR LOWER(nombre) LIKE '%20v%'
        OR LOWER(nombre) LIKE '%li-ion%' OR LOWER(nombre) LIKE '%lithium%'
        OR LOWER(nombre) LIKE '%angle grinder%'
      )
    `);
    // Remaining Handy Tools → Hand Tools
    await db.query(`UPDATE items SET categoria_padre = 'Hand Tools' WHERE categoria_padre = 'Handy Tools'`);
    console.log('[Migration] Split Handy Tools into Hand Tools / Power Tools');

    // 5. Move Safety items from Hand Tools/Power Tools to Safety & PPE
    await db.query(`
      UPDATE items SET categoria_padre = 'Safety & PPE' 
      WHERE (LOWER(nombre) LIKE '%harness%' 
        OR LOWER(nombre) LIKE '%safety line%' 
        OR LOWER(nombre) LIKE '%safety strap%'
        OR LOWER(nombre) LIKE '%pole strap%'
        OR LOWER(nombre) LIKE '%webbing sling%'
        OR LOWER(nombre) LIKE '%anchorage%'
      ) AND categoria_padre NOT IN ('Safety & PPE')
    `);
    console.log('[Migration] Moved safety items to Safety & PPE');

    // 6. Fix tipo for items that should be 'kit' but are 'herramienta'
    await db.query(`
      UPDATE items SET tipo = 'kit' 
      WHERE LOWER(categoria_padre) LIKE '%kit%' AND tipo != 'kit'
    `);
    // Fix WalkTest Kits tipo
    await db.query(`
      UPDATE items SET tipo = 'kit' 
      WHERE categoria_padre = 'WalkTest Kits' AND tipo != 'kit'
    `);
    console.log('[Migration] Fixed tipo for kit items');

    console.log('[Migration] 20260812_corrections completed successfully.');
  } catch (err) {
    console.error('[Migration] Error:', err.message);
    // Don't throw - migration errors shouldn't prevent server startup
  }
};
