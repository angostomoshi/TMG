require('dotenv').config({quiet:true});
const express=require('express');
const {Pool}=require('pg');
const {createRegistrationRouter,accountForPhone}=require('../server/metrohealth-registration');
async function main(){
  if(process.env.DB_NAME!=='metrohealth_services')throw new Error('Unexpected database target');
  const pool=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT||5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000,statement_timeout:10000});
  const app=express();app.use(express.json());app.use(createRegistrationRouter({pool}));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.on('listening',resolve));
    const response=await fetch(`http://127.0.0.1:${server.address().port}/registerOtp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberNo:await accountForPhone(pool,process.argv[2]),channel:'sms',purpose:'create-account'})});
    const result=await response.json();
    console.log(JSON.stringify({status:response.status,...result}));
    if(!response.ok)process.exitCode=1;
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
