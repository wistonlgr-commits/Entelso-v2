const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.bzejcptaxumhqdxmrieu:jEGWYp4b9ybXSq5p@aws-1-us-west-2.pooler.supabase.com:5432/postgres' });

async function search() {
  await client.connect();
  try {
    const res = await client.query(`SELECT * FROM items WHERE nombre ILIKE '%Anritsu%' OR marca ILIKE '%Anritsu%'`);
    console.log('Items Anritsu:', res.rows);
  } catch(e) {}
  await client.end();
}
search();
