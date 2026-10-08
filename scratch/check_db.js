const db = require('../backend/src/config/database');
(async () => {
  const res = await db.query(`
    SELECT a.id, a.numero_serie, a.original_serial, a.estado, a.fecha_registro, a.notas,
           i.id as item_id, i.nombre, i.tipo, i.categoria_padre, i.stock_global_consumibles
    FROM activos a
    JOIN items i ON a.item_id = i.id
    WHERE a.numero_serie LIKE '%121%' OR a.original_serial LIKE '%121%'
    LIMIT 5
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
