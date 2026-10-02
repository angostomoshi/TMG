const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createShareMarketRouter, getMember } = require('./share-market');

module.exports = function metrohealth({ pool, secret, sendOtpEmail }) {
  const router = express.Router();
  const audience = 'metrohealth_services';
  const attempts = new Map();
  router.use('/auth', require('./metrohealth-registration').createRegistrationRouter({ pool, sendEmail: sendOtpEmail }));
  function auth(req,res,next) {
    try {
      const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
      const claims = jwt.verify(token,secret,{audience,issuer:'metrohealth-portal',algorithms:['HS256']});
      if (!claims.memberNo) throw new Error('Missing member');
      req.auth={memberNo:String(claims.memberNo).trim().toUpperCase(),role:claims.role}; next();
    } catch { res.status(401).json({message:'Please sign in again to access Metro Health Services.'}); }
  }
  const handle = fn => async(req,res)=>{try{await fn(req,res);}catch(error){console.error('Metro Health API:',error.code || error.name);res.status(error.status || 503).json({message:error.status ? error.message : 'Unable to load your account right now.'});}};
  router.post('/auth/authenticate',handle(async(req,res)=>{
    const account=String(req.body.memberNo || req.body.username || '').trim().toUpperCase();
    const password=String(req.body.password || '');
    if (!account || !password || account.length>100 || password.length>256) return res.status(400).json({message:'Enter your member number and password.'});
    const key=`${req.ip}:${account}`;
    const now=Date.now();
    for (const [k,v] of attempts) if (v.until<=now) attempts.delete(k);
    const attempt=attempts.get(key) || {count:0,until:now+15*60*1000};
    if (attempt.count>=10) return res.status(429).json({message:'Too many sign-in attempts. Please wait 15 minutes.'});
    attempt.count++; attempts.set(key,attempt);
    const users=await pool.query('SELECT id,member_no,password,role FROM public.pb_users WHERE upper(trim(member_no))=$1 ORDER BY id DESC LIMIT 20',[account]);
    let matched;
    for (const user of users.rows) {
      if (/^\$2[aby]\$/.test(user.password || '') && await bcrypt.compare(password,user.password)) {matched=user;break;}
    }
    if (!matched) return res.status(401).json({message:'Invalid member number or password. Contact the office if you do not have portal access.'});
    const member=await getMember(pool,account);
    if (member.closed !== false || member.account_status !== 'Alive') return res.status(403).json({message:'This account is not enabled for portal access. Contact the office.'});
    attempts.delete(key);
    const token=jwt.sign({memberNo:account,role:'USER',userId:matched.id},secret,{expiresIn:'1h',audience,issuer:'metrohealth-portal'});
    res.json({success:true,token,proxyToken:token,memberNo:account,accNo:account,holdersName:member.holders_name,role:'USER'});
  }));
  router.use('/share-market',createShareMarketRouter({pool,auth}));
  router.get('/member/:memberNo',auth,handle(async(req,res)=>{
    if (req.params.memberNo.trim().toUpperCase()!==req.auth.memberNo) return res.status(403).json({message:'You can only view your own account.'});
    await getMember(pool,req.auth.memberNo);
    const result=await pool.query(`SELECT id,acc_no,holders_name,id_no,tel1,email_add,postal_address,pin_no,date,
      nok1,nok2,nok3,closed,approved,status,account_status FROM public.pb_share_register WHERE upper(trim(acc_no))=$1`,[req.auth.memberNo]);
    const member=result.rows[0];
    res.json({...member,accNo:member.acc_no,memberNo:member.acc_no,holdersName:member.holders_name,name:member.holders_name,
      idNo:member.id_no,emailAdd:member.email_add,postalAddress:member.postal_address,kraPin:member.pin_no,createdAt:member.date,joinDate:member.date});
  }));
  router.get('/header/:id',auth,handle(async(req,res)=>{
    const member=await getMember(pool,req.auth.memberNo);
    const result=await pool.query('SELECT header_name,company_logo,date FROM public.pb_header WHERE company_id=$1 ORDER BY date DESC NULLS LAST LIMIT 1',[member.company_id]);
    const header=result.rows[0] || {};
    res.json({organisationName:header.header_name || 'TMG Shares Portal',headerName:header.header_name || 'TMG Shares Portal',companyLogo:header.company_logo || null,date:header.date || null});
  }));
  router.get('/dividendPayable/sumTotal/:memberNo',auth,handle(async(req,res)=>{
    if(req.params.memberNo.trim().toUpperCase()!==req.auth.memberNo)return res.status(403).json({message:'You can only view your own dividends.'});
    const result=await pool.query('SELECT coalesce(sum(coalesce(credit,0)-coalesce(debit,0)),0)::text AS balance FROM public.ac_dividends_payable WHERE upper(trim(account_no))=$1',[req.auth.memberNo]);
    const balance=result.rows[0].balance;res.json({success:true,balance,total:balance,sumTotal:balance});
  }));
  router.get('/dividend/:memberNo',auth,handle(async(req,res)=>{
    if(req.params.memberNo.trim().toUpperCase()!==req.auth.memberNo)return res.status(403).json({message:'You can only view your own dividends.'});
    const result=await pool.query(`SELECT date AS "inputDate",item AS narration,reference_no AS "refNo",credit AS dividend,debit AS paid,
      sum(coalesce(credit,0)-coalesce(debit,0)) OVER (ORDER BY date ASC NULLS FIRST,id ASC ROWS UNBOUNDED PRECEDING) AS "runningTotal"
      FROM public.ac_dividends_payable WHERE upper(trim(account_no))=$1 ORDER BY date ASC NULLS FIRST,id ASC`,[req.auth.memberNo]);
    res.json({success:true,data:result.rows});
  }));
  router.get('/shareCapital/sumTotal/:memberNo',auth,handle(async(req,res)=>{
    if (req.params.memberNo.trim().toUpperCase()!==req.auth.memberNo) return res.status(403).json({message:'You can only view your own capital.'});
    const result=await pool.query("SELECT coalesce(sum(coalesce(credit,0)-coalesce(debit,0)),0)::text AS balance FROM public.ac_shares_ledger WHERE upper(trim(account_no))=$1 AND transaction_type ILIKE 'Sh%'",[req.auth.memberNo]);
    const balance=result.rows[0].balance;res.json({success:true,balance,total:balance,sumTotal:balance});
  }));
  router.get('/shareCapital/:memberNo',auth,handle(async(req,res)=>{
    if (req.params.memberNo.trim().toUpperCase()!==req.auth.memberNo) return res.status(403).json({message:'You can only view your own statement.'});
    const result=await pool.query(`SELECT id,date,item,reference_no AS "refNo",credit,debit,
      sum(coalesce(credit,0)-coalesce(debit,0)) OVER (ORDER BY date ASC NULLS FIRST,id ASC ROWS UNBOUNDED PRECEDING) AS "runningAmt"
      FROM public.ac_shares_ledger WHERE upper(trim(account_no))=$1 AND transaction_type ILIKE 'Sh%' ORDER BY date ASC NULLS FIRST,id ASC`,[req.auth.memberNo]);
    res.json({success:true,data:result.rows});
  }));
  // Do not route legacy SACCO writes or identity changes into a different organisation.
  router.use((req,res,next)=>{
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) return res.status(501).json({message:'This operation has not been enabled for Metro Health Services.'});
    if (/^\/(savings|withDrawable|withdrawable|guarantor|instant|loan-applications|mpesa)(\/|$)/.test(req.path)) return res.status(501).json({message:'This SACCO service is not available in the share portal.'});
    next();
  });
  return router;
};
