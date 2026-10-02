// Read-only integration check of the current server modules. Never posts trades or messages.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
const {Pool}=require('pg');
async function main(){
  if(process.env.DB_NAME!=='metrohealth_services')throw new Error('Expected metrohealth_services');
  const pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000,statement_timeout:10000,options:'-c default_transaction_read_only=on'});
  const app=express();app.use(express.json());app.use('/api/v1',require('../server/metrohealth')({pool,secret:process.env.JWT_SECRET}));
  let server;
  try{
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
    const token=jwt.sign({memberNo:'999999',role:'USER'},process.env.JWT_SECRET,{expiresIn:60,audience:'metrohealth_services',issuer:'metrohealth-portal'});
    const base=`http://127.0.0.1:${server.address().port}/api/v1`;
    for(const route of ['/share-market','/member/999999','/shareCapital/sumTotal/999999','/shareCapital/999999','/dividendPayable/sumTotal/999999','/dividend/999999','/header/1']){
      const response=await fetch(base+route,{headers:{Authorization:`Bearer ${token}`}});
      const body=await response.json();assert.equal(response.status,200,`${route}: ${body.message}`);
      if(route==='/share-market'){assert.ok(Array.isArray(body.listings));assert.ok(Array.isArray(body.trades));assert.equal(body.memberNo,'999999');}
      if(route==='/member/999999')assert.equal(body.holdersName,'Joe Wanjema Test');
      console.log('PASS',route);
    }
    assert.equal((await fetch(base+'/share-market')).status,401);
    assert.equal((await fetch(base+'/member/001',{headers:{Authorization:`Bearer ${token}`}})).status,403);
    console.log('PASS authentication and member isolation. Database connection was read-only throughout.');
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
