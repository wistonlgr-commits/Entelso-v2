const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.bzejcptaxumhqdxmrieu:jEGWYp4b9ybXSq5p@aws-1-us-west-2.pooler.supabase.com:5432/postgres' });

async function search() {
  await client.connect();
  
  const query1 = `
    SELECT a.numero_serie, a.id, a.estado, a.ubicacion_actual_id, i.nombre, i.marca 
    FROM activos a 
    JOIN items i ON a.item_id = i.id 
    WHERE a.numero_serie ILIKE '%1433052%' 
       OR a.numero_serie ILIKE '%1332040%' 
       OR i.nombre ILIKE '%MW82119A%' 
       OR i.nombre ILIKE '%1433052%'
  `;
  try {
    const res = await client.query(query1);
    console.log('Exact Matches:', res.rows);
  } catch(e) {}
  
  const query2 = `
    SELECT a.numero_serie, i.nombre, i.marca 
    FROM activos a 
    JOIN items i ON a.item_id = i.id 
    WHERE i.nombre ILIKE '%PIM Master%' 
       OR i.nombre ILIKE '%Anritsu%'
       OR i.marca ILIKE '%Anritsu%'
  `;
  try {
    const res2 = await client.query(query2);
    console.log('Broad Matches:', res2.rows);
  } catch(e) { console.error(e) }
  
  await client.end();
}

search().catch(console.error);
