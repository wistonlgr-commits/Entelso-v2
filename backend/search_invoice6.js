const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.bzejcptaxumhqdxmrieu:jEGWYp4b9ybXSq5p@aws-1-us-west-2.pooler.supabase.com:5432/postgres' });

async function search() {
  await client.connect();
  const res = await client.query(`SELECT * FROM activos WHERE original_serial ILIKE '%433052%' OR original_serial ILIKE '%332040%'`);
  console.log('Original serial matches:', res.rows);
  await client.end();
}
search();
