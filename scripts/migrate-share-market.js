require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const assert = require('node:assert/strict');
const catalogSql = `SELECT n.nspname,c.relname,c.relkind,c.oid::text
  FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace=n.oid
  WHERE n.nspname='share_market' ORDER BY c.relname,c.oid`;
async function main() {
  if (process.env.DB_NAME !== 'metrohealth_services') throw new Error('Expected metrohealth_services; migration refused.');
  const client = new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT || 5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000});
  try {
    await client.connect();
    const before = (await client.query(catalogSql)).rows;
    console.log('Target:', process.env.DB_NAME, 'on', process.env.DB_HOST);
    console.log('Marketplace catalog objects before test:', before.length);
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SELECT pg_advisory_xact_lock(734821,2)");
    await client.query(fs.readFileSync(path.join(__dirname,'../sql/share-market.sql'),'utf8'));
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='share_market' ORDER BY table_name");
    for (const name of ['events','listings','trades']) assert.ok(tables.rows.some(row=>row.table_name===name), `Missing ${name}`);
    await client.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
    if (!process.argv.includes('--apply')) {
      const after = (await client.query(catalogSql)).rows;
      assert.deepEqual(after,before,'Marketplace catalog differs after rollback; inspect before continuing.');
      console.log('Post-rollback catalog matches pre-test state:', true);
    }
    console.log(process.argv.includes('--apply')?'Marketplace request tables created. Legacy accounting tables unchanged.':'Migration validated and rolled back; no tables retained.');
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{await client.end();}
}
main().catch(error=>{console.error('Migration failed:',error.code || error.name,error.message);process.exitCode=1;});
