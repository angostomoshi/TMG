// Creates only an explicitly requested zero-capital test shareholder.
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const {normalizePhone}=require('../server/metrohealth-registration');
async function main(){
  const [account,name,phone,email]=process.argv.slice(2);
  if(process.env.DB_NAME!=='metrohealth_services' || process.env.DB_HOST!=='192.168.4.7')throw new Error('Unexpected target database');
  if(!/^99999[7-9]$/.test(account||'') || !/\bTest\b/.test(name||'') || !normalizePhone(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||''))throw new Error('Provide a reserved numeric test number, Test name, valid phone and email');
  const db=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000});
  try{
    await db.connect();await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='10s'");
    await db.query('LOCK TABLE public.pb_share_register IN SHARE ROW EXCLUSIVE MODE');
    const collision=await db.query(`SELECT EXISTS (
      SELECT 1 FROM public.pb_share_register WHERE upper(trim(acc_no))=$1
      UNION ALL SELECT 1 FROM public.pb_users WHERE upper(trim(member_no))=$1
      UNION ALL SELECT 1 FROM public.ac_shares_ledger WHERE upper(trim(account_no))=$1
      UNION ALL SELECT 1 FROM public.ac_shares_journal WHERE upper(trim(account_no))=$1
      UNION ALL SELECT 1 FROM public.pb_share_passkey WHERE upper(trim(member_no))=$1
      UNION ALL SELECT 1 FROM public.pb_sharehold_link WHERE upper(trim(code::text))=$1
    ) AS occupied`,[account]);
    if(collision.rows[0].occupied)throw new Error('This number already has linked records; no changes made');
    const inserted=await db.query(`INSERT INTO public.pb_share_register
      (acc_no,holders_name,short_name,tel1,email_add,date,closed,approved,status,account_status,company_id,print_label,reason,user_name)
      VALUES ($1,$2,'TEST ACCOUNT',$3,$4,CURRENT_DATE,false,true,'Approved','Alive',1,false,
      'Temporary portal registration demonstration requested by account holder; zero capital; disable after demo.','tmg-portal-test')
      RETURNING id,acc_no,holders_name`,[account,name,normalizePhone(phone),email.toLowerCase()]);
    const uniqueness=await db.query('SELECT count(*)::integer AS n FROM public.pb_share_register WHERE id=$1',[inserted.rows[0].id]);
    if(uniqueness.rows[0].n!==1)throw new Error('Legacy ID sequence needs review; insert rolled back');
    const verified=await db.query(`SELECT
      (SELECT count(*) FROM public.ac_shares_ledger WHERE account_no=$1)::integer AS ledger_entries,
      (SELECT count(*) FROM public.pb_users WHERE member_no=$1)::integer AS portal_logins,
      (SELECT count(*) FROM public.pb_share_passkey WHERE member_no=$1)::integer AS otp_records`,[account]);
    if(Object.values(verified.rows[0]).some(value=>value!==0))throw new Error('Unexpected linked records; rolled back');
    await db.query('COMMIT');
    console.log(JSON.stringify({created:inserted.rows[0],...verified.rows[0]}));
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
  finally{await db.end();}
}
main().catch(error=>{console.error('Test shareholder creation failed:',error.code||error.name,error.message);process.exitCode=1;});
