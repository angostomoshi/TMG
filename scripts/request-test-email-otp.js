require('dotenv').config({quiet:true});
const express=require('express');
const {Pool}=require('pg');
const {createRegistrationRouter,accountForContact,contactInput}=require('../server/metrohealth-registration');
async function main(){
 if(process.env.DB_NAME!=='metrohealth_services')throw new Error('Unexpected database target');
 const pool=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT||5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000,statement_timeout:10000});
 let server;
 try{
  const identifier='wawerujoe@gmail.com';
  if(await accountForContact(pool,contactInput({identifier}))!=='999999')throw new Error('Email does not uniquely match test shareholder 999999');
  const app=express();app.use(express.json());
  app.use(createRegistrationRouter({pool,sendEmail:require('../server/metrohealth-email')(pool)}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/registerOtp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberNo:'999999',channel:'email',purpose:'create-account'})});
  console.log(JSON.stringify({status:response.status,...await response.json()}));
  if(!response.ok)process.exitCode=1;
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
