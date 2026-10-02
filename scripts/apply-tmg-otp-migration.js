// Apply the explicitly approved SMS-view integration; creates no OTP or member rows.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { Client } = require('pg');

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Explicit --apply is required.');
  if (process.env.DB_NAME !== 'metrohealth_services' || process.env.DB_HOST !== '192.168.4.7') {
    throw new Error('Expected metrohealth_services on 192.168.4.7.');
  }
  const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  try {
    await db.connect();
    const pollBefore = (await db.query("SELECT pg_get_viewdef('integration.poll_sms'::regclass,true) AS definition")).rows[0].definition;
    assert.ok(pollBefore.includes('sms_normal_messages'), 'SMS worker polling view is not connected to the expected source.');
    const sql = fs.readFileSync(path.join(__dirname, '../sql/tmg-otp-sms.sql'), 'utf8').replace(/COMMIT;\s*$/, '');
    assert.ok(!/\bCOMMIT\s*;/i.test(sql));
    await db.query(sql);
    const ready = (await db.query(`SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public'
      AND viewname='sms_normal_messages' AND definition LIKE '%sms_tmg_portal_otp%') AS ready`)).rows[0].ready;
    assert.equal(ready, true);
    const pollAfter = (await db.query("SELECT pg_get_viewdef('integration.poll_sms'::regclass,true) AS definition")).rows[0].definition;
    assert.equal(pollAfter, pollBefore, 'Unexpected change to the polling view.');
    await db.query('SELECT * FROM public.sms_tmg_portal_otp LIMIT 0');
    await db.query('SELECT * FROM integration.poll_sms LIMIT 0');
    await db.query('COMMIT');
    const verified = (await db.query(`SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public'
      AND viewname='sms_normal_messages' AND definition LIKE '%sms_tmg_portal_otp%') AS ready`)).rows[0].ready;
    assert.equal(verified, true);
    console.log('Applied and verified: metrohealth_services on 192.168.4.7.');
    console.log('TMG OTP view is connected to sms_normal_messages; integration.poll_sms is unchanged.');
    console.log('No member records, balances, OTPs or test messages were created or updated.');
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error('SMS activation failed:', error.code || error.name, error.message); process.exitCode = 1; });
