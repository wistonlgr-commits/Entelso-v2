const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Reading init.sql...');
    const sql = fs.readFileSync('../../init.sql', 'utf8');
    console.log('Executing init.sql...');
    await client.query(sql);
    console.log('init.sql executed successfully!');
  } catch (err) {
    console.error('Error executing init.sql:', err);
  } finally {
    await client.end();
  }
}

run();
