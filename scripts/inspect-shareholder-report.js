require('dotenv').config({quiet:true});
const {Client}=require('pg');
async function main(){
 const db=new Client({host:process.env.DB_HOST,port:process.env.DB_PORT||5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000,statement_timeout:10000});
 await db.connect();
 try{
  console.log(JSON.stringify((await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='pb_share_register' ORDER BY ordinal_position")).rows));
  console.log(JSON.stringify((await db.query("SELECT right(bank_acc,4) AS payment_account_ending,right(tel1,4) AS telephone_ending,right(tel2,4) AS mobile_ending,mode_ofpymt FROM public.pb_share_register WHERE acc_no='582'")).rows));
  console.log(JSON.stringify((await db.query("SELECT sum(coalesce(credit,0)) AS dividends,sum(coalesce(debit,0)) AS paid,sum(coalesce(credit,0)-coalesce(debit,0)) AS balance FROM public.ac_dividends_payable WHERE account_no='582'")).rows));
  console.log(JSON.stringify((await db.query("SELECT viewname,definition FROM pg_views WHERE schemaname='public' AND viewname='share_reg_view'")).rows));
 }finally{await db.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
