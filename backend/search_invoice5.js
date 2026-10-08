const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.bzejcptaxumhqdxmrieu:jEGWYp4b9ybXSq5p@aws-1-us-west-2.pooler.supabase.com:5432/postgres' });

async function search() {
  await client.connect();
  const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'activos'`);
  console.log('Activos columns:', res.rows.map(r => r.column_name));
  await client.end();
}
search();
