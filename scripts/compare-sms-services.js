require('dotenv').config({quiet:true});
const {Client}=require('pg');
const sacco=require('dotenv').parse(require('fs').readFileSync('C:/Sacco-Portal/.env'));
async function main(){
 for(const database of ['metrosacco','metrohealth_services']){
  const config=database==='metrosacco'?sacco:process.env;
  const db=new Client({host:config.DB_HOST,port:config.DB_PORT||5432,database,user:config.DB_USER,password:config.DB_PASSWORD,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000,statement_timeout:10000});
  await db.connect();
  try{
   console.log('DATABASE',database);
   for(const [label,sql] of [
    ['SMS activity',`SELECT max(input_date) AS latest_record,count(*) FILTER (WHERE input_date>=now()-interval '1 day') AS last_day FROM integration.sms`],
    ['Recent provider statuses',`SELECT status,status_code,count(*) FROM integration.sms WHERE input_date>=now()-interval '1 day' GROUP BY 1,2 LIMIT 10`],
    ['Configuration columns',`SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND (column_name ~* '(api_key|sms_url|sms_provider|sms_gateway)' OR table_name ~* '(sms.*(config|setting|setup)|(config|setting|setup).*sms)') ORDER BY 1,2,3`],
    ['SMS client candidates',`SELECT application_name,client_addr,state,backend_start,query_start,CASE WHEN query ILIKE '%poll_sms%' THEN 'SMS queue poll' WHEN query ILIKE '%integration.sms%' THEN 'SMS log access' ELSE 'OTP record access' END AS activity FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND (query ILIKE '%poll_sms%' OR query ILIKE '%integration.sms%' OR query ILIKE '%pb_sacco_passkey%')`],
    ['Connected clients',`SELECT application_name,client_addr,state,count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY 1,2,3`],
    ['Queue shape',`SELECT schemaname,viewname,regexp_replace(definition,'''[^'']*''','''[literal]''','g') AS definition FROM pg_views WHERE schemaname='integration' AND viewname='poll_sms'`]
   ])console.log(label,JSON.stringify((await db.query(sql)).rows));
  }finally{await db.end();}
 }
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
