const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.bzejcptaxumhqdxmrieu:jEGWYp4b9ybXSq5p@aws-1-us-west-2.pooler.supabase.com:5432/postgres' });

async function search() {
  await client.connect();
  try {
    const res = await client.query(`SELECT * FROM activos WHERE numero_serie ILIKE '%433052%' OR numero_serie ILIKE '%332040%' OR notas ILIKE '%1433052%' OR notas ILIKE '%1332040%'`);
    console.log('Activos by number/notes:', res.rows);
  } catch(e) {}
  
  try {
    const res = await client.query(`SELECT * FROM items WHERE nombre ILIKE '%PIM%' OR nombre ILIKE '%PIN Master%'`);
    console.log('Items by name PIM:', res.rows);
  } catch(e) {}

  await client.end();
}
search();
