require('dotenv').config({quiet:true});
const fs = require('fs');
const path = require('path');
const {Client} = require('pg');
async function main() {
  if (process.env.DB_NAME !== 'metrohealth_services') throw new Error('Unexpected database target');
  const db = new Client({host:process.env.DB_HOST,port:process.env.DB_PORT || 5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000});
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='15s'");
    await db.query(fs.readFileSync(path.join(__dirname,'../sql/tmg-portal-users.sql'),'utf8'));
    await db.query('SELECT id,member_no,mobile_no,email,password,role,created_at FROM public.tmg_portal_users LIMIT 0');
    await db.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
    console.log(process.argv.includes('--apply') ? 'TMG credential table ready. No legacy accounts copied or changed.' : 'Migration checked and rolled back.');
  } catch(error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
