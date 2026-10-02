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
  const state = { users: options.existing ? [{id:1}] : [], otp:null, emails:0 };
  let snapshot;
  const record = {acc_no:'41',tel1:'0712345678',email_add:'member@example.invalid',company_id:1,closed:false,approved:true,status:'Approved',account_status:'Alive',...options.member};
  const db = {release(){},async query(sql,args=[]) {
    if(sql==='BEGIN'){snapshot=structuredClone(state);return {rows:[]};}
    if(sql==='ROLLBACK'){Object.assign(state,snapshot);return {rows:[]};}
    if(sql==='COMMIT' || /^(SET LOCAL|SELECT pg_advisory|LOCK TABLE)/.test(sql))return {rows:[]};
    if(sql.includes('FROM public.pb_share_register'))return {rows: options.missing ? [] : [record]};
    if(sql.startsWith('SELECT id FROM public.pb_users'))return {rows:state.users};
    if(sql.includes('FROM pg_views'))return {rows:[{ready:options.ready!==false}]};
    if(sql.includes("interval '60 seconds'"))return {rows:[]};
    if(sql.startsWith('UPDATE public.pb_share_passkey')){if(state.otp)state.otp.used=true;return {rows:[]};}
    if(sql.startsWith('INSERT INTO public.pb_share_passkey')){state.otp={id:9,pass_key:args[3],phone_no:args[1],logged_in:args[4],used:false};return {rows:[{id:9}]};}
    if(sql.startsWith('SELECT id,pass_key,phone_no,email'))return {rows:state.otp && !state.otp.used && state.otp.logged_in===args[1] && !options.expired ? [state.otp] : []};
    if(sql.startsWith('INSERT INTO public.pb_users')){state.users.push({id:2,member_no:args[0],mobile_no:args[1],email:args[2],password:args[3],role:'USER'});return {rows:[]};}
    if(sql.startsWith('UPDATE public.pb_users')){state.users[0].password=args[0];return {rows:[]};}
    throw new Error(`Unexpected test query: ${sql.slice(0,60)}`);
  }};
  const pool={connect:async()=>db};
  const app=express();app.use(express.json());
  app.use(createRegistrationRouter({pool,sendEmail:async()=>{if(options.emailFails)throw new Error('Test SMTP unavailable');state.emails++;}}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function post(path,body){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
  const request={memberNo:'41',mobileNo:'0712345678',email:'member@example.invalid',purpose:'create-account'};
  return {state,post,request};
}

test('phone normalization preserves exact Kenyan numbers and rejects partial matches',()=>{
  assert.equal(normalizePhone('+254 712 345 678'),'254712345678');
  assert.equal(normalizePhone('0712345678'),'254712345678');
  assert.equal(normalizePhone('12345678'),null);
  assert.throws(()=>validatePassword('1234'));
});
test('registration queues an OTP to the stored phone, hashes password and consumes code',async t=>{
  const {state,post,request}=await fixture(t);
  const issued=await post('/registerOtp',request);
  assert.equal(issued.status,201);assert.equal(issued.body.smsQueued,true);
  assert.equal(state.otp.phone_no,'254712345678');assert.equal(issued.body.otp,undefined);
  const response=await post('/register',{...request,otp:String(state.otp.pass_key),password:'Test-pass-123'});
  assert.equal(response.status,201);assert.equal(state.users[0].role,'USER');
  assert.ok(await bcrypt.compare('Test-pass-123',state.users[0].password));assert.equal(state.otp.used,true);
  assert.equal((await post('/register',{...request,otp:String(state.otp.pass_key),password:'Other-pass-123'})).status,409);
});
test('different phone or email cannot receive an OTP',async t=>{
  const {state,post,request}=await fixture(t);
  assert.equal((await post('/registerOtp',{...request,mobileNo:'0799999999'})).status,400);
  assert.equal((await post('/registerOtp',{...request,email:'other@example.invalid'})).status,400);
  assert.equal(state.otp,null);assert.equal(state.emails,0);
});
test('inactive shareholders cannot create access',async t=>{
  const {state,post,request}=await fixture(t,{member:{closed:true}});
  assert.equal((await post('/registerOtp',request)).status,403);assert.equal(state.otp,null);
});
test('missing SMS integration fails without storing an OTP',async t=>{
  const {state,post,request}=await fixture(t,{ready:false});
  assert.equal((await post('/registerOtp',request)).status,503);assert.equal(state.otp,null);
});
test('registration cannot replace an existing password',async t=>{
  const {post,request}=await fixture(t,{existing:true});
  assert.equal((await post('/registerOtp',request)).status,409);
});
test('wrong or expired OTP cannot create a user',async t=>{
  const {state,post,request}=await fixture(t,{expired:true});
  await post('/registerOtp',request);
  assert.equal((await post('/register',{...request,otp:String(state.otp.pass_key),password:'Test-pass-123'})).status,400);
  assert.equal(state.users.length,0);
});
test('password reset verifies its own purpose and consumes OTP once',async t=>{
  const {state,post}=await fixture(t,{existing:true});
  assert.equal((await post('/registerOtp',{memberNo:'41',purpose:'reset-password'})).status,201);
  assert.equal(state.otp.logged_in,true);
  const body={memberNo:'41',otp:String(state.otp.pass_key),newPassword:'New-pass-123'};
  assert.equal((await post('/change-password',body)).status,200);
  assert.ok(await bcrypt.compare('New-pass-123',state.users[0].password));
  assert.equal((await post('/change-password',body)).status,400);
});
test('email failure still reports SMS as queued rather than delivered',async t=>{
  const {post,request}=await fixture(t,{emailFails:true});
  const response=await post('/registerOtp',request);
  assert.equal(response.status,201);assert.equal(response.body.emailSent,false);assert.equal(response.body.smsQueued,true);
});
