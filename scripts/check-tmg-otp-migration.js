// Rollback-only validation. Never creates OTPs, users or SMS queue rows.
require('dotenv').config({quiet:true});
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const {Client}=require('pg');
async function main(){
  if(process.env.DB_NAME!=='metrohealth_services')throw new Error('Expected metrohealth_services');
  const db=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT || 5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000});
  const snapshot=`SELECT viewname,definition FROM pg_views WHERE schemaname='public' AND viewname IN ('sms_normal_messages','sms_tmg_portal_otp') ORDER BY viewname`;
  try{
    await db.connect();const before=(await db.query(snapshot)).rows;
    const sql=fs.readFileSync(path.join(__dirname,'../sql/tmg-otp-sms.sql'),'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;');
    assert.ok(/ROLLBACK;\s*$/.test(sql));assert.ok(!/\bCOMMIT\s*;/i.test(sql));
    await db.query(sql);
    assert.deepEqual((await db.query(snapshot)).rows,before);
    console.log('OTP SMS migration validated; rollback confirmed. Existing view definitions unchanged. No messages queued.');
  }finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
}
main().catch(error=>{console.error('Validation failed:',error.code || error.name,error.message);process.exitCode=1;});
