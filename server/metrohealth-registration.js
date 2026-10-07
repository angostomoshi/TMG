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
async function accountForPhone(db, value) {
  const phone = normalizePhone(value);
  if (!phone) reject(400, 'Enter your registered phone number.');
  const result = await db.query(`SELECT acc_no FROM public.pb_share_register
    WHERE regexp_replace(coalesce(tel1,''),'[[:space:]()+-]','','g') ~ '^(254|0)?[17][0-9]{8}$'
    AND right(regexp_replace(coalesce(tel1,''),'[[:space:]()+-]','','g'),9)=$1`, [phone.slice(3)]);
  if (result.rows.length !== 1) reject(400, 'A unique shareholder record could not be found for this phone. Please contact the office.');
  return String(result.rows[0].acc_no).trim().toUpperCase();
}
function contactInput(body) {
  const value = String(body.identifier ?? body.mobileNo ?? body.email ?? '').trim();
  if (value.includes('@')) {
    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) reject(400, 'Enter your registered email or phone number.');
    return { channel:'email', value:value.toLowerCase(), namespace:'tmg-shares-email' };
  }
  const phone = normalizePhone(value);
  if (!phone) reject(400, 'Enter your registered email or phone number.');
  return { channel:'sms', value:phone, namespace:'tmg-shares-portal' };
}
async function accountForContact(db, contact) {
  if (contact.channel === 'sms') return accountForPhone(db,contact.value);
  const result = await db.query('SELECT acc_no FROM public.pb_share_register WHERE lower(trim(email_add))=$1',[contact.value]);
  if (result.rows.length !== 1) reject(400, 'A unique shareholder record could not be found for this email. Please contact the office.');
  return String(result.rows[0].acc_no).trim().toUpperCase();
}
function memberNumber(value) {
  const account=String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,100}$/.test(account)) reject(400,'Enter your member number.');
  return account;
}
function deliveryContact(body, record) {
  const channel=body.channel || 'email';
  if (!['email','sms'].includes(channel)) reject(400,'Choose email or SMS for your OTP.');
  const value=channel==='email' ? String(record.email_add || '').trim().toLowerCase() : normalizePhone(record.tel1);
  if (!value || (channel==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) reject(400,'The selected contact method is not registered. Choose another method or contact the office.');
  return {channel,value,namespace:channel==='email'?'tmg-shares-email':'tmg-shares-portal'};
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
    return record;
  }
  async function users(db, account) {
    return (await db.query('SELECT id FROM public.tmg_portal_users WHERE upper(trim(member_no))=$1 ORDER BY id', [account])).rows;
  }

  router.post('/registerOtp', handle(async (req, res) => {
    limit(`phone-ip:${req.ip}`, 30, 15 * 60000);
    const account = memberNumber(req.body.memberNo);
    const purpose = req.body.purpose || 'reset-password';
    if (!['create-account','reset-password'].includes(purpose)) reject(400, 'Choose account creation or password reset.');
    const reset = purpose === 'reset-password';
    limit(`send-ip:${req.ip}`, 10, 15 * 60000);
    limit(`send-member:${account}`, 3, 15 * 60000);
    const issued = await transaction(account, async db => {
      const record = await member(db, account);
      const contact = deliveryContact(req.body, record);
      const existing = await users(db, account);
      if (!reset && existing.length) reject(409, 'You already have a portal account. Sign in or use Forgot Password.');
      if (reset && existing.length !== 1) reject(400, 'A unique portal account could not be verified. Please contact the office.');
      if (contact.channel==='email' && !sendEmail) reject(503,'Email delivery is unavailable. Please try again later.');
      if (contact.channel==='sms') {
      const sms = await db.query(`SELECT EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='sms_normal_messages'
        AND definition LIKE '%sms_tmg_portal_otp%') AS ready`);
      if (!sms.rows[0].ready) reject(503, 'OTP messaging is awaiting activation by the portal administrator.');
      }
      const recent = await db.query(`SELECT id FROM public.pb_share_passkey WHERE upper(trim(member_no))=$1
        AND user_name IN ('tmg-shares-portal','tmg-shares-email') AND cdate>now()-interval '60 seconds' LIMIT 1`, [account]);
      if (recent.rows.length) reject(429, 'Please wait 60 seconds before requesting another code.');
      await db.query(`UPDATE public.pb_share_passkey SET key_used=true,sms_sent=true
        WHERE upper(trim(member_no))=$1 AND user_name IN ('tmg-shares-portal','tmg-shares-email') AND key_used=false`, [account]);
      const code = crypto.randomInt(100000, 1000000);
      const saved = await db.query(`INSERT INTO public.pb_share_passkey
        (member_no,phone_no,email,pass_key,logged_in,sms_sent,key_used,user_name,cdate)
        VALUES ($1,$2,$3,$4,$5,$6,false,$7,now()) RETURNING id`,
      [record.acc_no, normalizePhone(record.tel1), record.email_add || null, code, reset, contact.channel==='email',contact.namespace]);
      return { record, code, contact, id: saved.rows[0].id };
    });
    const {contact}=issued;
    if (contact.channel==='email') {
      try { await sendEmail({record:issued.record,code:issued.code,purpose}); }
      catch {
        await pool.query("UPDATE public.pb_share_passkey SET key_used=true,sms_sent=true WHERE id=$1 AND user_name='tmg-shares-email'",[issued.id]);
        reject(503,'We could not send your email OTP. Please try again in a minute or use your registered phone.');
      }
    }
    res.status(201).json({success:true,smsQueued:contact.channel==='sms',emailSent:contact.channel==='email',channel:contact.channel,
      message:contact.channel==='email' ? 'Your OTP email was accepted by the mail server. Check your inbox and spam folder. It expires in 10 minutes.' : `An OTP has been queued for your registered mobile ending ${contact.value.slice(-4)}. It expires in 10 minutes.`});
  }));

  async function complete(req, res, reset) {
    limit(`phone-ip:${req.ip}`, 30, 15 * 60000);
    const account = memberNumber(req.body.memberNo);
    const password = validatePassword(reset ? req.body.newPassword || req.body.password : req.body.password);
    const otp = String(req.body.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) reject(400, 'Enter the six-digit OTP sent to your registered email or phone.');
    limit(`verify-ip:${req.ip}`, 20, 15 * 60000);
    limit(`verify-member:${account}`, 5, 15 * 60000);
    const hash = await bcrypt.hash(password, 12);
    await transaction(account, async db => {
      const record = await member(db, account);
      const contact = deliveryContact(req.body, record);
      const existing = await users(db, account);
      if (!reset && existing.length) reject(409, 'You already have a portal account. Use Forgot Password.');
      if (reset && existing.length !== 1) reject(400, 'A unique portal account could not be verified. Contact the office.');
      const result = await db.query(`SELECT id,pass_key,phone_no,email FROM public.pb_share_passkey
        WHERE upper(trim(member_no))=$1 AND user_name=$3 AND logged_in=$2
        AND key_used=false AND cdate>=now()-interval '10 minutes' ORDER BY cdate DESC,id DESC LIMIT 1 FOR UPDATE`, [account, reset, contact.namespace]);
      const challenge = result.rows[0];
      if (!challenge || String(challenge.pass_key) !== otp || (contact.channel==='email' ? String(challenge.email || '').trim().toLowerCase()!==contact.value : normalizePhone(challenge.phone_no)!==contact.value)) reject(400, 'The code is invalid or expired. Request a new OTP.');
      if (reset) {
        await db.query('UPDATE public.tmg_portal_users SET password=$1 WHERE id=$2', [hash, existing[0].id]);
      } else {
        await db.query(`INSERT INTO public.tmg_portal_users(member_no,mobile_no,email,password,role)
          VALUES ($1,$2,$3,$4,'USER')`,
        [account, normalizePhone(record.tel1) || '', record.email_add || null, hash]);
      }
      await db.query(`UPDATE public.pb_share_passkey SET key_used=true,sms_sent=true
        WHERE upper(trim(member_no))=$1 AND user_name IN ('tmg-shares-portal','tmg-shares-email') AND key_used=false`, [account]);
    });
    res.status(reset ? 200 : 201).json({ success: true, message: reset ? 'Password updated. You can now sign in.' : 'Your TMG shares portal account is ready. You can now sign in.' });
  }
  router.post('/register', handle((req, res) => complete(req, res, false)));
  router.post('/change-password', handle((req, res) => complete(req, res, true)));
  return router;
}
module.exports = { createRegistrationRouter, normalizePhone, validatePassword, accountForPhone, contactInput, accountForContact, memberNumber };
