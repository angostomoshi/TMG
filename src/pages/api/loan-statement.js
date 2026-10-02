// pages/api/loan-statement.js
import { Pool } from 'pg';

// Database configuration
const pool = new Pool({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007',
  ssl: false,
  connectionTimeoutMillis: 5000,
});

export default async function handler(req, res) {
  // Allow all origins for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { memberNo, loanNo } = req.query;
  
  if (!memberNo || !loanNo) {
    return res.status(400).json({ error: 'Missing memberNo or loanNo' });
  }
  
  console.log(`Fetching statement for Member: ${memberNo}, Loan: ${loanNo}`);
  
  let client;
  
  try {
    client = await pool.connect();
    console.log('✅ Connected to database');
    
    // Test the connection
    const testResult = await client.query('SELECT NOW() as time');
    console.log('Database time:', testResult.rows[0].time);
    
    // Query for member basic info
    const memberQuery = `
      SELECT acc_no, holders_name, email_add, tel1 
      FROM pb_share_register 
      WHERE acc_no = $1
      LIMIT 1
    `;
    const memberResult = await client.query(memberQuery, [memberNo]);
    
    if (memberResult.rows.length === 0) {
      console.log('❌ Member not found');
      return res.status(404).json({ error: 'Member not found' });
    }
    
    console.log('✅ Member found:', memberResult.rows[0].holders_name);
    
    // Query for loan transactions from ac_debtors
    const transactionsQuery = `
      SELECT 
        TO_CHAR(date, 'YYYY-MM-DD') as date,
        receipt_no,
        item as description,
        reason,
        reference_no,
        COALESCE(balance, 0) as debit,
        COALESCE(credit_bal, 0) as credit,
        dispatch_no
      FROM ac_debtors 
      WHERE account_no = $1 
        AND invoice_no = $2
      ORDER BY date ASC
    `;
    
    const transactionsResult = await client.query(transactionsQuery, [memberNo, loanNo]);
    console.log(`✅ Found ${transactionsResult.rows.length} transactions`);
    
    // Calculate running balance
    let runningBalance = 0;
    const transactions = transactionsResult.rows.map(row => {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + debit - credit;
      
      return {
        date: row.date,
        receiptNo: row.receipt_no || 'N/A',
        description: row.description || 'N/A',
        reason: row.reason || '',
        referenceNo: row.reference_no || 'N/A',
        debit: debit,
        credit: credit,
        balance: runningBalance
      };
    });
    
    // Return real data
    res.status(200).json({
      success: true,
      memberInfo: {
        accNo: memberNo,
        name: memberResult.rows[0].holders_name,
        email: memberResult.rows[0].email_add,
        phone: memberResult.rows[0].tel1
      },
      transactions: transactions,
      totalTransactions: transactions.length
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message,
      hint: 'Check if database server is accessible'
    });
  } finally {
    if (client) {
      client.release();
      console.log('Database connection released');
    }
  }
}
