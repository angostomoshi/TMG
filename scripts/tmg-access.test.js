const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const metrohealth = require('../server/metrohealth');
const secret = 'test-only-secret';
async function fixture(t, registered) {
  const hash = await bcrypt.hash('test-password',4);
  const queries = [];
  const pool = {async query(sql,args) {
    queries.push({sql,args});
    if (sql.includes('public.pb_users')) throw new Error('Legacy credentials must not be accessed');
    if (sql.includes('public.tmg_portal_users')) return {rows:registered ? [{id:1,member_no:'41',password:hash,role:'USER'}] : []};
    if (sql.includes('public.pb_share_register')) return {rows:[{acc_no:'41',holders_name:'Test',closed:false,account_status:'Alive'}]};
    if (sql.includes('share_market.trades')) return {rows:[{id:'test-trade',status:'requested',needs_response:true}]};
    throw new Error('Unexpected query');
  }};
  const app=express();app.use(express.json());app.use(metrohealth({pool,secret}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  return {queries,base};
}
test('inherited credentials cannot sign in; dedicated TMG registration is required',async t=>{
  const {base}=await fixture(t,false);
  const response=await fetch(base+'/auth/authenticate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberNo:'41',password:'test-password'})});
  assert.equal(response.status,401);
});
test('TMG login issues a new portal session and alerts are scoped to its member',async t=>{
  const {base,queries}=await fixture(t,true);
  const response=await fetch(base+'/auth/authenticate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberNo:'41',password:'test-password'})});
  assert.equal(response.status,200);
  const {token}=await response.json();
  assert.equal(jwt.verify(token,secret).portalVersion,2);
  const alert=await fetch(base+'/share-market/notifications',{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(alert.status,200);assert.equal((await alert.json()).pending,1);
  assert.deepEqual(queries.at(-1).args,['41']);
  assert.match(queries.at(-1).sql,/t.buyer=\$1 OR t.seller=\$1/);
});
test('unauthenticated and previous portal sessions cannot read alerts',async t=>{
  const {base,queries}=await fixture(t,true);
  assert.equal((await fetch(base+'/share-market/notifications')).status,401);
  const old=jwt.sign({memberNo:'41'},secret,{audience:'metrohealth_services',issuer:'metrohealth-portal'});
  assert.equal((await fetch(base+'/share-market/notifications',{headers:{Authorization:`Bearer ${old}`}})).status,401);
  assert.equal(queries.length,0);
});


test('email identifiers no longer sign in',async t=>{
 const {base}=await fixture(t,true);
 const response=await fetch(base+'/auth/authenticate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'Member@example.invalid',password:'test-password'})});
 assert.equal(response.status,400);
});
