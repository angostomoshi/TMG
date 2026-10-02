const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

function reject(status, message) { const error = new Error(message); error.status = status; throw error; }
function normalizePhone(value) {
  let digits = String(value || '').replace(/[\s()+-]/g, '');
  if (/^0[17]\d{8}$/.test(digits)) digits = `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) digits = `254${digits}`;
  return /^254[17]\d{8}$/.test(digits) ? digits : null;
}
function accountNumber(value) {
  const account = String(value || '').trim().toUpperCase();
  if (!account || account.length > 100) reject(400, 'Enter your shareholder number.');
  return account;
}
function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) reject(400, 'Use a password of at least 8 characters and at most 72 UTF-8 bytes.');
  return value;
}
function makeLimiter() {
  const buckets = new Map();
  return (key, limit, windowMs) => {
    const now = Date.now();
    for (const [name, entry] of buckets) if (entry.until <= now) buckets.delete(name);
    const entry = buckets.get(key) || { count: 0, until: now + windowMs };
    if (entry.count >= limit) reject(429, 'Too many attempts. Please wait before trying again.');
    entry.count++; buckets.set(key, entry);
  };
}

function createRegistrationRouter({ pool, sendEmail = null }) {
  const router = express.Router();
  const limit = makeLimiter();
  const handle = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      if (!error.status) console.error('TMG registration failed:', error.code || error.name);
      res.status(error.status || 503).json({ message: error.status ? error.message : 'Account setup is temporarily unavailable. Please contact the office.' });
    }
  };
  async function transaction(account, handler) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout='10s'");
      await db.query('SELECT pg_advisory_xact_lock(734822,hashtext($1))', [account]);
      const result = await handler(db);
      await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async function member(db, account) {
    const result = await db.query(`SELECT acc_no,holders_name,tel1,email_add,closed,approved,status,account_status,company_id
      FROM public.pb_share_register WHERE upper(trim(acc_no))=$1`, [account]);
    if (result.rows.length !== 1) reject(400, 'We could not verify this shareholder. Please confirm your details with the office.');
    const record = result.rows[0];
    if (record.closed !== false || record.approved !== true || record.status !== 'Approved' || record.account_status !== 'Alive') reject(403, 'This shareholder account needs office review before portal access can be created.');
    if (!normalizePhone(record.tel1)) reject(400, 'Please ask the office to update the mobile number on your shareholder record.');
    return record;
  }
  function matchContacts(body, record) {
    if (!normalizePhone(body.mobileNo) || normalizePhone(body.mobileNo) !== normalizePhone(record.tel1)) reject(400, 'The mobile number does not match your shareholder record.');
    if (body.email && String(body.email).trim().toLowerCase() !== String(record.email_add || '').trim().toLowerCase()) reject(400, 'The email does not match your shareholder record. Leave it blank or contact the office to update it.');
  }
  async function users(db, account) {
    return (await db.query('SELECT id FROM public.pb_users WHERE upper(trim(member_no))=$1 ORDER BY id', [account])).rows;
  }

  router.post('/registerOtp', handle(async (req, res) => {
    const account = accountNumber(req.body.memberNo);
    const purpose = req.body.purpose || 'reset-password';
    if (!['create-account','reset-password'].includes(purpose)) reject(400, 'Choose account creation or password reset.');
    const reset = purpose === 'reset-password';
    limit(`send-ip:${req.ip}`, 10, 15 * 60000);
    limit(`send-member:${account}`, 3, 15 * 60000);
    const issued = await transaction(account, async db => {
      const record = await member(db, account);
      if (!reset) matchContacts(req.body, record);
      const existing = await users(db, account);
      if (!reset && existing.length) reject(409, 'You already have a portal account. Sign in or use Forgot Password.');
      if (reset && existing.length !== 1) reject(400, 'A unique portal account could not be verified. Please contact the office.');
      const sms = await db.query(`SELECT EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='sms_normal_messages'
        AND definition LIKE '%sms_tmg_portal_otp%') AS ready`);
      if (!sms.rows[0].ready) reject(503, 'OTP messaging is awaiting activation by the portal administrator.');
      const recent = await db.query(`SELECT id FROM public.pb_share_passkey WHERE upper(trim(member_no))=$1
        AND user_name='tmg-shares-portal' AND cdate>now()-interval '60 seconds' LIMIT 1`, [account]);
      if (recent.rows.length) reject(429, 'Please wait 60 seconds before requesting another code.');
      await db.query(`UPDATE public.pb_share_passkey SET key_used=true,sms_sent=true
        WHERE upper(trim(member_no))=$1 AND user_name='tmg-shares-portal' AND key_used=false`, [account]);
      const code = crypto.randomInt(100000, 1000000);
      const saved = await db.query(`INSERT INTO public.pb_share_passkey
        (member_no,phone_no,email,pass_key,logged_in,sms_sent,key_used,user_name,cdate)
        VALUES ($1,$2,$3,$4,$5,false,false,'tmg-shares-portal',now()) RETURNING id`,
      [record.acc_no, normalizePhone(record.tel1), record.email_add || null, code, reset]);
      return { record, code, id: saved.rows[0].id };
    });
    let emailSent = false;
    if (sendEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(issued.record.email_add || '')) {
      try { await sendEmail({ record: issued.record, code: issued.code, purpose }); emailSent = true; }
      catch { console.warn('TMG OTP email unavailable; SMS remains queued.'); }
    }
    res.status(201).json({ success: true, smsQueued: true, emailSent,
      message: `An OTP has been queued for your registered mobile ending ${normalizePhone(issued.record.tel1).slice(-4)}.${emailSent ? ' A copy was also sent to your registered email.' : ''} It expires in 10 minutes.` });
  }));

  async function complete(req, res, reset) {
    const account = accountNumber(req.body.memberNo);
    const password = validatePassword(reset ? req.body.newPassword || req.body.password : req.body.password);
    const otp = String(req.body.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) reject(400, 'Enter the six-digit OTP sent to your registered mobile.');
    limit(`verify-ip:${req.ip}`, 20, 15 * 60000);
    limit(`verify-member:${account}`, 5, 15 * 60000);
    const hash = await bcrypt.hash(password, 12);
    await transaction(account, async db => {
      const record = await member(db, account);
      if (!reset) matchContacts(req.body, record);
      // Legacy IDs have no default. Lock all portal writers while assigning max(id)+1.
      await db.query('LOCK TABLE public.pb_users IN EXCLUSIVE MODE');
      const existing = await users(db, account);
      if (!reset && existing.length) reject(409, 'You already have a portal account. Use Forgot Password.');
      if (reset && existing.length !== 1) reject(400, 'A unique portal account could not be verified. Contact the office.');
      const result = await db.query(`SELECT id,pass_key,phone_no,email FROM public.pb_share_passkey
        WHERE upper(trim(member_no))=$1 AND user_name='tmg-shares-portal' AND logged_in=$2
        AND key_used=false AND cdate>=now()-interval '10 minutes' ORDER BY cdate DESC,id DESC LIMIT 1 FOR UPDATE`, [account, reset]);
      const challenge = result.rows[0];
      if (!challenge || String(challenge.pass_key) !== otp || normalizePhone(challenge.phone_no) !== normalizePhone(record.tel1)) reject(400, 'The code is invalid or expired. Request a new OTP.');
      if (reset) {
        await db.query('UPDATE public.pb_users SET password=$1,otp=NULL WHERE id=$2', [hash, existing[0].id]);
      } else {
        await db.query(`INSERT INTO public.pb_users(id,member_no,mobile_no,email,password,role,input_date)
          SELECT coalesce(max(id),0)+1,$1,$2,$3,$4,'USER',CURRENT_DATE FROM public.pb_users`,
        [record.acc_no, normalizePhone(record.tel1), record.email_add || null, hash]);
      }
      await db.query(`UPDATE public.pb_share_passkey SET key_used=true,sms_sent=true
        WHERE upper(trim(member_no))=$1 AND user_name='tmg-shares-portal' AND key_used=false`, [account]);
    });
    res.status(reset ? 200 : 201).json({ success: true, message: reset ? 'Password updated. You can now sign in.' : 'Your TMG shares portal account is ready. You can now sign in.' });
  }
  router.post('/register', handle((req, res) => complete(req, res, false)));
  router.post('/change-password', handle((req, res) => complete(req, res, true)));
  return router;
}
module.exports = { createRegistrationRouter, normalizePhone, validatePassword };
