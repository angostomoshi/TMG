require('dotenv').config({ quiet: true });
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  try {
    await client.connect();
    const result = await client.query('SELECT current_database() AS database, current_user AS db_user');
    console.log('Connection verified:', result.rows[0]);
  } catch (error) {
    console.error('Connection failed:', error.code || 'UNKNOWN', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
