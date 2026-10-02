require('dotenv').config({quiet:true});
const {Client}=require('pg');
async function main(){
  if(process.env.DB_NAME!=='metrohealth_services')throw new Error('Unexpected database');
  const db=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000,options:'-c default_transaction_read_only=on'});
  try{
    await db.connect();
    const queries=[
      ['member columns',`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='pb_share_register' ORDER BY ordinal_position`],
      ['free numeric test numbers',`SELECT candidate FROM (VALUES ('999999'),('999998'),('999997')) AS x(candidate) WHERE NOT EXISTS (SELECT 1 FROM public.pb_share_register WHERE upper(trim(acc_no))=x.candidate) AND NOT EXISTS (SELECT 1 FROM public.pb_users WHERE upper(trim(member_no))=x.candidate) AND NOT EXISTS (SELECT 1 FROM public.ac_shares_ledger WHERE upper(trim(account_no))=x.candidate) AND NOT EXISTS (SELECT 1 FROM public.ac_shares_journal WHERE upper(trim(account_no))=x.candidate)`],
      ['registration messaging dependencies',`SELECT viewname,regexp_replace(definition, '''[^'']*''', '''[literal]''','g') AS definition FROM pg_views WHERE schemaname='public' AND viewname LIKE 'sms_%' AND definition ILIKE '%pb_share_register%'`],
      ['member triggers',`SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t WHERE t.tgrelid='public.pb_share_register'::regclass AND NOT t.tgisinternal`],
    ];
    for(const [section,sql] of queries)console.log(JSON.stringify({section,rows:(await db.query(sql)).rows}));
  }finally{await db.end();}
}
main().catch(e=>{console.error(e.code||e.name,e.message);process.exitCode=1;});
