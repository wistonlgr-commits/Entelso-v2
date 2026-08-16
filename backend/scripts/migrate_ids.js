const db = require('../src/config/database');

const prefixMap = {
  'power tools': 'PT',
  'hand tools': 'HT',
  'consumables': 'CO',
  'walktest kits': 'WK',
  'testing equipment': 'TE',
  'safety & ppe': 'SA',
  'cam keys': 'CK',
};

async function generateId(prefix, dbClient) {
  let seq = 1;
  const res = await dbClient.query(`
    SELECT numero_serie 
    FROM activos 
    WHERE numero_serie LIKE $1
  `, [prefix + '-%']);
  
  if (res.rows.length > 0) {
    let maxNum = 0;
    for (const row of res.rows) {
      const suffix = row.numero_serie.substring(prefix.length + 1);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
    seq = maxNum + 1;
  }
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

async function run() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get all assets with their item info
    const res = await client.query(`
      SELECT a.id, a.numero_serie, i.categoria_padre
      FROM activos a
      JOIN items i ON a.item_id = i.id
    `);
    
    const assets = res.rows;
    let migrated = 0;
    
    for (const asset of assets) {
      // Check if it already matches our valid formats (e.g. EQ12, XX-00000)
      if (/^[A-Z]{2,4}-\d{4,6}$/i.test(asset.numero_serie)) {
        // If it's already well-formatted, maybe we just leave it alone
        continue;
      }
      
      const categoryStr = (asset.categoria_padre || '').toLowerCase().trim();
      const prefix = prefixMap[categoryStr] || 'EQ';
      
      const newId = await generateId(prefix, client);
      console.log(`Migrating asset ${asset.id}: ${asset.numero_serie} -> ${newId}`);
      
      // We found a bad format! Save the old serial to original_serial and generate a new one
      await client.query(
        'UPDATE activos SET original_serial = $1, numero_serie = $2 WHERE id = $3',
        [asset.numero_serie, newId, asset.id]
      );
      migrated++;
    }
    
    await client.query('COMMIT');
    console.log(`Successfully migrated ${migrated} assets.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
