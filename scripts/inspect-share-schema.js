// Read-only discovery; intentionally excludes member names and account numbers.
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000, statement_timeout: 15000, options: '-c default_transaction_read_only=on' });
const phase = process.argv[2] || 'catalog';
const queries = {
  livePortal: [
    ['market schema', `SELECT to_regclass('share_market.listings') AS listings,to_regclass('share_market.trades') AS trades,to_regclass('share_market.events') AS events`],
    ['dividend tables', `SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ac_dividends_payable','pb_header') ORDER BY table_name,ordinal_position`],
  ],
  registrationCandidate: [
    ['target', `SELECT current_database() AS database, inet_server_addr() AS server`],
    ['registration candidate', `SELECT r.acc_no AS shareholder_number FROM public.pb_share_register r
      WHERE r.closed=false AND r.approved=true AND r.status='Approved' AND r.account_status='Alive'
        AND regexp_replace(coalesce(r.tel1,''),'[[:space:]()+-]','','g') ~ '^(254[17][0-9]{8}|0[17][0-9]{8}|[17][0-9]{8})$'
        AND NOT EXISTS (SELECT 1 FROM public.pb_users u WHERE upper(trim(u.member_no))=upper(trim(r.acc_no)))
        AND (SELECT count(*) FROM public.pb_share_register m WHERE upper(trim(m.acc_no))=upper(trim(r.acc_no)))=1
      ORDER BY r.acc_no LIMIT 1`],
  ],
  smsQueue: [
    ['queue columns', `SELECT table_schema,table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE (table_schema='integration' AND table_name IN ('sms','customized_sms')) ORDER BY 1,2,ordinal_position`],
    ['queue view', `SELECT schemaname,viewname,regexp_replace(definition, '''[^'']*''', '''[literal]''','g') AS definition FROM pg_views WHERE (schemaname='integration' AND viewname='poll_sms') OR (schemaname='public' AND viewname='sms_normal_messages')`],
  ],
  messaging: [
    ['messaging relations', `SELECT table_schema,table_name,table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name ~* '(sms|smtp|mail|passkey)' ORDER BY 1,2`],
    ['messaging settings columns', `SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name ~* '(sms.*(setup|setting|config)|smtp|email.*(setup|setting)|mail.*setup)' ORDER BY 2,ordinal_position`],
  ],
  registration: [
    ['database', `SELECT current_database() AS database`],
    ['otp and login columns', `SELECT table_schema,table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND (table_name IN ('pb_share_passkey','pb_sacco_passkey','pb_users') OR table_name ILIKE '%sms%config%') ORDER BY table_name,ordinal_position`],
    ['otp sms views', `SELECT schemaname,viewname,regexp_replace(definition, '''[^'']*''', '''[literal]''','g') AS definition FROM pg_views WHERE definition ~* '(pb_share_passkey|pb_sacco_passkey)' ORDER BY 1,2`],
    ['otp triggers', `SELECT c.relname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('pb_share_passkey','pb_sacco_passkey','pb_users')`],
    ['user constraints', `SELECT c.relname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relname IN ('pb_share_passkey','pb_sacco_passkey','pb_users')`],
  ],
  ms041: [
    ['target', `SELECT current_database() AS database, inet_server_addr() AS server`],
    ['member account', `SELECT acc_no,closed,approved,status,account_status,company_id FROM public.pb_share_register WHERE upper(trim(acc_no))='MS041'`],
    ['portal login availability', `SELECT count(*) AS login_records,count(*) FILTER (WHERE password IS NOT NULL AND trim(password)<>'') AS records_with_password FROM public.pb_users WHERE upper(trim(member_no))='MS041'`],
  ],
  healthTransfers: [
    ['indexes', `SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('ac_shares_ledger','ac_shares_journal','pb_share_register')`],
    ['transfer structure', `WITH groups AS (SELECT reference_no,count(*) AS entries,count(DISTINCT account_no) AS accounts,sum(coalesce(debit,0)) AS debits,sum(coalesce(credit,0)) AS credits FROM public.ac_shares_ledger WHERE item ILIKE 'transf%' GROUP BY reference_no) SELECT count(*) AS reference_groups,count(*) FILTER (WHERE accounts=2 AND debits=credits AND debits>0) AS balanced_two_account_groups,count(*) FILTER (WHERE reference_no IS NULL OR trim(reference_no)='') AS blank_reference_groups FROM groups`],
    ['ledger health', `SELECT count(*) AS rows,count(*) FILTER (WHERE account_no IS NULL OR trim(account_no)='') AS missing_accounts,count(*) FILTER (WHERE debit IS NULL OR credit IS NULL) AS null_amounts,count(*) FILTER (WHERE company_id IS NULL) AS missing_company,count(*) FILTER (WHERE approved) AS approved_rows,count(*)-count(DISTINCT id) AS duplicate_ids FROM public.ac_shares_ledger`],
    ['transfer view dependencies', `SELECT viewname,regexp_replace(definition, '''[^'']*''', '''[literal]''', 'g') AS redacted_definition FROM pg_views WHERE schemaname='public' AND viewname IN ('sms_share_transfer','sms_share_transferappr')`],
    ['share balances', `WITH b AS (SELECT account_no,sum(coalesce(credit,0)-coalesce(debit,0)) AS amount FROM public.ac_shares_ledger WHERE transaction_type='Shares' GROUP BY account_no) SELECT count(*) AS accounts,count(*) FILTER (WHERE amount<0) AS negative,count(*) FILTER (WHERE amount=0) AS zero,count(*) FILTER (WHERE amount>0) AS positive FROM b`],
  ],
  health: [
    ['connection', `SELECT current_database() AS database, inet_server_addr() AS server`],
    ['share relations', `SELECT table_schema,table_name,table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name ~* '(share|capital|company)' ORDER BY 1,2`],
    ['share views', `SELECT schemaname,viewname,definition FROM pg_views WHERE viewname IN ('share_reg_view','share_summ','sharetrans','shares_summ_view') ORDER BY 1,2`],
    ['constraints', `SELECT c.relname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('ac_shares_ledger','ac_shares_journal','pb_share_register')`],
    ['triggers', `SELECT c.relname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname IN ('ac_shares_ledger','ac_shares_journal','pb_share_register')`],
    ['ledger activity', `SELECT company_id,transaction_type,activity_code,count(*) AS rows,count(DISTINCT account_no) AS accounts,sum(coalesce(credit,0)-coalesce(debit,0)) AS net,min(date) AS first_date,max(date) AS last_date,count(*) FILTER (WHERE debit>0) AS debit_rows FROM public.ac_shares_ledger GROUP BY 1,2,3 ORDER BY count(*) DESC LIMIT 20`],
    ['member status', `SELECT company_id,closed,approved,status,account_status,count(*) AS members FROM public.pb_share_register GROUP BY 1,2,3,4,5 ORDER BY count(*) DESC LIMIT 20`],
    ['journal activity', `SELECT company_id,transaction_type,approved,appr_status,count(*) AS rows FROM public.ac_shares_journal GROUP BY 1,2,3,4 ORDER BY count(*) DESC LIMIT 15`],
    ['account uniqueness', `SELECT count(*) AS duplicated_company_account_groups FROM (SELECT company_id,upper(trim(acc_no)) FROM public.pb_share_register GROUP BY 1,2 HAVING count(*)>1) x`],
    ['related routines', `SELECT n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prosrc ~* '(ac_shares_ledger|ac_shares_journal)' ORDER BY 1,2`],
  ],
  locate: [
    ['connection', `SELECT current_database() AS database, inet_server_addr() AS server`],
    ['matching databases', `SELECT datname, datallowconn, has_database_privilege(datname,'CONNECT') AS can_connect FROM pg_database WHERE datname ~* '(metro|health|mhs)' ORDER BY datname`],
    ['matching schemas', `SELECT schema_name FROM information_schema.schemata WHERE schema_name ~* '(metro|health|mhs)' ORDER BY schema_name`],
    ['matching relations', `SELECT table_schema,table_name,table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name ~* '(metro|health|mhs)' ORDER BY table_schema,table_name`],
  ],
  balances: [
    ['capital activity', `SELECT transaction_type, activity_code, count(*) AS rows, count(DISTINCT account_no) AS accounts, sum(coalesce(credit,0)) AS credits, sum(coalesce(debit,0)) AS debits, sum(coalesce(credit,0)-coalesce(debit,0)) AS net, min(date) AS first_date, max(date) AS last_date, count(*) FILTER (WHERE approved) AS approved_rows FROM public.ac_shares_capital GROUP BY transaction_type,activity_code ORDER BY count(*) DESC LIMIT 25`],
    ['ledger activity', `SELECT transaction_type, activity_code, count(*) AS rows, count(DISTINCT account_no) AS accounts, sum(coalesce(credit,0)-coalesce(debit,0)) AS net, count(*) FILTER (WHERE coalesce(debit,0)<>0) AS debit_rows, min(date) AS first_date,max(date) AS last_date FROM public.ac_shares_ledger GROUP BY transaction_type,activity_code ORDER BY count(*) DESC LIMIT 25`],
    ['capital data quality', `SELECT count(*) AS rows, count(*) FILTER (WHERE account_no IS NULL OR trim(account_no)='') AS missing_account, count(*) FILTER (WHERE credit IS NULL OR debit IS NULL) AS null_amounts, count(*) FILTER (WHERE credit<0 OR debit<0) AS negative_entries, count(*) FILTER (WHERE credit>0 AND debit>0) AS both_sides, count(*) FILTER (WHERE balance IS DISTINCT FROM coalesce(credit,0)-coalesce(debit,0)) AS balance_differs_from_net, count(*) FILTER (WHERE item ILIKE '%transf%' OR transaction_type ILIKE '%transf%') AS transfer_labelled_rows FROM public.ac_shares_capital`],
    ['member uniqueness', `SELECT count(*) AS members, count(*) FILTER (WHERE closed) AS closed, count(*) FILTER (WHERE closed IS NULL) AS null_closed, count(*)-count(DISTINCT upper(trim(acc_no))) AS duplicate_normalized_accounts FROM public.pb_share_register`],
    ['capital reconciliation', `WITH c AS (SELECT upper(trim(account_no)) AS account, sum(coalesce(credit,0)-coalesce(debit,0)) AS net FROM public.ac_shares_capital GROUP BY 1), l AS (SELECT upper(trim(account_no)) AS account, sum(coalesce(credit,0)-coalesce(debit,0)) AS net, sum(coalesce(credit,0)) AS gross FROM public.ac_shares_ledger WHERE transaction_type ILIKE 'sha%' GROUP BY 1) SELECT count(*) FILTER (WHERE c.account IS NOT NULL) AS capital_accounts, count(*) FILTER (WHERE c.net<0) AS negative_capital_accounts, count(*) FILTER (WHERE c.account IS NOT NULL AND l.account IS NOT NULL) AS overlapping_accounts, count(*) FILTER (WHERE c.net IS DISTINCT FROM l.net) AS unequal_net_accounts, count(*) FILTER (WHERE l.net IS DISTINCT FROM l.gross) AS gross_differs_from_net FROM c FULL JOIN l USING (account)`],
    ['related routine names', `SELECT n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prosrc ~* '(ac_shares_capital|ac_shares_journal|ac_shares_ledger)' ORDER BY 1,2`],
    ['capital dependent views', `SELECT schemaname,viewname FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') AND definition ILIKE '%ac_shares_capital%' ORDER BY 1,2`],
    ['journal totals', `SELECT count(*) AS rows,count(*) FILTER (WHERE approved) AS approved,count(*) FILTER (WHERE paid) AS paid,min(date) AS first_date,max(date) AS last_date FROM public.ac_shares_journal`],
  ],
  focused: [
    ['columns', `SELECT table_name, string_agg(column_name || ':' || data_type || CASE WHEN is_nullable='NO' THEN ' REQUIRED' ELSE '' END || COALESCE(' DEFAULT '||column_default,''), ', ' ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ac_shares_capital','ac_shares_ledger','ac_shares_journal','pb_share_register','shareholders_changes','pb_users','ac_ledger','pb_sacco_guarantors') GROUP BY table_name ORDER BY table_name`],
    ['summary definition', `SELECT definition FROM pg_views WHERE schemaname='integration' AND viewname='shares_summ_view'`],
    ['constraints', `SELECT conrelid::regclass::text AS relation, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('public.ac_shares_capital'::regclass,'public.ac_shares_ledger'::regclass,'public.pb_share_register'::regclass,'public.ac_shares_journal'::regclass,'public.shareholders_changes'::regclass)`],
    ['triggers', `SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definition, p.proname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND c.oid IN ('public.ac_shares_capital'::regclass,'public.ac_shares_ledger'::regclass,'public.pb_share_register'::regclass,'public.ac_shares_journal'::regclass,'public.shareholders_changes'::regclass)`],
    ['indexes', `SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('ac_shares_capital','ac_shares_ledger','pb_share_register','ac_shares_journal','shareholders_changes')`],
  ],
  catalog: [
    ['relations', `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name ~* '(share|capital|member|transfer|journal|ledger|guarant|pledge|dividend|user|account|audit)' ORDER BY table_schema, table_name`],
    ['share columns', `SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name ~* '(share|capital|transfer)' ORDER BY table_schema,table_name,ordinal_position`],
    ['share views', `SELECT schemaname, viewname, definition FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') AND (viewname ~* '(share|capital)' OR definition ~* '(ac_shares_ledger|ac_share_capital)') ORDER BY schemaname,viewname`],
  ],
};
async function main() {
  try {
    if (!queries[phase]) throw new Error('Unknown inspection phase');
    await client.connect();
    await client.query('BEGIN READ ONLY');
    for (const [label, sql] of queries[phase]) {
      console.log(JSON.stringify({ section: label, rows: (await client.query(sql)).rows }));
    }
    await client.query('ROLLBACK');
  } catch (error) {
    console.error('Inspection failed:', error.code || 'UNKNOWN', error.message);
    process.exitCode = 1;
  } finally { await client.end(); }
}
main();
