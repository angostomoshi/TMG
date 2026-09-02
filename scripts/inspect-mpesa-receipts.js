require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '192.168.4.10',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'metrosacco',
  user: process.env.DB_USER || 'centre',
  password: process.env.DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 10000,
});

async function main() {
  const columns = await pool.query(
    `SELECT ordinal_position, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name = 'pb_mpesa_transactions'
     ORDER BY ordinal_position`
  );
  console.log('\npb_mpesa_transactions columns');
  console.table(columns.rows);

  const transactions = await pool.query(
    `SELECT *
     FROM pb_mpesa_transactions
     ORDER BY id DESC
     LIMIT 8`
  );
  console.log('\nRecent M-PESA transactions');
  console.table(transactions.rows);

  const triggers = await pool.query(
    `SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
     FROM information_schema.triggers
     WHERE event_object_table = 'pb_mpesa_transactions'
     ORDER BY trigger_name`
  );
  console.log('\nTriggers on pb_mpesa_transactions');
  console.table(triggers.rows);

  const rules = await pool.query(
    `SELECT schemaname, tablename, rulename, definition
     FROM pg_rules
     WHERE tablename = 'pb_mpesa_transactions'
     ORDER BY rulename`
  );
  console.log('\nRules on pb_mpesa_transactions');
  console.table(rules.rows);

  const sequences = await pool.query(
    `SELECT sequence_schema, sequence_name
     FROM information_schema.sequences
     WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
       AND (
         sequence_name ILIKE '%receipt%'
         OR sequence_name ILIKE '%mpesa%'
         OR sequence_name ILIKE '%tno%'
       )
     ORDER BY sequence_schema, sequence_name`
  );
  console.log('\nPossible receipt sequences');
  console.table(sequences.rows);

  const receiptTables = await pool.query(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_name ILIKE '%receipt%'
     ORDER BY table_schema, table_name`
  );
  console.log('\nPossible receipt tables');
  console.table(receiptTables.rows);
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
