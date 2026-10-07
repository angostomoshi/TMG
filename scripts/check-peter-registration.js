require('dotenv').config();
const { Client } = require('pg');
const { normalizePhone } = require('../server/metrohealth-registration');

async function main() {
  if (process.env.DB_NAME !== 'metrohealth_services') throw new Error('Unexpected database target');
  const db = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await db.connect();
  try {
    const result = await db.query(`SELECT r.acc_no,r.holders_name,r.closed,r.approved,r.status,r.account_status,r.tel1,
      (SELECT count(*)::int FROM public.tmg_portal_users u WHERE upper(trim(u.member_no))=upper(trim(r.acc_no))) AS portal_accounts,
      (SELECT count(*)::int FROM public.pb_share_register d WHERE upper(trim(d.acc_no))=upper(trim(r.acc_no))) AS matching_records
      FROM public.pb_share_register r WHERE holders_name ILIKE $1 AND holders_name ILIKE $2`, ['%peter%', '%ndung%']);
    console.log(JSON.stringify(result.rows.map(({tel1,...r}) => ({...r,
      validMobile: !!normalizePhone(tel1), mobileEnding: normalizePhone(tel1)?.slice(-4) || null,
      canRegister: r.matching_records === 1 && r.portal_accounts === 0 && r.closed === false && r.approved === true && r.status === 'Approved' && r.account_status === 'Alive' && !!normalizePhone(tel1)
    })), null, 2));
  } finally { await db.end(); }
}
main().catch(error => { console.error('Read-only check failed:', error.code || error.message); process.exitCode = 1; });
