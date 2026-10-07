const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcrypt');
const { createRegistrationRouter, normalizePhone, validatePassword } = require('../server/metrohealth-registration');
test('registration and reset screens parse without a build',()=>{
  const fs=require('fs');const path=require('path');const parser=require('@babel/parser');
  for(const file of ['CreateAccount.js','ChangePassword.js']) {
    assert.doesNotThrow(()=>parser.parse(fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8'),{sourceType:'module',plugins:['jsx']}));
  }
});

async function fixture(t, options = {}) {
  const state = { users: options.existing ? [{id:1}] : [], otp:null, emails:0, legacyUsers:[{id:10,member_no:'41',password:'legacy-password'}] };
  let snapshot;
  const record = {acc_no:'41',tel1:'0712345678',email_add:'member@example.invalid',company_id:1,closed:false,approved:true,status:'Approved',account_status:'Alive',...options.member};
  const db = {release(){},async query(sql,args=[]) {
    if(sql==='BEGIN'){snapshot=structuredClone(state);return {rows:[]};}
    if(sql==='ROLLBACK'){Object.assign(state,snapshot);return {rows:[]};}
    if(sql==='COMMIT' || /^(SET LOCAL|SELECT pg_advisory|LOCK TABLE)/.test(sql))return {rows:[]};
    if(sql.includes('lower(trim(email_add))'))return {rows: options.duplicateEmail ? [record,record] : String(record.email_add).trim().toLowerCase()===args[0] ? [record] : []};
    if(sql.includes('SELECT acc_no FROM public.pb_share_register'))return {rows: options.duplicatePhone ? [record,record] : normalizePhone(record.tel1)?.slice(3)===args[0] ? [record] : []};
    if(sql.includes('FROM public.pb_share_register'))return {rows: options.missing ? [] : [record]};
    if(sql.startsWith('SELECT id FROM public.tmg_portal_users'))return {rows:state.users};
    if(sql.includes('FROM pg_views'))return {rows:[{ready:options.ready!==false}]};
    if(sql.includes("interval '60 seconds'"))return {rows:[]};
    if(sql.startsWith('UPDATE public.pb_share_passkey')){if(state.otp)state.otp.used=true;return {rows:[]};}
    if(sql.startsWith('INSERT INTO public.pb_share_passkey')){state.otp={id:9,pass_key:args[3],phone_no:args[1],email:args[2],logged_in:args[4],sms_sent:args[5],namespace:args[6],used:false};return {rows:[{id:9}]};}
    if(sql.startsWith('SELECT id,pass_key,phone_no,email'))return {rows:state.otp && !state.otp.used && state.otp.logged_in===args[1] && state.otp.namespace===args[2] && !options.expired ? [state.otp] : []};
    if(sql.startsWith('INSERT INTO public.tmg_portal_users')){state.users.push({id:2,member_no:args[0],mobile_no:args[1],email:args[2],password:args[3],role:'USER'});return {rows:[]};}
    if(sql.startsWith('UPDATE public.tmg_portal_users')){state.users[0].password=args[0];return {rows:[]};}
    throw new Error(`Unexpected test query: ${sql.slice(0,60)}`);
  }};
  const pool={query:db.query,connect:async()=>db};
  const app=express();app.use(express.json());
  app.use(createRegistrationRouter({pool,sendEmail:async()=>{if(options.emailFails)throw new Error('Test SMTP unavailable');state.emails++;}}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function post(path,body){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
  const request={memberNo:'41',channel:'email',purpose:'create-account'};
  return {state,post,request};
}

test('member number registers through stored email without SMS integration',async t=>{
 const {state,post,request}=await fixture(t,{ready:false});
 assert.equal((await post('/registerOtp',request)).status,201);
 assert.equal(state.emails,1);assert.equal(state.otp.sms_sent,true);
 const body={...request,otp:String(state.otp.pass_key),password:'Test-pass-123'};
 assert.equal((await post('/register',body)).status,201);
 assert.equal(state.users[0].member_no,'41');assert.ok(await bcrypt.compare(body.password,state.users[0].password));
 assert.equal((await post('/register',body)).status,409);
 assert.equal(state.legacyUsers[0].password,'legacy-password');
});
test('SMS choice sends only to stored phone, ignoring supplied contact overrides',async t=>{
 const {state,post,request}=await fixture(t);
 const result=await post('/registerOtp',{...request,channel:'sms',mobileNo:'0799999999',email:'other@example.invalid'});
 assert.equal(result.status,201);assert.equal(result.body.smsQueued,true);
 assert.equal(state.otp.phone_no,'254712345678');assert.equal(state.emails,0);
});
test('email or phone cannot replace member number',async t=>{
 const {post}=await fixture(t);
 assert.equal((await post('/registerOtp',{identifier:'member@example.invalid'})).status,400);
 assert.equal((await post('/registerOtp',{mobileNo:'0712345678'})).status,400);
});
test('inactive or unknown members cannot register',async t=>{
 const inactive=await fixture(t,{member:{closed:true}});
 assert.equal((await inactive.post('/registerOtp',inactive.request)).status,403);
 const missing=await fixture(t,{missing:true});assert.equal((await missing.post('/registerOtp',missing.request)).status,400);
});
test('member password reset verifies channel, expires and consumes OTP',async t=>{
 const {state,post}=await fixture(t,{existing:true});
 assert.equal((await post('/registerOtp',{memberNo:'41',channel:'email',purpose:'reset-password'})).status,201);
 const body={memberNo:'41',channel:'email',otp:String(state.otp.pass_key),newPassword:'New-pass-123'};
 assert.equal((await post('/change-password',{...body,channel:'sms'})).status,400);
 assert.equal((await post('/change-password',body)).status,200);
 assert.equal((await post('/change-password',body)).status,400);
});
test('expired OTP and failed email cannot create access',async t=>{
 const f=await fixture(t,{expired:true});await f.post('/registerOtp',f.request);
 assert.equal((await f.post('/register',{...f.request,otp:String(f.state.otp.pass_key),password:'Test-pass-123'})).status,400);
 const failed=await fixture(t,{emailFails:true});assert.equal((await failed.post('/registerOtp',failed.request)).status,503);assert.equal(failed.state.otp.used,true);
});
test('invalid channel and unavailable stored contact are rejected',async t=>{
 const f=await fixture(t,{member:{email_add:null}});
 assert.equal((await f.post('/registerOtp',f.request)).status,400);
 assert.equal((await f.post('/registerOtp',{...f.request,channel:'other'})).status,400);
});
