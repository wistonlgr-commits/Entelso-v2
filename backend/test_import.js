const fs = require('fs');
const xlsx = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: 'postgresql://postgres:jEGWYp4b9ybXSq5p@db.bzejcptaxumhqdxmrieu.supabase.co:5432/postgres' });

async function run() {
  const buf = fs.readFileSync('../Equipment Register.xlsx');
  const wb = xlsx.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  const invIndex = headers.findIndex(h => h.includes('inventario') || h.includes('inventory') || h.includes('asset id'));
  const eqIndex = headers.findIndex(h => h.includes('equipo') || h.includes('equipment') || h.includes('descripci') || h.includes('description'));
  const serieIndex = headers.findIndex(h => h.includes('serie') || h.includes('serial'));
  const zonaIndex = headers.findIndex(h => h.includes('zona') || h.includes('zone') || h.includes('sitio') || h.includes('site'));
  const teamIndex = headers.findIndex(h => h.includes('team'));
  const estadoIndex = headers.findIndex(h => h.includes('estado') || h.includes('status'));

  const importFileData = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const numero_serie = String(row[invIndex] || '').trim();
    const descripcion  = String(row[eqIndex]  || '').trim();
    const num_serie_real = serieIndex !== -1 ? String(row[serieIndex] || '').trim() : '';
    const zona         = zonaIndex !== -1 ? String(row[zonaIndex] || '').trim() : '';
    const team         = teamIndex !== -1 ? String(row[teamIndex] || '').trim() : '';
    const estado       = estadoIndex !== -1 ? String(row[estadoIndex] || '').trim() : '';

    if (!numero_serie || !descripcion) continue;
    
    importFileData.push({ numero_serie, descripcion, num_serie_real, zona, team, estado });
  }

  console.log(`Parsed ${importFileData.length} items`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;

    for (const item of importFileData) {
      // 1. Item Category
      let item_id;
      const { rows: itemRows } = await client.query('SELECT id FROM items WHERE LOWER(nombre) = LOWER($1)', [item.descripcion.trim()]);
      if (itemRows.length > 0) {
        item_id = itemRows[0].id;
      } else {
        const { rows: newItem } = await client.query('INSERT INTO items (nombre, tipo) VALUES ($1, $2) RETURNING id', [item.descripcion.trim(), 'herramienta']);
        item_id = newItem[0].id;
      }

      // 2. Zone ID
      let ubicacion_actual_id = null;
      if (item.zona) {
        const { rows: zoneRows } = await client.query('SELECT id FROM ubicaciones WHERE LOWER(nombre_ubicacion) = LOWER($1)', [item.zona.trim()]);
        if (zoneRows.length > 0) ubicacion_actual_id = zoneRows[0].id;
        else {
          const { rows: newZone } = await client.query('INSERT INTO ubicaciones (nombre_ubicacion) VALUES ($1) RETURNING id', [item.zona.trim()]);
          ubicacion_actual_id = newZone[0].id;
        }
      }

      // 3. Team
      const team = item.team ? item.team.trim() : null;

      // 4. Status
      let rawStatus = (item.estado || '').toLowerCase().trim();
      const statusMap = {
        'available': 'disponible', 'in use': 'en_uso', 'maintenance': 'en_mantenimiento',
        'under maintenance': 'en_mantenimiento', 'damaged': 'danado', 'broken': 'danado',
        'out of service': 'fuera_de_servicio', 'calibration pending': 'calibracion_pendiente',
        'calibrated': 'calibrado', 'good': 'disponible', 'fair': 'disponible', 'poor': 'danado'
      };
      let normalizedStatus = statusMap[rawStatus] || rawStatus;
      const validStatuses = new Set(['disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente', 'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido']);
      if (!validStatuses.has(normalizedStatus)) {
          normalizedStatus = 'desconocido';
      }

      // 5. Insert
      try {
        await client.query(`
          INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, estado, team)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (numero_serie) DO UPDATE SET
            item_id = EXCLUDED.item_id,
            ubicacion_actual_id = EXCLUDED.ubicacion_actual_id,
            estado = EXCLUDED.estado,
            team = EXCLUDED.team
        `, [item_id, item.numero_serie.trim(), ubicacion_actual_id, normalizedStatus, team]);
      } catch (err) {
        console.error(`Error inserting item ${item.numero_serie}:`, err);
        throw err;
      }
      inserted++;
    }

    await client.query('ROLLBACK'); // rollback because it's just a test
    console.log(`Success! Inserted ${inserted} items.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('FATAL ERROR:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

run();
