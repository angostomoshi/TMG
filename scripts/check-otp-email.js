require('dotenv').config({quiet:true});
const {Pool}=require('pg');
async function main(){
 if(process.env.DB_NAME!=='metrohealth_services')throw new Error('Unexpected database');
 const pool=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT||5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000,statement_timeout:10000,options:'-c default_transaction_read_only=on'});
 try{
  const {rows}=await pool.query("SELECT company_id,email_add FROM public.pb_share_register WHERE acc_no='999999'");
  if(rows.length!==1)throw new Error('Test shareholder missing');
  await require('../server/metrohealth-email')(pool)({record:rows[0],verifyOnly:true});
  console.log('PASS SMTP connection, TLS and authentication. No email sent or database rows changed.');
 }finally{await pool.end();}
}
main().catch(e=>{console.error('SMTP verification failed:',e.code||e.message);process.exitCode=1;});
