require('dotenv').config({quiet:true});
const {Client}=require('pg');
async function main(){
 if(process.env.DB_NAME!=='metrohealth_services')throw new Error('Unexpected database');
 const db=new Client({host:process.env.DB_HOST,port:process.env.DB_PORT||5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000,statement_timeout:10000});
 await db.connect();
 try{
  for(const [label,sql,args] of [
   ['OTP status',`SELECT id,cdate,sms_sent,key_used,now()-cdate AS age,cdate>=now()-interval '10 minutes' AS valid_time FROM public.pb_share_passkey WHERE phone_no=$1 AND user_name='tmg-shares-portal' ORDER BY cdate DESC LIMIT 3`,['254702890446']],
   ['SMS polling definition',`SELECT regexp_replace(pg_get_viewdef('integration.poll_sms'::regclass,true),'''[^'']*''','''[literal]''','g') AS definition`,[]],
   ['Worker queue',`SELECT count(*)::int AS queued FROM integration.poll_sms WHERE mobile=$1`,['254702890446']],
   ['Provider records for this request',`SELECT status,status_code,input_date,submission_date FROM integration.sms WHERE right(regexp_replace(mobile,'[^0-9]','','g'),9)='702890446' AND input_date >= (SELECT max(cdate) FROM public.pb_share_passkey WHERE phone_no='254702890446' AND user_name='tmg-shares-portal') ORDER BY input_date DESC LIMIT 5`,[]],
   ['Sent records for this request',`SELECT status,date_sent FROM public.sent_sms WHERE right(regexp_replace(phone,'[^0-9]','','g'),9)='702890446' AND date_sent >= (SELECT max(cdate) FROM public.pb_share_passkey WHERE phone_no='254702890446' AND user_name='tmg-shares-portal') ORDER BY date_sent DESC LIMIT 5`,[]],
   ['Recent SMS activity',`SELECT (SELECT max(input_date) FROM integration.sms) AS last_provider_record,(SELECT max(date_sent) FROM public.sent_sms) AS last_sent_record`,[]],
   ['OTP queue',`SELECT count(*)::int AS queued FROM public.sms_tmg_portal_otp WHERE recipient_no=$1`,['254702890446']]
  ]){console.log(label,JSON.stringify((await db.query(sql,args)).rows));}
 }finally{await db.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
