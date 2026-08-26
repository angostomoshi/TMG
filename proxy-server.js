require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3023;

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cookie', 'X-Requested-With']
}));

app.use(express.json());

// Disable caching
app.use('/api/v1', (req, res, next) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});
app.disable('etag');

// Logging middleware
function maskSensitiveBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const masked = { ...body };
  for (const key of Object.keys(masked)) {
    if (/password|token|secret|otp/i.test(key)) {
      masked[key] = '[REDACTED]';
    }
  }
  return masked;
}

app.use((req, res, next) => {
  console.log(`\n?? ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body:`, maskSensitiveBody(req.body));
  }
  next();
});

// Database connection
if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD environment variable is required.');
}
const dbPool = new Pool({
  host: process.env.DB_HOST || '192.168.4.10',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'metrosacco',
  user: process.env.DB_USER || 'centre',
  password: process.env.DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 10000,
});

dbPool.connect((err) => {
  if (err) {
    console.error('? Database connection failed:', err.message);
  } else {
    console.log('? Database connected successfully');
  }
});

const LIVE_API_BASE = process.env.LIVE_API_BASE || 'http://192.168.4.10:8080/api/v1';
const SPRING_API_BASE = process.env.SPRING_API_BASE || 'http://192.168.4.10:8080/api/v1';
const PROXY_JWT_SECRET = process.env.JWT_SECRET;
if (!PROXY_JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required.');
}

function isProxyIssuedAuthorization(authHeader) {
  if (!authHeader) return false;
  const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  try {
    jwt.verify(match[1], PROXY_JWT_SECRET);
    return true;
  } catch (error) {
    return false;
  }
}

// Real logins are frequently authenticated against the upstream Spring Boot
// service (see /auth/authenticate), which issues its own JWT rather than one
// signed with PROXY_JWT_SECRET. No endpoint in this app verifies that token's
// signature server-side — they all trust the member number supplied in the
// request. requireAuth matches that existing posture: it only requires a
// Bearer token to be present, then trusts the memberNo passed in the request
// body/params rather than a locally-verified claim.
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const match = authHeader && String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const memberNo = normalizeAuthMemberNo(req.body?.memberNo || req.params?.memberNo);
  req.auth = { memberNo };
  return next();
}

function addForwardedAuthorization(forwardHeaders, authHeader) {
  if (!authHeader) return;

  if (isProxyIssuedAuthorization(authHeader)) {
    console.log('   Skipping proxy-issued auth token for upstream request');
    return;
  }

  forwardHeaders['Authorization'] = authHeader;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
// Convert DD/MM/YYYY format to YYYY-MM-DD for PostgreSQL
function convertDateFormat(dateStr) {
  if (!dateStr) return null;
  
  // Handle multiple formats
  if (dateStr.includes('/')) {
    // DD/MM/YYYY format
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  } else if (dateStr.includes('-') && dateStr.length === 10) {
    // Already in YYYY-MM-DD or DD-MM-YYYY format - check if it's already correct
    const parts = dateStr.split('-');
    if (parts[0].length === 4) {
      // Already YYYY-MM-DD
      return dateStr;
    } else {
      // DD-MM-YYYY format
      const [day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }
  }
  
  return dateStr;
}

function normalizePhoneNumber(phoneNumber) {
  const rawValue = String(phoneNumber || '').trim();
  if (!rawValue) return '';

  const digits = rawValue.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

// ============================================
// M-PESA (DARAJA) HELPERS
// ============================================
const MPESA_BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

let mpesaTokenCache = { token: null, expiresAt: 0 };

async function getMpesaAccessToken() {
  if (mpesaTokenCache.token && Date.now() < mpesaTokenCache.expiresAt - 60000) {
    return mpesaTokenCache.token;
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not configured.');
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const response = await axios.get(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 15000,
  });

  const { access_token: token, expires_in: expiresIn } = response.data;
  mpesaTokenCache = {
    token,
    expiresAt: Date.now() + (Number(expiresIn || 3600) * 1000),
  };

  return token;
}

function buildMpesaTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function buildMpesaPassword(timestamp) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  if (!shortcode || !passkey) {
    throw new Error('MPESA_SHORTCODE / MPESA_PASSKEY are not configured.');
  }
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

async function initiateStkPush({ phoneNo, amount, accountReference, transactionDesc }) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;
  if (!callbackUrl) {
    throw new Error('MPESA_CALLBACK_URL is not configured.');
  }

  const accessToken = await getMpesaAccessToken();
  const timestamp = buildMpesaTimestamp();
  const password = buildMpesaPassword(timestamp);
  const callbackSecret = process.env.MPESA_CALLBACK_SECRET;
  const callbackUrlWithSecret = callbackSecret
    ? `${callbackUrl}${callbackUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(callbackSecret)}`
    : callbackUrl;

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(Number(amount)),
      PartyA: phoneNo,
      PartyB: shortcode,
      PhoneNumber: phoneNo,
      CallBackURL: callbackUrlWithSecret,
      AccountReference: String(accountReference).slice(0, 12),
      TransactionDesc: String(transactionDesc || 'Metro Sacco Payment').slice(0, 13),
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20000,
    }
  );

  return response.data;
}

function normalizeProtocol(protocols) {
  return String(protocols || '').trim().toUpperCase();
}

async function getEmailServerSettingsList() {
  const result = await dbPool.query(
    `SELECT smtp_host,
            smpt_port,
            smtp_username,
            smtp_password,
            protocols,
            require_auth,
            smtp_debug,
            default_sender,
            company_id,
            sender_type
     FROM pb_emailserver_settings
     ORDER BY
       CASE
         WHEN lower(coalesce(default_sender, '')) = 'sacco@metro-hospital.com' THEN 0
         WHEN lower(coalesce(smtp_username, '')) = 'sacco@metro-hospital.com' THEN 1
         WHEN lower(coalesce(sender_type, '')) = 'general' THEN 2
         ELSE 3
       END,
       company_id NULLS LAST`
  );

  if (result.rows.length === 0) {
    throw new Error('SMTP settings not configured');
  }

  return result.rows;
}

async function getEmailServerSettings() {
  const settings = await getEmailServerSettingsList();
  return settings[0];
}

function createEmailTransport(emailSettings) {
  const protocol = normalizeProtocol(emailSettings.protocols);
  const port = Number(emailSettings.smpt_port || 587);
  const secure = port === 465;

  return nodemailer.createTransport({
    host: emailSettings.smtp_host,
    port,
    secure,
    requireTLS: !secure && (protocol.includes('TLS') || protocol.includes('START')),
    auth: emailSettings.require_auth ? {
      user: emailSettings.smtp_username,
      pass: emailSettings.smtp_password,
    } : undefined,
    logger: Boolean(emailSettings.smtp_debug),
    debug: Boolean(emailSettings.smtp_debug),
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
}

async function sendWithSmtpFallback(mailOptions) {
  const settingsList = await getEmailServerSettingsList();
  const failures = [];

  for (const emailSettings of settingsList) {
    const sender = emailSettings.default_sender || emailSettings.smtp_username;
    const transport = createEmailTransport(emailSettings);

    try {
      const result = await transport.sendMail({
        ...mailOptions,
        from: sender,
      });
      console.log(`Email sent via ${emailSettings.smtp_host} as ${sender}`);
      return result;
    } catch (error) {
      const safeFailure = `${emailSettings.smtp_host}/${emailSettings.smtp_username}: ${error.code || ''} ${error.responseCode || ''} ${error.message}`.trim();
      failures.push(safeFailure);
      console.error(`Email send failed via ${safeFailure}`);
    }
  }

  throw new Error(`All SMTP senders failed: ${failures.join(' | ')}`);
}

async function sendOtpEmail({ recipientEmail, recipientName, memberNo, otpCode, purpose }) {
  const name = recipientName || 'Member';
  const isCreateAccount = purpose === 'create-account';
  const subject = isCreateAccount ? 'Metro Sacco Account Setup OTP' : 'Metro Sacco Password Reset OTP';
  const actionText = isCreateAccount ? 'create your Metro Sacco portal account' : 'change your Metro Sacco portal password';

  return sendWithSmtpFallback({
    to: recipientEmail,
    subject,
    text: `Hello ${name}

Your Metro Sacco OTP is ${otpCode}.
Use this code to ${actionText} for member number ${memberNo}.

If you did not request this OTP, please ignore this email.

Metro Sacco`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <p>Hello ${name},</p>
        <p>Your Metro Sacco OTP is:</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${otpCode}</p>
        <p>Use this code to ${actionText} for member number <strong>${memberNo}</strong>.</p>
        <p>If you did not request this OTP, you can ignore this email.</p>
        <p>Metro Sacco</p>
      </div>
    `,
  });
}

// ============================================
// LOAN APPLICATION EMAIL NOTIFICATIONS
// ============================================
async function sendLoanApplicationEmails({ memberNo, memberName, loanNo, amount, period, repayment, total, payMode }) {
  console.log(`\n?? [LOAN EMAIL] Sending loan application notifications for: ${memberNo}`);

  try {
    // 1. Fetch applicant's email from the member register
    const memberResult = await dbPool.query(
      `SELECT COALESCE(NULLIF(m.email_add, ''), '') AS email,
              COALESCE(NULLIF(m.holders_name, ''), $2) AS member_name
       FROM pb_share_register m
       WHERE m.acc_no = $1`,
      [memberNo, memberName]
    );

    const applicantEmail = memberResult.rows[0]?.email || null;
    const applicantName  = memberResult.rows[0]?.member_name || memberName || 'Member';

    // 2. Fetch SMTP settings
    const emailSettings = await getEmailServerSettings();
    const smtpPort  = Number(emailSettings.smpt_port || 587);
    const secure    = smtpPort === 465;
    const protocol  = normalizeProtocol(emailSettings.protocols);
    const sender    = emailSettings.default_sender || emailSettings.smtp_username;

    const transport = nodemailer.createTransport({
      host: emailSettings.smtp_host,
      port: smtpPort,
      secure,
      requireTLS: !secure && (protocol.includes('TLS') || protocol.includes('START')),
      auth: emailSettings.require_auth ? {
        user: emailSettings.smtp_username,
        pass: emailSettings.smtp_password,
      } : undefined,
      logger: Boolean(emailSettings.smtp_debug),
      debug:  Boolean(emailSettings.smtp_debug),
    });

    const appliedDate  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const formatKES = (val) => Number(val).toLocaleString('en-KE', { minimumFractionDigits: 2 });

    // -- Applicant confirmation email --------------------------------------
    if (applicantEmail) {
      await transport.sendMail({
        from: sender,
        to: applicantEmail,
        subject: `Metro Sacco – Instant Loan Application Received (${loanNo})`,
        text: [
          `Dear ${applicantName},`,
          ``,
          `Your instant loan application has been received and is pending approval.`,
          ``,
          `LOAN APPLICATION SUMMARY`,
          `---------------------------------`,
          `Loan Number   : ${loanNo}`,
          `Member No     : ${memberNo}`,
          `Amount Applied: KES ${formatKES(amount)}`,
          `Period        : ${period} Month(s)`,
          `Monthly Rep.  : KES ${formatKES(repayment)}`,
          `Total Repay.  : KES ${formatKES(total)}`,
          `Date Applied  : ${appliedDate}`,
          `Status        : Pending Approval`,
          `---------------------------------`,
          ``,
          `You will be notified once the loan has been reviewed. For any queries, please contact the Sacco office.`,
          ``,
          `Metropolitan Hospital Sacco Ltd`,
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto">
            <div style="background:#00a3b5;padding:24px 32px;border-radius:8px 8px 0 0">
              <h2 style="color:#ffffff;margin:0;font-size:18px">Metropolitan Hospital Sacco Ltd</h2>
              <p style="color:#e0f7fa;margin:4px 0 0;font-size:13px">Loan Application Received</p>
            </div>
            <div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none">
              <p>Dear <strong>${applicantName}</strong>,</p>
              <p>Your instant loan application has been received and is currently <strong>pending approval</strong>.</p>

              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
                <thead>
                  <tr style="background:#f3f4f6">
                    <th colspan="2" style="text-align:left;padding:10px 14px;border:1px solid #e5e7eb;color:#374151">Loan Application Summary</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Loan Number</td>   <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${loanNo}</td></tr>
                  <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Member No</td>     <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${memberNo}</td></tr>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Pay Mode</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${payMode || 'N/A'}</td></tr>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Amount Applied</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(amount)}</td></tr>
                  <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Period</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${period} Month(s)</td></tr>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Monthly Repay.</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(repayment)}</td></tr>
                  <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Total Repay.</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(total)}</td></tr>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Date Applied</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb">${appliedDate}</td></tr>
                  <tr style="background:#fff7ed"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Status</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600;color:#d97706">? Pending Approval</td></tr>
                </tbody>
              </table>

              <p style="font-size:13px;color:#6b7280">You will be notified once the loan has been reviewed. For any queries, please contact the Sacco office.</p>
            </div>
            <div style="background:#f9fafb;padding:14px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center">
              <p style="margin:0;font-size:12px;color:#9ca3af">Metropolitan Hospital Sacco Ltd &mdash; Automated Notification</p>
            </div>
          </div>`,
      });
      console.log(`   ??  Applicant confirmation sent to ${applicantEmail}`);
    } else {
      console.warn(`   ??  No email address found for member ${memberNo} – skipping applicant email`);
    }

    // -- Admin notification email ------------------------------------------
    const ADMIN_EMAILS = ['sacco@metro-hospital.com', 'pwawerun@gmail.com'];
    await transport.sendMail({
      from: sender,
      to: ADMIN_EMAILS.join(', '),
      subject: `[ACTION REQUIRED] New Instant Loan Application – ${memberNo} (${loanNo})`,
      text: [
        `Dear Sacco Administrator,`,
        ``,
        `A new instant loan application has been submitted and requires your approval.`,
        ``,
        `LOAN APPLICATION SUMMARY`,
        `---------------------------------`,
        `Loan Number   : ${loanNo}`,
        `Member No     : ${memberNo}`,
        `Member Name   : ${applicantName}`,
        `Pay Mode      : ${payMode || 'N/A'}`,
        `Amount Applied: KES ${formatKES(amount)}`,
        `Period        : ${period} Month(s)`,
        `Monthly Rep.  : KES ${formatKES(repayment)}`,
        `Total Repay.  : KES ${formatKES(total)}`,
        `Date Applied  : ${appliedDate}`,
        `Status        : Pending Approval`,
        `---------------------------------`,
        ``,
        `Please log in to the Sacco administration system to review and approve or decline this application.`,
        ``,
        `Metropolitan Hospital Sacco Ltd`,
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto">
          <div style="background:#b91c1c;padding:24px 32px;border-radius:8px 8px 0 0">
            <h2 style="color:#ffffff;margin:0;font-size:18px">Metropolitan Hospital Sacco Ltd</h2>
            <p style="color:#fecaca;margin:4px 0 0;font-size:13px">?? Action Required – New Loan Application</p>
          </div>
          <div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none">
            <p>Dear Sacco Administrator,</p>
            <p>A new instant loan application has been submitted and is awaiting your approval:</p>

            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
              <thead>
                <tr style="background:#f3f4f6">
                  <th colspan="2" style="text-align:left;padding:10px 14px;border:1px solid #e5e7eb;color:#374151">Loan Application Summary</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Loan Number</td>   <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${loanNo}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Member No</td>     <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${memberNo}</td></tr>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Member Name</td>   <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${applicantName}</td></tr>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Pay Mode</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${payMode || 'N/A'}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Amount Applied</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(amount)}</td></tr>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Period</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${period} Month(s)</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Monthly Repay.</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(repayment)}</td></tr>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Total Repay.</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(total)}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Date Applied</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb">${appliedDate}</td></tr>
                <tr style="background:#fff7ed"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Status</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600;color:#d97706">? Pending Approval</td></tr>
              </tbody>
            </table>

            <p style="font-size:13px">Please log in to the Sacco administration system to review and process this application.</p>
          </div>
          <div style="background:#f9fafb;padding:14px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Metropolitan Hospital Sacco Ltd &mdash; Automated Notification</p>
          </div>
        </div>`,
    });
    console.log(`   ??  Admin notification sent to ${ADMIN_EMAILS.join(', ')}`);

  } catch (emailErr) {
    // Email failure must never crash the loan registration flow
    console.error('   ? [LOAN EMAIL] Failed to send loan application emails:', emailErr.message);
  }
}

// ============================================
// M-PESA PAYMENT RECEIPT (PDF + EMAIL)
// ============================================
async function generatePaymentReceiptPdfBuffer({
  organisationName, memberName, memberNo, purpose, accountReference,
  amount, mpesaReceiptNo, transactionDate, newBalance,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const formatKES = (val) => Number(val || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const purposeLabel = purpose === 'loan_repayment' ? 'Loan Repayment' : 'Savings Deposit';

    doc.font('Helvetica-Bold').fontSize(14).text(organisationName, { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#00a3b5').text('M-PESA PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(1);

    const rows = [
      ['Member Name', memberName || 'N/A'],
      ['Member No', memberNo],
      ['Payment For', purposeLabel],
      ['Account Reference', accountReference],
      ['M-Pesa Receipt No', mpesaReceiptNo || 'N/A'],
      ['Date/Time', transactionDate ? new Date(transactionDate).toLocaleString('en-GB') : new Date().toLocaleString('en-GB')],
      ['Amount Paid (KES)', formatKES(amount)],
    ];
    if (newBalance !== null && newBalance !== undefined) {
      rows.push(['New Balance (KES)', formatKES(newBalance)]);
    }

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    rows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(`${label}:`, { continued: true, width: 200 });
      doc.font('Helvetica').text(`  ${value}`);
      doc.moveDown(0.4);
    });

    doc.moveDown(1);
    doc.fontSize(8).fillColor('#6b7280').text('This is a computer-generated receipt and does not require a signature.', { align: 'center' });

    doc.end();
  });
}

async function sendPaymentReceiptEmail({ recipientEmail, recipientName, memberNo, purpose, accountReference, amount, mpesaReceiptNo, pdfBuffer }) {
  const formatKES = (val) => Number(val || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const purposeLabel = purpose === 'loan_repayment' ? 'loan repayment' : 'savings deposit';

  return sendWithSmtpFallback({
    to: recipientEmail,
    subject: `Metro Sacco – M-Pesa Payment Receipt (${mpesaReceiptNo || accountReference})`,
    text: `Dear ${recipientName || 'Member'},\n\nWe have received your M-Pesa ${purposeLabel} of KES ${formatKES(amount)} (Receipt ${mpesaReceiptNo}). A copy of your receipt is attached.\n\nMetro Sacco`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <p>Dear ${recipientName || 'Member'},</p>
        <p>We have received your M-Pesa ${purposeLabel} of <strong>KES ${formatKES(amount)}</strong> (Receipt <strong>${mpesaReceiptNo}</strong>).</p>
        <p>A copy of your receipt is attached to this email.</p>
        <p>Metro Sacco</p>
      </div>
    `,
    attachments: [{ filename: `receipt-${mpesaReceiptNo || accountReference}.pdf`, content: pdfBuffer }],
  });
}

async function sendPaymentReceipt({ checkoutRequestId }) {
  const txnResult = await dbPool.query(
    `SELECT * FROM pb_mpesa_transactions WHERE checkout_request_id = $1`,
    [checkoutRequestId]
  );
  const txn = txnResult.rows[0];
  if (!txn || txn.status !== 'success') return;

  const memberResult = await dbPool.query(
    `SELECT holders_name, email_add FROM pb_share_register WHERE acc_no = $1`,
    [txn.member_no]
  );
  const member = memberResult.rows[0] || {};

  const headerResult = await dbPool.query('SELECT header_name FROM pb_header LIMIT 1');
  const organisationName = headerResult.rows[0]?.header_name || 'METROPOLITAN HOSPITAL SACCO LTD';

  let newBalance = null;
  if (txn.purpose === 'savings') {
    const balResult = await dbPool.query(
      `SELECT COALESCE(SUM(credit - debit), 0) AS balance FROM ac_wdeposit_payable WHERE account_no = $1`,
      [txn.account_reference]
    );
    newBalance = Number(balResult.rows[0]?.balance || 0);
  } else {
    const balResult = await dbPool.query(
      `SELECT COALESCE(SUM(balance - credit_bal), 0) AS balance FROM ac_debtors WHERE account_no = $1 AND invoice_no = $2`,
      [txn.member_no, txn.account_reference]
    );
    newBalance = Number(balResult.rows[0]?.balance || 0);
  }

  const pdfBuffer = await generatePaymentReceiptPdfBuffer({
    organisationName,
    memberName: member.holders_name,
    memberNo: txn.member_no,
    purpose: txn.purpose,
    accountReference: txn.account_reference,
    amount: txn.amount,
    mpesaReceiptNo: txn.mpesa_receipt_no,
    transactionDate: txn.transaction_date,
    newBalance,
  });

  if (member.email_add) {
    await sendPaymentReceiptEmail({
      recipientEmail: member.email_add,
      recipientName: member.holders_name,
      memberNo: txn.member_no,
      purpose: txn.purpose,
      accountReference: txn.account_reference,
      amount: txn.amount,
      mpesaReceiptNo: txn.mpesa_receipt_no,
      pdfBuffer,
    });
  }

  await dbPool.query(
    `UPDATE pb_mpesa_transactions SET receipt_emailed = true, updated_at = now() WHERE id = $1`,
    [txn.id]
  );
}

// ============================================
// DEBUG: Clear all OTPs for a member
// ============================================
// Endpoints handled by THIS proxy server locally (PDF generation etc.)
const LOCAL_ENDPOINTS = [
  '/test',
  '/auth/registerOtp',
  '/auth/change-password',
  '/auth/register',
  '/auth/authenticate',
  '/loan/apply',
  '/loan/dry-run',
  '/loan-statement-direct',
  '/withdrawable-statement-direct',
  '/mpesa/stkpush',
  '/mpesa/callback',
];

const LOCAL_ENDPOINT_PREFIXES = [
  '/instant/',
  '/loan-applications/',
  '/mpesa/status/',
];

// Endpoints that must go to the Spring Boot backend (port 8080)
const SPRING_ENDPOINTS = [
];

// ============================================
// MIDDLEWARE: Route requests
// ============================================
app.use('/api/v1', async (req, res, next) => {
  console.log(`\n?? Checking path: ${req.path}`);

  // Check if this is a locally-handled endpoint (PDF etc.)
  const isLocalEndpoint =
    LOCAL_ENDPOINTS.some(endpoint => req.path === endpoint) ||
    /^\/member\/[^/]+$/.test(req.path) ||
    LOCAL_ENDPOINT_PREFIXES.some(prefix => req.path.startsWith(prefix));

  if (isLocalEndpoint) {
    console.log(`   ? Handling locally: ${req.path}`);
    return next();
  }

  // Check if this should go to the Spring Boot backend
  const isSpringEndpoint = SPRING_ENDPOINTS.some(endpoint => req.path.startsWith(endpoint));

  if (isSpringEndpoint) {
    console.log(`   ?? FORWARDING to Spring Boot: ${req.path}`);
    try {
      // Map proxy paths to Spring Boot paths
      let springPath = req.path;
      if (req.path === '/auth/change-password') {
        // Frontend POSTs to /auth/change-password, Spring Boot expects PUT /auth/changePassword
        springPath = '/auth/changePassword';
      } else if (req.path === '/loan/apply') {
        springPath = '/instant/register';
      }

      const springUrl = `${SPRING_API_BASE}${springPath}`;
      console.log(`   ?? Spring URL: ${springUrl}`);

      // Map request body fields to Spring Boot's ChangePasswordRequest
      let springBody = req.body;
      if (req.path === '/auth/change-password') {
        springBody = {
          memberNo: req.body.memberNo,
          otp: parseInt(req.body.otp, 10),
          password: req.body.newPassword || req.body.password,
        };
        console.log(`   ?? Mapped body for Spring Boot:`, maskSensitiveBody(springBody));
      }

      // Snapshot original frontend loan fields BEFORE remapping
      const originalLoanBody = req.path === '/loan/apply' ? { ...req.body } : null;

      if (req.path === '/loan/apply') {
        springBody = {
          memNo: req.body.memberNo,
          memberName: req.body.memberName,
          amount: req.body.loanAmount,
          period: req.body.periodMonths,
          repayment: req.body.monthlyDeduction,
          total: req.body.totalAmount,
          interest: req.body.interestAmount,
          loanType: 'METRO SACCO INSTANT LOAN',
          loanPurpose: 'METRO SACCO INSTANT LOAN',
          purpose: 'METRO SACCO INSTANT LOAN',
          lpurpose: 'METRO SACCO INSTANT LOAN',
        };
        console.log(`   Mapped loan application body for Spring Boot:`, springBody);
      }

      const forwardHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      addForwardedAuthorization(forwardHeaders, req.headers.authorization);

      // Spring Boot expects PUT for changePassword
      const springMethod = req.path === '/auth/change-password' ? 'PUT' : req.method;

      const response = await axios({
        method: springMethod,
        url: springUrl,
        data: springBody,
        params: req.query,
        headers: forwardHeaders,
        timeout: 30000,
      });

      console.log(`   ? Spring Boot response: ${response.status}`);

      // -- Fire-and-forget email notifications for successful loan application --
      if (req.path === '/loan/apply' && response.status === 201 && originalLoanBody) {
        const createdLoan = response.data || {};
        setImmediate(() => {
          sendLoanApplicationEmails({
            memberNo:  originalLoanBody.memberNo,
            memberName: originalLoanBody.memberName,
            loanNo:    createdLoan.loanNo || createdLoan.loan_no || 'N/A',
            amount:    originalLoanBody.loanAmount,
            period:    originalLoanBody.periodMonths,
            repayment: originalLoanBody.monthlyDeduction,
            total:     originalLoanBody.totalAmount,
            payMode:   originalLoanBody.wstation || originalLoanBody.payMode,
          });
        });
        console.log(`   ?? Email notifications queued for loan application`);
      }

      return res.status(response.status).json(response.data);
    } catch (error) {
      console.error(`   ? Spring Boot error:`, error.message);
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      return res.status(500).json({ error: 'Spring Boot backend unavailable', message: error.message });
    }
  }

  // Default: Forward to live remote server
  console.log(`   ?? FORWARDING to live server: ${req.path}`);
  try {
    const liveUrl = `${LIVE_API_BASE}${req.path}`;
    console.log(`   ?? Forwarding to: ${liveUrl}`);

    const forwardHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    addForwardedAuthorization(forwardHeaders, req.headers.authorization);
    if (req.headers.cookie) {
      forwardHeaders['Cookie'] = req.headers.cookie;
    }
    if (req.headers['x-xsrf-token']) {
      forwardHeaders['X-XSRF-TOKEN'] = req.headers['x-xsrf-token'];
    }

    const response = await axios({
      method: req.method,
      url: liveUrl,
      data: req.body,
      params: req.query,
      headers: forwardHeaders,
      timeout: 30000,
      withCredentials: true,
    });

    console.log(`   ? Response: ${response.status}`);
    if (response.headers['set-cookie']) {
      res.setHeader('Set-Cookie', response.headers['set-cookie']);
    }
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Forwarding error:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Failed to connect to live server', message: error.message });
    }
  }
});


// ============================================
// LOCAL AUTH HELPERS
// ============================================
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

function normalizeAuthMemberNo(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneMatches(inputPhone, registeredPhone) {
  const input = normalizePhoneDigits(inputPhone);
  const registered = normalizePhoneDigits(registeredPhone);
  if (!input || !registered) return true;
  return input === registered || input.endsWith(registered.slice(-9)) || registered.endsWith(input.slice(-9));
}

function getOtpLoggedInFlag(purpose) {
  return String(purpose || '').trim().toLowerCase() === 'create-account' ? false : true;
}

async function getLatestUnusedOtp(memberNo, loggedInFlag = true) {
  const result = await dbPool.query(
    `SELECT id, pass_key, email, cdate
     FROM pb_sacco_passkey
     WHERE member_no = $1
       AND COALESCE(key_used, false) = false
       AND COALESCE(logged_in, loged_in, true) = $2
     ORDER BY cdate DESC NULLS LAST, id DESC
     LIMIT 1`,
    [memberNo, loggedInFlag]
  );

  return result.rows[0] || null;
}

async function verifyLatestOtp({ memberNo, otp, email, loggedInFlag = true }) {
  const normalizedOtp = Number(String(otp || '').trim());
  if (!Number.isFinite(normalizedOtp)) {
    return { ok: false, status: 400, message: 'Invalid OTP. Please check the code sent to your email.' };
  }

  const result = await dbPool.query(
    `SELECT id, pass_key, email, cdate
     FROM pb_sacco_passkey
     WHERE member_no = $1
       AND pass_key = $2
       AND COALESCE(key_used, false) = false
       AND COALESCE(logged_in, loged_in, true) = $3
       AND cdate >= NOW() - INTERVAL '30 minutes'
     ORDER BY cdate DESC NULLS LAST, id DESC
     LIMIT 1`,
    [memberNo, normalizedOtp, loggedInFlag]
  );

  const otpRecord = result.rows[0];
  if (!otpRecord) {
    return { ok: false, status: 400, message: 'Invalid OTP. Please check the latest code sent to your email.' };
  }

  if (email && otpRecord.email && String(otpRecord.email).trim().toLowerCase() !== String(email).trim().toLowerCase()) {
    return { ok: false, status: 400, message: 'This OTP was issued for a different email address. Please request a new OTP.' };
  }

  return { ok: true, otpRecord };
}
async function markMemberOtpsUsed(memberNo) {
  await dbPool.query(
    `UPDATE pb_sacco_passkey
     SET key_used = true
     WHERE member_no = $1
       AND COALESCE(key_used, false) = false`,
    [memberNo]
  );
}

// ============================================
// LOCAL ENDPOINT: AUTHENTICATE
// ============================================
app.post('/api/v1/auth/authenticate', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.body?.memberNo || req.body?.username);
  const password = String(req.body?.password || '').trim();

  console.log(`\n?? [LOCAL] Authenticating: ${memberNo}`);

  if (!memberNo || !password) {
    return res.status(400).json({ message: 'Member number and password are required.' });
  }

  try {
    try {
      const springResponse = await axios({
        method: 'POST',
        url: `${SPRING_API_BASE}/auth/authenticate`,
        data: { memberNo, password },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      console.log(`   Spring authentication succeeded for ${memberNo}`);
      return res.status(springResponse.status).json(springResponse.data);
    } catch (springError) {
      const status = springError.response?.status;
      const body = springError.response?.data;
      const springMessage = typeof body === 'string'
        ? body
        : body?.message || body?.error || springError.message || '';

      if (status && status < 500 && !/unique result/i.test(springMessage)) {
        return res.status(status).json(body || { message: springMessage || 'Invalid member number or password.' });
      }

      console.warn(`   Spring authentication failed for ${memberNo}; using local duplicate-safe fallback: ${springMessage}`);
    }

    const userResult = await dbPool.query(
      `SELECT id, member_no, email, mobile_no, password, COALESCE(role, 'USER') AS role, input_date
       FROM pb_users
       WHERE upper(trim(member_no)) = $1
       ORDER BY id DESC`,
      [memberNo]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid member number or password.' });
    }

    let matchedUser = null;
    for (const user of userResult.rows) {
      if (!user.password) continue;
      try {
        const matches = await bcrypt.compare(password, user.password);
        if (matches) {
          matchedUser = user;
          break;
        }
      } catch (compareError) {
        console.error(`Password compare failed for ${memberNo} row ${user.id}:`, compareError.message);
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ message: 'Invalid member number or password.' });
    }

    const memberResult = await dbPool.query(
      `SELECT acc_no, holders_name, id_no, email_add, tel1
       FROM pb_share_register
       WHERE upper(trim(acc_no)) = $1
       ORDER BY acc_no
       LIMIT 1`,
      [memberNo]
    );

    const member = memberResult.rows[0] || {};
    const role = String(matchedUser.role || 'USER').toUpperCase();
    const token = jwt.sign(
      {
        sub: matchedUser.member_no,
        memberNo: matchedUser.member_no,
        role,
        userId: matchedUser.id,
        proxyIssued: true,
      },
      PROXY_JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      success: true,
      token,
      memberNo: matchedUser.member_no,
      role,
      id: matchedUser.id,
      email: matchedUser.email || member.email_add || '',
      mobileNo: matchedUser.mobile_no || member.tel1 || '',
      holdersName: member.holders_name || matchedUser.member_no,
      message: 'Authentication successful.',
    });
  } catch (error) {
    console.error('? Local authentication failed:', error.message);
    return res.status(500).json({ message: 'Unable to sign in right now. Please try again later.' });
  }
});

// ============================================
// LOCAL ENDPOINT: HEALTH CHECK
// ============================================
app.get('/api/v1/test', (req, res) => {
  return res.json({
    success: true,
    message: 'Proxy server is running',
    database: 'connected',
  });
});

// ============================================
// LOCAL ENDPOINT: REPORT HEADER
// ============================================
app.get('/api/v1/header/:id', async (req, res) => {
  console.log(`\n?? [LOCAL] Fetching report header: ${req.params.id}`);

  try {
    const result = await dbPool.query(
      `SELECT header_name, company_logo, date, id
       FROM pb_header
       WHERE id = $1
       LIMIT 1`,
      [req.params.id]
    );

    const header = result.rows[0] || {};
    return res.json({
      id: header.id || Number(req.params.id),
      organisationName: header.header_name || 'METROPOLITAN HOSPITAL SACCO LTD',
      headerName: header.header_name || 'METROPOLITAN HOSPITAL SACCO LTD',
      companyLogo: header.company_logo || null,
      boxNo: 'P.O. Box 12345',
      postalCode: '00100',
      mainTelNo: '020-1234567',
      email: 'info@metro-sacco.com',
      date: header.date || null,
    });
  } catch (error) {
    console.error('Failed to fetch report header:', error.message);
    return res.status(500).json({ message: 'Unable to fetch report header right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: WITHDRAWABLE ACCOUNTS
// ============================================
app.get('/api/v1/withDrawable/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching withdrawable accounts for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT r.acc_no,
              r.holders_name,
              r.date AS reg_date,
              r.tel1,
              r.email_add,
              r.id_no,
              r.postal_address,
              COALESCE((
                SELECT SUM(COALESCE(p.credit, 0) - COALESCE(p.debit, 0))
                FROM ac_wdeposit_payable p
                WHERE p.account_no = r.acc_no
              ), 0) AS out_standing
       FROM pb_wdeposit_register r
       WHERE upper(trim(r.share_accno)) = $1
       ORDER BY r.date DESC NULLS LAST, r.id DESC`,
      [memberNo]
    );

    const data = result.rows.map((row) => ({
      accNo: row.acc_no,
      holdersName: row.holders_name,
      name: row.holders_name,
      regDate: row.reg_date,
      curDate: new Date().toISOString().slice(0, 10),
      outStanding: Number(row.out_standing || 0),
      tel1: row.tel1,
      emailAdd: row.email_add,
      idNo: row.id_no,
      postalAddress: row.postal_address,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to fetch withdrawable accounts:', error.message);
    return res.status(500).json({ message: 'Unable to fetch withdrawable accounts right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: MEMBER PROFILE
// ============================================
app.get('/api/v1/member/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching member profile for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const memberResult = await dbPool.query(
      `SELECT acc_no,
              holders_name,
              short_name,
              share_hold_status,
              nationality,
              resident,
              id_no,
              tel1,
              tel2,
              payroll_no,
              email_add,
              mem_category,
              postal_address,
              postal_code,
              street,
              avenue,
              locality,
              building_name,
              floor_no,
              gender,
              legal_stat,
              dob,
              bank_acc,
              bank_name,
              mode_ofpymt,
              date,
              nok1,
              nok1_pnoneno,
              relation1,
              nok2,
              nok2_pnoneno,
              relation2,
              nok3,
              nok3_pnoneno,
              relation3,
              loan_blacklisted,
              id
       FROM pb_share_register
       WHERE upper(trim(acc_no)) = $1
       ORDER BY id DESC NULLS LAST
       LIMIT 1`,
      [memberNo]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ message: 'Member record not found.' });
    }

    const member = memberResult.rows[0];
    return res.json({
      ...member,
      accNo: member.acc_no,
      memberNo: member.acc_no,
      holdersName: member.holders_name,
      name: member.holders_name,
      idNo: member.id_no,
      idNumber: member.id_no,
      tel1: member.tel1,
      phone: member.tel1,
      emailAdd: member.email_add,
      email: member.email_add,
      postalAddress: member.postal_address,
      postalCode: member.postal_code,
      memberCategory: member.mem_category,
      joinDate: member.date,
      createdAt: member.date,
      kraPin: null,
    });
  } catch (error) {
    console.error('Failed to fetch local member profile:', error.message);
    return res.status(500).json({ message: 'Unable to fetch member profile right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: GUARANTOR LIST
// ============================================
app.get('/api/v1/guarantor/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching guarantor list for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT loan_no, date as cur_date, lpurpose as loan_purpose, member_name,
              loan_amount as lamount, amt_guaranteed, balance as outstanding, gtype as guarantor_type
       FROM guarantors_view
       WHERE upper(trim(mem_no)) = $1
       ORDER BY date DESC NULLS LAST`,
      [memberNo]
    );

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        curDate: row.cur_date,
        loanNo: row.loan_no,
        loanPurpose: row.loan_purpose,
        memberName: row.member_name,
        lamount: Number(row.lamount || 0),
        amountGuaranteed: Number(row.amt_guaranteed || 0),
        outstanding: Number(row.outstanding || 0),
        guarantorType: row.guarantor_type,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch guarantor list:', error.message);
    return res.status(500).json({ message: 'Unable to fetch guarantor data right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: DASHBOARD BALANCE TOTALS
// ============================================
app.get('/api/v1/dividendPayable/sumTotal/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching dividend payable total for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT COALESCE(SUM(COALESCE(credit, 0) - COALESCE(debit, 0)), 0) AS balance
       FROM ac_dividends_payable
       WHERE upper(trim(account_no)) = $1`,
      [memberNo]
    );

    const sumTotal = Number(result.rows[0]?.balance || 0);
    return res.json({ success: true, sumTotal, total: sumTotal, balance: sumTotal });
  } catch (error) {
    console.error('Failed to fetch dividend payable total:', error.message);
    return res.status(500).json({ message: 'Unable to fetch dividend payable total right now.' });
  }
});

app.get('/api/v1/shareCapital/sumTotal/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching share capital total for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT COALESCE(SUM(REPLACE(credit, ',', '')::numeric), 0) AS balance
       FROM integration.shares_summ_view
       WHERE upper(trim(mem_no)) = $1
         AND deposit = 'Shares'`,
      [memberNo]
    );

    const sumTotal = Number(result.rows[0]?.balance || 0);
    return res.json({ success: true, sumTotal, total: sumTotal, balance: sumTotal });
  } catch (error) {
    console.error('Failed to fetch share capital total:', error.message);
    return res.status(500).json({ message: 'Unable to fetch share capital total right now.' });
  }
});

app.get('/api/v1/savings/sumTotal/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching savings total for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT COALESCE(SUM(REPLACE(credit, ',', '')::numeric), 0) AS balance
       FROM integration.shares_summ_view
       WHERE upper(trim(mem_no)) = $1
         AND deposit = 'Deposit'`,
      [memberNo]
    );

    const sumTotal = Number(result.rows[0]?.balance || 0);
    return res.json({ success: true, sumTotal, total: sumTotal, balance: sumTotal });
  } catch (error) {
    console.error('Failed to fetch savings total:', error.message);
    return res.status(500).json({ message: 'Unable to fetch savings total right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: DIVIDEND STATEMENT
// ============================================
app.get('/api/v1/dividend/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching dividend statement for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT date,
              initcap(item) AS item,
              reference_no,
              debit,
              credit,
              SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                OVER (ORDER BY date ASC NULLS FIRST, id ASC ROWS UNBOUNDED PRECEDING) AS running_balance
       FROM ac_dividends_payable
       WHERE upper(trim(account_no)) = $1
       ORDER BY date ASC NULLS LAST, id ASC`,
      [memberNo]
    );

    const data = result.rows.map((row, index) => ({
      inputDate: row.date,
      narration: row.item || 'Dividend Payment',
      refNo: row.reference_no || `DIV${index + 1}`,
      dividend: Number(row.credit || 0),
      paid: Number(row.debit || 0),
      runningTotal: Number(row.running_balance || 0),
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to fetch dividend statement:', error.message);
    return res.status(500).json({ message: 'Unable to fetch dividend data right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: SHARE CAPITAL STATEMENT
// ============================================
app.get('/api/v1/shareCapital/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching share capital statement for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT date,
              initcap(item) AS item,
              reference_no,
              debit,
              credit,
              SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                OVER (ORDER BY date ASC NULLS FIRST, id ASC ROWS UNBOUNDED PRECEDING) AS running_balance
       FROM ac_shares_ledger
       WHERE upper(trim(account_no)) = $1
         AND transaction_type ILIKE 'sha%'
       ORDER BY date ASC NULLS LAST, id ASC`,
      [memberNo]
    );

    const data = result.rows.map((row, index) => ({
      date: row.date,
      item: row.item,
      narration: row.item,
      refNo: row.reference_no || `SH${index + 1}`,
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      runningAmt: Number(row.running_balance || 0),
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to fetch share capital statement:', error.message);
    return res.status(500).json({ message: 'Unable to fetch share capital data right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: SAVINGS (WITHDRAWABLE DEPOSITS) STATEMENT
// ============================================
app.get('/api/v1/savings/:memberNo', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.params.memberNo);
  console.log(`\n?? [LOCAL] Fetching savings statement for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  try {
    const result = await dbPool.query(
      `SELECT p.date,
              initcap(p.item) AS item,
              p.reference_no,
              p.debit,
              p.credit,
              r.acc_no,
              SUM(COALESCE(p.credit, 0) - COALESCE(p.debit, 0))
                OVER (ORDER BY p.date ASC NULLS FIRST, p.account_no ASC, p.reference_no ASC ROWS UNBOUNDED PRECEDING) AS running_balance
       FROM pb_wdeposit_register r
       JOIN ac_wdeposit_payable p ON p.account_no = r.acc_no
       WHERE upper(trim(r.share_accno)) = $1
       ORDER BY p.date ASC NULLS LAST, p.account_no ASC, p.reference_no ASC`,
      [memberNo]
    );

    const data = result.rows.map((row, index) => ({
      inputDate: row.date,
      narration: row.acc_no ? `${row.item || 'Savings Transaction'} (${row.acc_no})` : (row.item || 'Savings Transaction'),
      refNo: row.reference_no || `SAV${index + 1}`,
      savings: Number(row.credit || 0) - Number(row.debit || 0),
      runningAmt: Number(row.running_balance || 0),
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to fetch savings statement:', error.message);
    return res.status(500).json({ message: 'Unable to fetch savings data right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: CHANGE PASSWORD
// ============================================
app.post('/api/v1/auth/change-password', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.body?.memberNo);
  const otp = String(req.body?.otp || '').trim();
  const password = String(req.body?.newPassword || req.body?.password || '').trim();

  console.log(`\n?? [LOCAL] Changing password for: ${memberNo}`);

  if (!memberNo) return res.status(400).json({ message: 'Member number is required.' });
  if (!otp) return res.status(400).json({ message: 'OTP is required.' });
  if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters long.' });

  try {
    const userResult = await dbPool.query(
      `SELECT id, member_no FROM pb_users WHERE upper(member_no) = $1 ORDER BY id DESC LIMIT 1`,
      [memberNo]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Portal account not found for that member number. Please create an account first.' });
    }

    const otpCheck = await verifyLatestOtp({ memberNo, otp });
    if (!otpCheck.ok) {
      return res.status(otpCheck.status).json({ message: otpCheck.message });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await dbPool.query(
      `UPDATE pb_users
       SET password = $1,
           otp = $2
       WHERE id = $3`,
      [passwordHash, Number(otp), userResult.rows[0].id]
    );

    await markMemberOtpsUsed(memberNo);

    return res.json({
      success: true,
      message: 'Password changed successfully. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('? Local password change failed:', error.message);
    return res.status(500).json({ message: 'Unable to change password right now. Please try again later.' });
  }
});

// ============================================
// LOCAL ENDPOINT: CREATE PORTAL ACCOUNT
// ============================================
app.post('/api/v1/auth/register', async (req, res) => {
  const memberNo = normalizeAuthMemberNo(req.body?.memberNo);
  const mobileNo = String(req.body?.mobileNo || req.body?.phoneNo || '').trim();
  const email = String(req.body?.email || '').trim();
  const otp = String(req.body?.otp || '').trim();
  const password = String(req.body?.password || req.body?.newPassword || '').trim();

  console.log(`\n?? [LOCAL] Creating portal account for: ${memberNo}`);

  if (!memberNo) return res.status(400).json({ message: 'Member number is required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'A valid email address is required.' });
  if (!mobileNo) return res.status(400).json({ message: 'Mobile number is required.' });
  if (!otp) return res.status(400).json({ message: 'OTP is required.' });
  if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters long.' });

  try {
    const memberResult = await dbPool.query(
      `SELECT acc_no, tel1
       FROM pb_share_register
       WHERE upper(acc_no) = $1
       ORDER BY acc_no
       LIMIT 1`,
      [memberNo]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ message: 'Member record not found for that member number.' });
    }

    if (!phoneMatches(mobileNo, memberResult.rows[0].tel1)) {
      return res.status(400).json({ message: 'The mobile number does not match this member account.' });
    }

    const otpCheck = await verifyLatestOtp({
      memberNo,
      otp,
      email,
      loggedInFlag: false,
    });
    if (!otpCheck.ok) {
      return res.status(otpCheck.status).json({ message: otpCheck.message });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const existingUser = await dbPool.query(
      `SELECT id FROM pb_users WHERE upper(member_no) = $1 ORDER BY id DESC LIMIT 1`,
      [memberNo]
    );

    if (existingUser.rows.length > 0) {
      await dbPool.query(
        `UPDATE pb_users
         SET email = $1,
             mobile_no = $2,
             otp = $3,
             password = $4,
             role = COALESCE(role, 'USER')
         WHERE id = $5`,
        [email, mobileNo, Number(otp), passwordHash, existingUser.rows[0].id]
      );
    } else {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('LOCK TABLE pb_users IN EXCLUSIVE MODE');
        const nextIdResult = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM pb_users`);
        const nextId = nextIdResult.rows[0].next_id;

        await client.query(
          `INSERT INTO pb_users (id, email, member_no, mobile_no, otp, password, role, input_date)
           VALUES ($1, $2, $3, $4, $5, $6, 'USER', CURRENT_DATE)`,
          [nextId, email, memberNo, mobileNo, Number(otp), passwordHash]
        );
        await client.query('COMMIT');
      } catch (insertError) {
        await client.query('ROLLBACK');
        throw insertError;
      } finally {
        client.release();
      }
    }

    await markMemberOtpsUsed(memberNo);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. You can now log in.',
    });
  } catch (error) {
    console.error('? Local account registration failed:', error.message);
    return res.status(500).json({ message: 'Unable to create the account right now. Please try again later.' });
  }
});
// ============================================
// LOCAL ENDPOINT: REGISTER/SEND OTP
// ============================================
app.post('/api/v1/auth/registerOtp', async (req, res) => {
  const memberNo = String(req.body?.memberNo || '').trim();
  const requestedEmail = String(req.body?.email || '').trim();
  const requestedMobile = String(req.body?.mobileNo || req.body?.phoneNo || '').trim();
  const loggedInFlag = getOtpLoggedInFlag(req.body?.purpose);
  console.log(`\nðŸ“§ [LOCAL] Sending OTP for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  if (requestedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    let memberResult;
    if (requestedEmail) {
      memberResult = await dbPool.query(
        `SELECT m.acc_no AS member_no,
                $2::text AS email,
                COALESCE(NULLIF(m.holders_name, ''), m.acc_no) AS member_name,
                COALESCE(NULLIF($3::text, ''), m.tel1) AS tel1
         FROM pb_share_register m
         WHERE m.acc_no = $1`,
        [memberNo, requestedEmail, requestedMobile]
      );
    } else {
      memberResult = await dbPool.query(
        `SELECT u.member_no,
                COALESCE(NULLIF(m.email_add, ''), NULLIF(u.email, '')) AS email,
                COALESCE(NULLIF(m.holders_name, ''), u.member_no) AS member_name,
                m.tel1
         FROM pb_users u
         LEFT JOIN pb_share_register m ON m.acc_no = u.member_no
         WHERE u.member_no = $1`,
        [memberNo]
      );
    }

    if (memberResult.rows.length === 0) {
      return res.status(404).json({
        message: requestedEmail
          ? 'Member record not found for that member number.'
          : 'Portal account not found for that member number.',
      });
    }

    const member = memberResult.rows[0];
    const smsPhoneNumber = normalizePhoneNumber(requestedMobile || member.tel1);
    if (!member.email) {
      return res.status(400).json({ message: 'No email address is registered for this member account.' });
    }

    const existingOtpResult = await dbPool.query(
      `SELECT id, pass_key, cdate
       FROM pb_sacco_passkey
       WHERE member_no = $1
         AND lower(coalesce(email, '')) = lower($2)
         AND COALESCE(logged_in, loged_in, true) = $3
         AND COALESCE(key_used, false) = false
         AND cdate >= NOW() - INTERVAL '10 minutes'
       ORDER BY cdate DESC NULLS LAST, id DESC
       LIMIT 1`,
      [memberNo, member.email, loggedInFlag]
    );

    let otpRecord = existingOtpResult.rows[0];
    const reusedExistingOtp = Boolean(otpRecord);

    if (!otpRecord) {
      await dbPool.query(
        `UPDATE pb_sacco_passkey
         SET key_used = true
         WHERE member_no = $1
           AND COALESCE(logged_in, loged_in, true) = $2
           AND key_used = false`,
        [memberNo, loggedInFlag]
      );

      const insertResult = await dbPool.query(
        `INSERT INTO pb_sacco_passkey (member_no, phone_no, email, logged_in, sms_sent, key_used)
         VALUES ($1, $2, $3, $4, false, false)
         RETURNING id, pass_key, cdate`,
        [memberNo, smsPhoneNumber || member.tel1 || null, member.email, loggedInFlag]
      );

      otpRecord = insertResult.rows[0];
    } else {
      await dbPool.query(
        `UPDATE pb_sacco_passkey
         SET phone_no = COALESCE($2, phone_no),
             sms_sent = false,
             key_used = false
         WHERE id = $1`,
        [otpRecord.id, smsPhoneNumber || null]
      );
      console.log(`   Re-sending existing active OTP ${otpRecord.id} for ${memberNo}`);
    }

    try {
      await sendOtpEmail({
        recipientEmail: member.email,
        recipientName: member.member_name,
        memberNo,
        otpCode: otpRecord.pass_key,
        purpose: req.body?.purpose,
      });
    } catch (emailError) {
      if (!reusedExistingOtp) {
        await dbPool.query(`UPDATE pb_sacco_passkey SET key_used = true WHERE id = $1`, [otpRecord.id]);
      }
      console.error('âŒ Failed to send OTP email:', emailError.message);
      return res.status(500).json({
        message: 'Failed to send OTP email. Please try again.',
      });
    }

    const smsEnabled = Boolean(smsPhoneNumber);
    const deliveryMessage = smsEnabled
      ? `OTP sent successfully. Please check your email or phone number for the code.`
      : `OTP sent successfully. Please check your email for the code.`;

    return res.status(201).json({
      memberNo,
      email: member.email,
      phoneNo: smsEnabled ? smsPhoneNumber : null,
      smsQueued: smsEnabled,
      message: deliveryMessage,
      sentAt: otpRecord.cdate,
    });
  } catch (error) {
    console.error('âŒ OTP email flow failed:', error.message);
    return res.status(500).json({
      message: 'Unable to send OTP right now. Please try again later.',
    });
  }
});

// ============================================
// LOCAL ENDPOINT: INSTANT LOAN APPLICATION
// ============================================
app.post('/api/v1/loan/apply', async (req, res) => {
  const {
    memberNo,
    memberName,
    loanAmount,
    periodMonths,
    payMode,
    wstation,
  } = req.body || {};

  const INSTANT_LOAN_INTEREST_RATE = 4.5; // % flat, per month

  const amount = Number(loanAmount || 0);
  const period = Number(periodMonths || 0);
  // Interest/total/repayment are always derived server-side from amount and
  // period — client-submitted figures are never trusted, since a stale or
  // tampered value would otherwise be written straight to the ledger.
  const interest = INSTANT_LOAN_INTEREST_RATE;
  const totalInterest = Math.round(amount * (INSTANT_LOAN_INTEREST_RATE / 100) * period * 100) / 100;
  const total = Math.round((amount + totalInterest) * 100) / 100;
  const repayment = period > 0 ? Math.round((total / period) * 100) / 100 : 0;
  const normalizedMemberNo = String(memberNo || '').trim();
  const rawPayMode = String(wstation || payMode || 'N/A').trim() || 'N/A';
  const normalizedPayMode = rawPayMode.toLowerCase() === 'checkoff'
    ? 'Check off'
    : rawPayMode === 'N/A'
      ? 'N/A'
      : rawPayMode.charAt(0).toUpperCase() + rawPayMode.slice(1).toLowerCase();

  console.log(`\nðŸ“ [LOCAL] Registering instant loan in pb_saccoloan for: ${normalizedMemberNo}`);

  if (!normalizedMemberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  if (!amount || amount <= 0 || !period || period <= 0) {
    return res.status(400).json({ message: 'Valid loan amount and period are required.' });
  }

  if (amount < 1000) {
    return res.status(400).json({ message: 'The minimum instant loan amount is KES 1,000.' });
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const memberResult = await client.query(
      `SELECT acc_no,
              holders_name,
              id_no,
              email_add,
              tel1,
              postal_address,
              postal_code,
              date AS member_since,
              COALESCE(loan_blacklisted, false) AS loan_blacklisted
       FROM pb_share_register
       WHERE acc_no = $1`,
      [normalizedMemberNo]
    );

    if (memberResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Member record not found.' });
    }

    const member = memberResult.rows[0];
    const formatKES = (value) => Number(value || 0).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const instantLoanCap = 50000;
    const minimumShareCapital = 10000;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (amount > instantLoanCap) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Instant loans are currently capped at KES ${formatKES(instantLoanCap)}. For higher loan amounts, please contact the Sacco office for guidance on other loan products.`,
        code: 'INSTANT_LOAN_CAP_EXCEEDED',
      });
    }

    if (period > 6) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Instant loans can only be repaid over a maximum of 6 months.',
        code: 'INSTANT_LOAN_PERIOD_EXCEEDED',
      });
    }

    if (member.loan_blacklisted) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'Your account is currently not eligible for instant loans. Please contact the Sacco office for assistance.',
        code: 'LOAN_BLACKLISTED',
      });
    }

    if (!member.member_since || new Date(member.member_since) > sixMonthsAgo) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'Instant loans are available to members who have been active for at least 6 months. Please contact the Sacco office if you need help.',
        code: 'MEMBERSHIP_TOO_NEW',
      });
    }

    const eligibilityResult = await client.query(
      `SELECT
         COALESCE((SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                   FROM ac_shares_ledger
                   WHERE account_no = $1), 0) AS shares_ledger_balance,
         COALESCE((SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                   FROM ac_shares_capital
                   WHERE account_no = $1), 0) AS share_capital,
         COALESCE((SELECT MAX(outstanding)
                   FROM (
                     SELECT SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)) AS outstanding
                     FROM ac_debtors d
                     JOIN pb_saccoloan l ON l.mem_no = d.account_no AND l.loan_no = d.invoice_no
                     WHERE d.account_no = $1
                       AND upper(coalesce(l.lpurpose, d.item, '')) LIKE '%INSTANT LOAN%'
                     GROUP BY d.invoice_no
                     HAVING SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)) > 0
                   ) unpaid_instant_loans), 0) AS active_instant_balance`,
      [normalizedMemberNo]
    );

    const eligibility = eligibilityResult.rows[0] || {};
    const sharesLedgerBalance = Number(eligibility.shares_ledger_balance || 0);
    const shareCapital = Number(eligibility.share_capital || 0);
    const activeInstantBalance = Number(eligibility.active_instant_balance || 0);
    const shareCapitalBasedLimit = sharesLedgerBalance * 3;

    if (shareCapital < minimumShareCapital) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: `Instant loan applications require minimum share capital of KES ${formatKES(minimumShareCapital)}. Your current share capital is KES ${formatKES(shareCapital)}.`,
        code: 'INSUFFICIENT_SHARE_CAPITAL',
        eligibility: { shareCapital, requiredShareCapital: minimumShareCapital },
      });
    }

    if (activeInstantBalance > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `You already have an unpaid instant loan balance of KES ${formatKES(activeInstantBalance)}. Please clear it before applying for another instant loan.`,
        code: 'EXISTING_INSTANT_LOAN_BALANCE',
        eligibility: { activeInstantBalance },
      });
    }

    if (sharesLedgerBalance < amount) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: `Your share capital balance is KES ${formatKES(sharesLedgerBalance)}. To apply for this instant loan, your share capital should be at least KES ${formatKES(amount)}.`,
        code: 'INSUFFICIENT_SHARE_CAPITAL_BALANCE',
        eligibility: { sharesLedgerBalance, requestedAmount: amount },
      });
    }

    if (amount > shareCapitalBasedLimit) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: `Based on your share capital of KES ${formatKES(sharesLedgerBalance)}, your maximum eligible loan is KES ${formatKES(shareCapitalBasedLimit)}. For higher amounts, please contact the Sacco office.`,
        code: 'SHARE_CAPITAL_MULTIPLE_EXCEEDED',
        eligibility: { sharesLedgerBalance, shareCapitalBasedLimit, requestedAmount: amount },
      });
    }

    const existingPendingResult = await client.query(
      `SELECT loan_no
       FROM pb_saccoloan
       WHERE mem_no = $1
         AND COALESCE(processed, false) = false
         AND upper(coalesce(lpurpose, '')) = 'METRO SACCO INSTANT LOAN'
       ORDER BY id DESC
       LIMIT 1`,
      [normalizedMemberNo]
    );

    if (existingPendingResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `You already have a pending instant loan application (${existingPendingResult.rows[0].loan_no}). Please wait for approval before applying again.`,
        loanNo: existingPendingResult.rows[0].loan_no,
      });
    }

    // pb_saccoloan has ON INSERT rules (loan_no and loan_noupdate) that assign
    // the real loan_no from the DB sequence and flip loan_update to true.
    // The portal inserts NULL for loan_no and reads the DB-assigned value back.
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + period);
    const applicantName = memberName || member.holders_name || normalizedMemberNo;

    const insertResult = await client.query(
      `INSERT INTO pb_saccoloan (
         mem_no,
         member_name,
         loan_no,
         postal_address,
         postal_code,
         email_address,
         id_no,
         lpurpose,
         pymt_terms,
         cdate,
         edate,
         amount,
         period,
         repayment,
         interest,
         premium,
         total,
         user_name,
         input_date,
         charge_int,
         processed,
         sms_sent,
         sms_processed,
         wstation,
         security
       )
       VALUES (
         $1, $2, NULL, $3, $4, $5, $6,
         'METRO SACCO INSTANT LOAN', 'monthly', $7, $8, $9, $10, $11, $12, $11, $13,
         'centre', $7, true, false, false, false, $14, 'Shares'
       )
       RETURNING id`,
      [
        normalizedMemberNo,
        applicantName,
        member.postal_address || null,
        member.postal_code || null,
        member.email_add || null,
        member.id_no || null,
        startDate,
        endDate,
        amount,
        period,
        repayment,
        interest,
        total,
        normalizedPayMode,
      ]
    );

    const newLoanId = insertResult.rows[0].id;
    const finalLoanResult = await client.query(
      `SELECT loan_no FROM pb_saccoloan WHERE id = $1`,
      [newLoanId]
    );
    const loanNo = finalLoanResult.rows[0].loan_no;

    await client.query('COMMIT');

    setImmediate(() => {
      sendLoanApplicationEmails({
        memberNo: normalizedMemberNo,
        memberName: applicantName,
        loanNo,
        amount,
        period,
        repayment,
        total,
        payMode: normalizedPayMode,
      });
    });

    return res.status(201).json({
      success: true,
      loanNo,
      loanNumber: loanNo,
      message: 'Instant loan application registered successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('âŒ Failed to register instant loan locally:', error.message);
    return res.status(500).json({
      message: 'We could not register the loan application right now.',
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// ============================================
// LOCAL ENDPOINT: M-PESA STK PUSH (INITIATE PAYMENT)
// ============================================
const MPESA_MIN_AMOUNT = 10;

app.post('/api/v1/mpesa/stkpush', requireAuth, async (req, res) => {
  const { memberNo, purpose, accountReference, amount, phoneNumber } = req.body || {};

  const normalizedMemberNo = normalizeAuthMemberNo(memberNo);
  const normalizedPurpose = String(purpose || '').trim().toLowerCase();
  const normalizedAccountRef = String(accountReference || '').trim();
  const numericAmount = Number(amount);

  console.log(`\n?? [LOCAL] M-Pesa STK push requested by ${req.auth.memberNo} for ${normalizedPurpose}`);

  if (req.auth.memberNo && normalizedMemberNo && req.auth.memberNo !== normalizedMemberNo) {
    return res.status(403).json({ message: 'You can only make payments on your own account.' });
  }

  if (!['savings', 'loan_repayment'].includes(normalizedPurpose)) {
    return res.status(400).json({ message: 'Purpose must be "savings" or "loan_repayment".' });
  }

  if (!normalizedAccountRef) {
    return res.status(400).json({ message: 'Account reference is required.' });
  }

  if (!Number.isFinite(numericAmount) || numericAmount < MPESA_MIN_AMOUNT) {
    return res.status(400).json({ message: `Enter a valid amount of at least KES ${MPESA_MIN_AMOUNT}.` });
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!/^254\d{9}$/.test(normalizedPhone)) {
    return res.status(400).json({ message: 'Enter a valid M-Pesa phone number.' });
  }

  try {
    let transactionDesc;

    if (normalizedPurpose === 'savings') {
      const accountResult = await dbPool.query(
        `SELECT r.acc_no
         FROM pb_wdeposit_register r
         WHERE r.acc_no = $1 AND upper(trim(r.share_accno)) = $2`,
        [normalizedAccountRef, req.auth.memberNo]
      );
      if (accountResult.rows.length === 0) {
        return res.status(404).json({ message: 'Savings account not found for this member.' });
      }
      transactionDesc = 'Metro Sacco Deposit';
    } else {
      const loanResult = await dbPool.query(
        `SELECT loan_no, mem_no,
                COALESCE((SELECT SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0))
                          FROM ac_debtors d WHERE d.account_no = pb_saccoloan.mem_no AND d.invoice_no = pb_saccoloan.loan_no), 0) AS outstanding
         FROM pb_saccoloan
         WHERE loan_no = $1 AND mem_no = $2`,
        [normalizedAccountRef, req.auth.memberNo]
      );
      if (loanResult.rows.length === 0) {
        return res.status(404).json({ message: 'Loan not found for this member.' });
      }
      if (Number(loanResult.rows[0].outstanding) <= 0) {
        return res.status(400).json({ message: 'This loan has no outstanding balance.' });
      }
      transactionDesc = `Loan ${normalizedAccountRef}`;
    }

    const stkResponse = await initiateStkPush({
      phoneNo: normalizedPhone,
      amount: numericAmount,
      accountReference: normalizedAccountRef,
      transactionDesc,
    });

    if (String(stkResponse.ResponseCode) !== '0') {
      return res.status(502).json({
        message: stkResponse.ResponseDescription || 'Could not initiate M-Pesa payment. Please try again.',
      });
    }

    await dbPool.query(
      `INSERT INTO pb_mpesa_transactions
         (merchant_request_id, checkout_request_id, member_no, purpose, account_reference, phone_no, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [
        stkResponse.MerchantRequestID,
        stkResponse.CheckoutRequestID,
        req.auth.memberNo,
        normalizedPurpose,
        normalizedAccountRef,
        normalizedPhone,
        numericAmount,
      ]
    );

    return res.status(202).json({
      success: true,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      customerMessage: stkResponse.CustomerMessage || 'Check your phone to complete the payment.',
    });
  } catch (error) {
    console.error('? M-Pesa STK push failed:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Unable to start M-Pesa payment right now. Please try again.' });
  }
});

// ============================================
// LOCAL ENDPOINT: M-PESA CALLBACK
// ============================================
function extractMpesaCallbackMetadata(items) {
  const map = {};
  (items || []).forEach((item) => {
    if (item && item.Name) {
      map[item.Name] = item.Value;
    }
  });
  return map;
}

app.post('/api/v1/mpesa/callback', async (req, res) => {
  const ackResponse = { ResultCode: 0, ResultDesc: 'Accepted' };

  if (process.env.MPESA_CALLBACK_SECRET && req.query.key !== process.env.MPESA_CALLBACK_SECRET) {
    console.warn('?? [MPESA CALLBACK] Rejected callback with missing/invalid key');
    return res.status(200).json(ackResponse);
  }

  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback || !callback.CheckoutRequestID) {
      console.warn('?? [MPESA CALLBACK] Malformed callback payload');
      return res.status(200).json(ackResponse);
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    if (Number(ResultCode) === 0) {
      const meta = extractMpesaCallbackMetadata(CallbackMetadata?.Item);
      const mpesaReceiptNo = meta.MpesaReceiptNumber || null;
      const paidAmount = Number(meta.Amount || 0);

      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');

        const txnResult = await client.query(
          `UPDATE pb_mpesa_transactions
           SET status = 'success',
               result_code = $2,
               result_desc = $3,
               mpesa_receipt_no = $4,
               transaction_date = now(),
               callback_raw = $5,
               updated_at = now()
           WHERE checkout_request_id = $1 AND ledger_posted = false
           RETURNING id, member_no, purpose, account_reference, amount`,
          [CheckoutRequestID, ResultCode, ResultDesc, mpesaReceiptNo, JSON.stringify(req.body)]
        );

        if (txnResult.rows.length > 0) {
          const txn = txnResult.rows[0];
          const postedAmount = paidAmount || Number(txn.amount);

          // 20-25-010 = "M-Pesa Pay Bill(C2B)" in pb_activity, the Sacco's existing
          // chart-of-accounts code for M-Pesa collections (already carries real
          // YTD volume from other M-Pesa flows) — required (NOT NULL) on
          // ac_wdeposit_payable and kept consistent on ac_debtors for reporting.
          const MPESA_ACTIVITY_CODE = '20-25-010';

          if (txn.purpose === 'savings') {
            await client.query(
              `INSERT INTO ac_wdeposit_payable (activity_code, account_no, date, item, reference_no, receipt_no, credit, debit)
               VALUES ($1, $2, now(), 'M-Pesa Deposit', $3, $4, $5, 0)`,
              [MPESA_ACTIVITY_CODE, txn.account_reference, CheckoutRequestID, mpesaReceiptNo, postedAmount]
            );
          } else {
            await client.query(
              `INSERT INTO ac_debtors (activity_code, account_no, invoice_no, date, item, reference_no, receipt_no, balance, credit_bal)
               VALUES ($1, $2, $3, now(), 'M-Pesa Repayment', $4, $5, 0, $6)`,
              [MPESA_ACTIVITY_CODE, txn.member_no, txn.account_reference, CheckoutRequestID, mpesaReceiptNo, postedAmount]
            );
          }

          await client.query(
            `UPDATE pb_mpesa_transactions SET ledger_posted = true, ledger_posted_at = now() WHERE id = $1`,
            [txn.id]
          );
        } else {
          // Already updated by a prior callback delivery for this CheckoutRequestID — update audit fields only.
          await client.query(
            `UPDATE pb_mpesa_transactions
             SET callback_raw = $2, updated_at = now()
             WHERE checkout_request_id = $1`,
            [CheckoutRequestID, JSON.stringify(req.body)]
          );
        }

        await client.query('COMMIT');

        setImmediate(() => {
          sendPaymentReceipt({ checkoutRequestId: CheckoutRequestID }).catch((err) => {
            console.error('? Failed to send M-Pesa payment receipt:', err.message);
          });
        });
      } catch (txnError) {
        await client.query('ROLLBACK').catch(() => {});
        throw txnError;
      } finally {
        client.release();
      }
    } else {
      const status = Number(ResultCode) === 1032 ? 'cancelled' : 'failed';
      await dbPool.query(
        `UPDATE pb_mpesa_transactions
         SET status = $2, result_code = $3, result_desc = $4, callback_raw = $5, updated_at = now()
         WHERE checkout_request_id = $1`,
        [CheckoutRequestID, status, ResultCode, ResultDesc, JSON.stringify(req.body)]
      );
    }

    return res.status(200).json(ackResponse);
  } catch (error) {
    console.error('? M-Pesa callback processing failed:', error.message);
    return res.status(200).json(ackResponse);
  }
});

// ============================================
// LOCAL ENDPOINT: M-PESA PAYMENT STATUS
// ============================================
app.get('/api/v1/mpesa/status/:checkoutRequestId', requireAuth, async (req, res) => {
  const { checkoutRequestId } = req.params;

  try {
    const result = await dbPool.query(
      `SELECT status, result_desc, mpesa_receipt_no, amount, purpose, account_reference,
              transaction_date, member_no, receipt_emailed
       FROM pb_mpesa_transactions
       WHERE checkout_request_id = $1`,
      [checkoutRequestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Payment request not found.' });
    }

    const txn = result.rows[0];

    return res.json({
      status: txn.status,
      resultDesc: txn.result_desc,
      receiptNo: txn.mpesa_receipt_no,
      amount: Number(txn.amount),
      purpose: txn.purpose,
      accountReference: txn.account_reference,
      transactionDate: txn.transaction_date,
      receiptEmailed: txn.receipt_emailed,
    });
  } catch (error) {
    console.error('? Failed to fetch M-Pesa status:', error.message);
    return res.status(500).json({ message: 'Unable to check payment status right now.' });
  }
});

// ============================================
// LOCAL ENDPOINT: INSTANT LOAN DRY RUN
// ============================================
app.post('/api/v1/loan/dry-run', async (req, res) => {
  const {
    memberNo,
    loanAmount,
    periodMonths,
    payMode,
    wstation,
  } = req.body || {};

  const INSTANT_LOAN_INTEREST_RATE = 4.5;
  const amount = Number(loanAmount || 0);
  const period = Number(periodMonths || 0);
  const interest = INSTANT_LOAN_INTEREST_RATE;
  const totalInterest = Math.round(amount * (INSTANT_LOAN_INTEREST_RATE / 100) * period * 100) / 100;
  const total = Math.round((amount + totalInterest) * 100) / 100;
  const repayment = period > 0 ? Math.round((total / period) * 100) / 100 : 0;
  const normalizedMemberNo = String(memberNo || '').trim();
  const rawPayMode = String(wstation || payMode || 'N/A').trim() || 'N/A';
  const normalizedPayMode = rawPayMode.toLowerCase() === 'checkoff'
    ? 'Check off'
    : rawPayMode === 'N/A'
      ? 'N/A'
      : rawPayMode.charAt(0).toUpperCase() + rawPayMode.slice(1).toLowerCase();

  console.log(`\n?? [LOCAL] Dry-running instant loan for: ${normalizedMemberNo}`);

  if (!normalizedMemberNo) {
    return res.status(400).json({ success: false, message: 'Member number is required.' });
  }

  if (!amount || amount <= 0 || !period || period <= 0) {
    return res.status(400).json({ success: false, message: 'Valid loan amount and period are required.' });
  }

  const formatKES = (value) => Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const instantLoanCap = 50000;
  const minimumShareCapital = 10000;

  if (amount < 1000) {
    return res.status(400).json({ success: false, message: 'The minimum instant loan amount is KES 1,000.' });
  }

  if (amount > instantLoanCap) {
    return res.status(400).json({
      success: false,
      message: `Instant loans are currently capped at KES ${formatKES(instantLoanCap)}. For higher loan amounts, please contact the Sacco office for guidance on other loan products.`,
      code: 'INSTANT_LOAN_CAP_EXCEEDED',
    });
  }

  if (period > 6) {
    return res.status(400).json({
      success: false,
      message: 'Instant loans can only be repaid over a maximum of 6 months.',
      code: 'INSTANT_LOAN_PERIOD_EXCEEDED',
    });
  }

  try {
    const memberResult = await dbPool.query(
      `SELECT acc_no,
              holders_name,
              date AS member_since,
              COALESCE(loan_blacklisted, false) AS loan_blacklisted
       FROM pb_share_register
       WHERE acc_no = $1`,
      [normalizedMemberNo]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Member record not found.' });
    }

    const member = memberResult.rows[0];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (member.loan_blacklisted) {
      return res.status(403).json({
        success: false,
        message: 'Your account is currently not eligible for instant loans. Please contact the Sacco office for assistance.',
        code: 'LOAN_BLACKLISTED',
      });
    }

    if (!member.member_since || new Date(member.member_since) > sixMonthsAgo) {
      return res.status(403).json({
        success: false,
        message: 'Instant loans are available to members who have been active for at least 6 months. Please contact the Sacco office if you need help.',
        code: 'MEMBERSHIP_TOO_NEW',
      });
    }

    const eligibilityResult = await dbPool.query(
      `SELECT
         COALESCE((SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                   FROM ac_shares_ledger
                   WHERE account_no = $1), 0) AS shares_ledger_balance,
         COALESCE((SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                   FROM ac_shares_capital
                   WHERE account_no = $1), 0) AS share_capital,
         COALESCE((SELECT MAX(outstanding)
                   FROM (
                     SELECT SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)) AS outstanding
                     FROM ac_debtors d
                     JOIN pb_saccoloan l ON l.mem_no = d.account_no AND l.loan_no = d.invoice_no
                     WHERE d.account_no = $1
                       AND upper(coalesce(l.lpurpose, d.item, '')) LIKE '%INSTANT LOAN%'
                     GROUP BY d.invoice_no
                     HAVING SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)) > 0
                   ) unpaid_instant_loans), 0) AS active_instant_balance`,
      [normalizedMemberNo]
    );

    const eligibility = eligibilityResult.rows[0] || {};
    const sharesLedgerBalance = Number(eligibility.shares_ledger_balance || 0);
    const shareCapital = Number(eligibility.share_capital || 0);
    const activeInstantBalance = Number(eligibility.active_instant_balance || 0);
    const shareCapitalBasedLimit = sharesLedgerBalance * 3;

    if (shareCapital < minimumShareCapital) {
      return res.status(403).json({
        success: false,
        message: `Instant loan applications require minimum share capital of KES ${formatKES(minimumShareCapital)}. Your current share capital is KES ${formatKES(shareCapital)}.`,
        code: 'INSUFFICIENT_SHARE_CAPITAL',
        eligibility: { shareCapital, requiredShareCapital: minimumShareCapital },
      });
    }

    if (activeInstantBalance > 0) {
      return res.status(409).json({
        success: false,
        message: `You already have an unpaid instant loan balance of KES ${formatKES(activeInstantBalance)}. Please clear it before applying for another instant loan.`,
        code: 'EXISTING_INSTANT_LOAN_BALANCE',
        eligibility: { activeInstantBalance },
      });
    }

    if (sharesLedgerBalance < amount) {
      return res.status(403).json({
        success: false,
        message: `Your share capital balance is KES ${formatKES(sharesLedgerBalance)}. To apply for this instant loan, your share capital should be at least KES ${formatKES(amount)}.`,
        code: 'INSUFFICIENT_SHARE_CAPITAL_BALANCE',
        eligibility: { sharesLedgerBalance, requestedAmount: amount },
      });
    }

    if (amount > shareCapitalBasedLimit) {
      return res.status(403).json({
        success: false,
        message: `Based on your share capital of KES ${formatKES(sharesLedgerBalance)}, your maximum eligible loan is KES ${formatKES(shareCapitalBasedLimit)}. For higher amounts, please contact the Sacco office.`,
        code: 'SHARE_CAPITAL_MULTIPLE_EXCEEDED',
        eligibility: { sharesLedgerBalance, shareCapitalBasedLimit, requestedAmount: amount },
      });
    }

    const existingPendingResult = await dbPool.query(
      `SELECT loan_no
       FROM pb_saccoloan
       WHERE mem_no = $1
         AND COALESCE(processed, false) = false
         AND upper(coalesce(lpurpose, '')) = 'METRO SACCO INSTANT LOAN'
       ORDER BY id DESC
       LIMIT 1`,
      [normalizedMemberNo]
    );

    if (existingPendingResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `You already have a pending instant loan application (${existingPendingResult.rows[0].loan_no}). Please wait for approval before applying again.`,
        code: 'EXISTING_PENDING_INSTANT_LOAN',
        loanNo: existingPendingResult.rows[0].loan_no,
      });
    }

    return res.json({
      success: true,
      dryRun: true,
      message: 'Instant loan dry run passed. No loan was created.',
      memberNo: normalizedMemberNo,
      memberName: member.holders_name,
      payMode: normalizedPayMode,
      calculation: {
        amount,
        periodMonths: period,
        monthlyInterestRate: interest,
        totalInterest,
        totalAmount: total,
        monthlyRepayment: repayment,
      },
      dbPreview: {
        interest,
        total,
        repayment,
      },
      eligibility: {
        shareCapital,
        sharesLedgerBalance,
        shareCapitalBasedLimit,
        activeInstantBalance,
      },
    });
  } catch (error) {
    console.error('Instant loan dry run failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to dry-run instant loan right now.',
      error: error.message,
    });
  }
});

// ============================================
// LOCAL ENDPOINT: ACTIVE INSTANT LOANS
// ============================================
app.get('/api/v1/instant/:memberNo', async (req, res) => {
  const { memberNo } = req.params;
  console.log(`\nðŸ“˜ [LOCAL] Fetching active instant loans for: ${memberNo}`);

  try {
    const activeLoanResult = await dbPool.query(
      `SELECT loan_no AS "loanNo",
              upper(lpurpose) AS "loanPurpose",
              cdate AS "startDate",
              edate AS "endDate",
              period,
              amount,
              COALESCE(NULLIF(wstation, ''), 'N/A') AS "payMode",
              SUM(balance - credit_bal) AS "outStanding"
       FROM ac_debtors, pb_saccoloan
       WHERE mem_no = account_no
         AND invoice_no = loan_no
         AND account_no = $1
       GROUP BY loan_no, lpurpose, amount, cdate, edate, period, wstation
       HAVING SUM(balance - credit_bal) <> 0
       ORDER BY cdate`,
      [memberNo]
    );

    if (activeLoanResult.rows.length === 0) {
      return res.json({
        status: 404,
        message: 'Could not fetch data',
        data: null,
      });
    }

    return res.json({
      status: 200,
      message: 'OK',
      data: activeLoanResult.rows,
    });
  } catch (error) {
    console.error('âŒ Failed to fetch active instant loans:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch active instant loans',
      message: error.message,
    });
  }
});

// ============================================
// LOCAL ENDPOINT: PENDING LOAN APPLICATIONS
// ============================================
app.get('/api/v1/loan-applications/:memberNo', async (req, res) => {
  const { memberNo } = req.params;
  console.log(`\nðŸ“‹ [LOCAL] Fetching pending loan applications for: ${memberNo}`);

  try {
    const pendingResult = await dbPool.query(
      `SELECT loan_no AS "loanNo",
              upper(lpurpose) AS "loanPurpose",
              cdate AS "startDate",
              edate AS "endDate",
              period,
              amount,
              total,
              repayment,
              interest,
              CASE
                WHEN interest > 100 THEN 4.5
                ELSE COALESCE(interest, 4.5)
              END AS "interestRate",
              COALESCE(NULLIF(wstation, ''), 'N/A') AS "payMode",
              COALESCE(total, amount, 0) AS "outStanding",
              true AS "isPending",
              'Pending Approval' AS status
       FROM pb_saccoloan
       WHERE mem_no = $1
         AND COALESCE(processed, false) = false
       ORDER BY cdate DESC, id DESC`,
      [memberNo]
    );

    return res.json({
      success: true,
      data: pendingResult.rows,
    });
  } catch (error) {
    console.error('âŒ Failed to fetch pending loan applications:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch pending loan applications',
      message: error.message,
    });
  }
});

// ============================================
// LOCAL ENDPOINT: LOAN STATEMENT PDF
// ============================================
app.post('/api/v1/loan-statement-direct', async (req, res) => {
  const {
    loanNo,
    memberNo,
    startDate,
    endDate,
    principalAmount,
    outstandingBalance,
    purpose: requestedPurpose,
    period: requestedPeriod,
    status: requestedStatus,
    isPending: requestedIsPending,
    payMode: requestedPayMode,
    interestRate: requestedInterestRate,
  } = req.body;
  console.log(`\nðŸ“„ [LOCAL] Generating PDF for Loan: ${loanNo}`);
  
  try {
    const headerResult = await dbPool.query("SELECT header_name FROM pb_header LIMIT 1");
    const organisationName = headerResult.rows[0]?.header_name || 'METROPOLITAN HOSPITAL SACCO LTD';
    
    let loanResult = await dbPool.query(
      `SELECT lpurpose as purpose, amount, cdate as start_date, edate as end_date, period, interest, wstation
       FROM pb_saccoloan WHERE loan_no = $1`,
      [loanNo]
    );

    let isPendingApplication = false;
    if (loanResult.rows.length === 0) {
      loanResult = await dbPool.query(
        `SELECT lpurpose as purpose,
                amount,
                cdate as start_date,
                edate as end_date,
                period,
                interest,
                wstation,
                repayment,
                total
         FROM pb_saccoloan1
         WHERE loan_no = $1`,
        [loanNo]
      );
      isPendingApplication = loanResult.rows.length > 0;
    }

    if (loanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    const loan = loanResult.rows[0];
    const normalizedStartDate = convertDateFormat(startDate) || loan.start_date;
    const requestedEndDate = convertDateFormat(endDate) || loan.end_date;
    const today = new Date().toISOString().slice(0, 10);
    // A loan's scheduled maturity date can be in the past while repayments keep
    // posting after it (overdue/extended loans), so never cut the transaction
    // window off earlier than today.
    const normalizedEndDate = requestedEndDate && requestedEndDate > today ? requestedEndDate : today;
    const displayPrincipal = parseFloat(principalAmount ?? loan.amount ?? 0) || 0;
    const displayOutstanding = parseFloat(outstandingBalance ?? loan.total ?? loan.amount ?? 0) || 0;
    const displayPurpose = requestedPurpose || loan.purpose || 'N/A';
    const displayPeriod = requestedPeriod ?? loan.period ?? 0;
    const displayStatus = requestedStatus || (requestedIsPending || isPendingApplication ? 'Pending Approval' : 'Active');
    const displayPayMode = requestedPayMode || loan.wstation || 'N/A';
    const displayInterestRate = requestedInterestRate ?? 4.5;
    
    const memberResult = await dbPool.query(
      `SELECT holders_name, id_no, tel1, email_add, acc_no 
       FROM pb_share_register WHERE acc_no = $1`,
      [memberNo]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const member = memberResult.rows[0];
    
    let openingBalance = 0;
    let transResult = { rows: [] };

    if (!isPendingApplication) {
      const openingResult = await dbPool.query(
        `SELECT COALESCE(SUM(balance - credit_bal), 0) as opening_balance
         FROM ac_debtors 
         WHERE account_no = $1 AND invoice_no = $2 AND date::date < $3::date`,
        [memberNo, loanNo, normalizedStartDate]
      );
      openingBalance = parseFloat(openingResult.rows[0]?.opening_balance || 0);

      transResult = await dbPool.query(
        `SELECT TO_CHAR(date, 'DD/MM/YYYY') as trans_date,
                initcap(item) as item, reference_no, receipt_no,
                COALESCE(balance, 0) as debit, COALESCE(credit_bal, 0) as credit
         FROM ac_debtors 
         WHERE account_no = $1 AND invoice_no = $2
           AND date::date BETWEEN $3::date AND $4::date
           AND (balance <> 0 OR credit_bal <> 0)
         ORDER BY date ASC`,
        [memberNo, loanNo, normalizedStartDate, normalizedEndDate]
      );
    }
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=loan-statement-${loanNo}.pdf`);
      res.send(pdfBuffer);
    });

    const pageLeft = 50;
    const pageRight = 550;
    const pageWidth = pageRight - pageLeft;
    const formatMoney = (value) => Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const drawSectionTitle = (title) => {
      doc.moveDown(0.2);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111827')
        .text(title, pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.35);
    };

    const drawReportFooter = () => {
      if (doc.y > 725) {
        doc.addPage();
      }

      doc.moveDown(0.7);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#374151')
        .text('This is a computer-generated statement.', pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.25);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
      doc.fillColor('#000000');
    };

    const drawInfoTable = (title, rows) => {
      drawSectionTitle(title);
      let y = doc.y + 6;
      const rowHeight = 20;
      const columns = [
        { x: pageLeft, width: 78, type: 'label' },
        { x: pageLeft + 78, width: 172, type: 'value' },
        { x: pageLeft + 250, width: 78, type: 'label' },
        { x: pageLeft + 328, width: 172, type: 'value' },
      ];

      rows.forEach((row) => {
        columns.forEach((column, index) => {
          doc.rect(column.x, y, column.width, rowHeight).stroke();
          doc
            .font(column.type === 'label' ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .text(row[index] || '', column.x + 4, y + 6, {
              width: column.width - 8,
              height: rowHeight - 6,
              ellipsis: true,
            });
        });
        y += rowHeight;
      });

      doc.y = y + 10;
    };

    const transactionColumns = [
      { key: 'date', label: 'Date', x: pageLeft, width: 52, align: 'left' },
      { key: 'description', label: 'Description', x: pageLeft + 52, width: 130, align: 'left' },
      { key: 'refNo', label: 'Ref No', x: pageLeft + 182, width: 58, align: 'left' },
      { key: 'receiptNo', label: 'Receipt No', x: pageLeft + 240, width: 58, align: 'left' },
      { key: 'debit', label: 'Debit (KES)', x: pageLeft + 298, width: 67, align: 'right' },
      { key: 'credit', label: 'Credit (KES)', x: pageLeft + 365, width: 67, align: 'right' },
      { key: 'balance', label: 'Running Amt (KES)', x: pageLeft + 432, width: 68, align: 'right' },
    ];

    const drawTransactionHeader = (y) => {
      doc.rect(pageLeft, y, pageWidth, 20).fillAndStroke('#f3f4f6', '#111827');
      transactionColumns.forEach((column) => {
        doc
          .fillColor('#111827')
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(column.label, column.x + 4, y + 6, {
            width: column.width - 8,
            align: column.align,
          });
      });
      doc.fillColor('#000000');
      return y + 20;
    };

    const drawTransactionRow = (y, row, options = {}) => {
      const rowHeight = options.rowHeight || 18;
      doc.rect(pageLeft, y, pageWidth, rowHeight).stroke();

      transactionColumns.forEach((column) => {
        doc.moveTo(column.x, y).lineTo(column.x, y + rowHeight).stroke();
        doc
          .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.5)
          .text(row[column.key] || '-', column.x + 4, y + 5, {
            width: column.width - 8,
            height: rowHeight - 5,
            align: column.align,
            ellipsis: true,
          });
      });
      doc.moveTo(pageRight, y).lineTo(pageRight, y + rowHeight).stroke();

      return y + rowHeight;
    };
    
    // Generate PDF
    doc.fontSize(16).font('Helvetica-Bold').text(organisationName, { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(isPendingApplication ? 'LOAN APPLICATION SUMMARY' : 'LOAN STATEMENT', { align: 'center' });
    doc.moveDown();
    
    drawInfoTable('MEMBER INFORMATION', [
      ['Name', member.holders_name || 'N/A', 'Member No', member.acc_no || memberNo],
      ['ID No', member.id_no || 'N/A', 'Phone', member.tel1 || 'N/A'],
      ['Email', member.email_add || 'N/A', 'Print Date', new Date().toLocaleDateString('en-GB')],
    ]);

    const loanInfoRows = [
      ['Loan Number', loanNo, 'Purpose', displayPurpose],
      ['Principal', `KES ${formatMoney(displayPrincipal)}`, 'Outstanding', `KES ${formatMoney(displayOutstanding)}`],
      ['Interest Rate', `${Number(displayInterestRate).toFixed(2)}% / month`, 'Period', `${displayPeriod || 0} months`],
      ['Pay Mode', displayPayMode, '', ''],
      ['Start Date', loan.start_date ? new Date(loan.start_date).toLocaleDateString('en-GB') : 'N/A', 'End Date', loan.end_date ? new Date(loan.end_date).toLocaleDateString('en-GB') : 'N/A'],
      ['Status', displayStatus, '', ''],
    ];
    if (isPendingApplication) {
      loanInfoRows.push([
        'Monthly Repayment',
        `KES ${formatMoney(loan.repayment)}`,
        'Total Repayable',
        `KES ${formatMoney(loan.total)}`,
      ]);
    }
    drawInfoTable('LOAN INFORMATION', loanInfoRows);

    if (isPendingApplication) {
      drawSectionTitle('APPLICATION STATUS');
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(10);
      doc.text('This loan was created successfully and is still pending approval/posting.', pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
      doc.text('A full transactional loan statement becomes available after the loan is posted to the live loan ledger.', pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
    } else {
      drawSectionTitle('TRANSACTION HISTORY');

      let runningBalance = openingBalance;
      let totalDebit = 0, totalCredit = 0;
      let y = doc.y + 10;

      y = drawTransactionHeader(y);
      y = drawTransactionRow(y, {
        date: '-',
        description: 'OPENING BALANCE',
        refNo: '-',
        receiptNo: '-',
        debit: '-',
        credit: '-',
        balance: formatMoney(openingBalance),
      }, { bold: true });

      for (const row of transResult.rows) {
        const debit = parseFloat(row.debit) || 0;
        const credit = parseFloat(row.credit) || 0;
        runningBalance = runningBalance + debit - credit;
        totalDebit += debit;
        totalCredit += credit;

        if (y > 700) {
          doc.addPage();
          y = 50;
          y = drawTransactionHeader(y);
        }

        y = drawTransactionRow(y, {
          date: row.trans_date || '-',
          description: row.item || 'Transaction',
          refNo: row.reference_no || '-',
          receiptNo: row.receipt_no || '-',
          debit: debit > 0 ? formatMoney(debit) : '-',
          credit: credit > 0 ? formatMoney(credit) : '-',
          balance: formatMoney(runningBalance),
        });
      }

      if (y > 680) {
        doc.addPage();
        y = drawTransactionHeader(50);
      }
      y += 4;
      y = drawTransactionRow(y, {
        date: '',
        description: 'TOTALS',
        refNo: '',
        receiptNo: '',
        debit: formatMoney(totalDebit),
        credit: formatMoney(totalCredit),
        balance: formatMoney(runningBalance),
      }, { bold: true });
      y = drawTransactionRow(y, {
        date: '',
        description: 'CLOSING BALANCE',
        refNo: '',
        receiptNo: '',
        debit: '',
        credit: '',
        balance: formatMoney(runningBalance),
      }, { bold: true });
      doc.y = y + 10;
    }
    
    drawReportFooter();
    doc.end();
    
  } catch (error) {
    console.error('   âŒ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LOCAL ENDPOINT: WITHDRAWABLE DEPOSIT STATEMENT PDF
// ============================================
app.post('/api/v1/withdrawable-statement-direct', async (req, res) => {
  const { accountNo, startDate, endDate } = req.body;
  console.log(`\nðŸ“„ [LOCAL] Generating Withdrawable Statement for: ${accountNo}`);
  
  try {
    const headerResult = await dbPool.query("SELECT header_name FROM pb_header LIMIT 1");
    const organisationName = headerResult.rows[0]?.header_name || 'METROPOLITAN HOSPITAL SACCO LTD';
    
    const accountResult = await dbPool.query(
      `SELECT holders_name, acc_no, tel1, postal_code, postal_address, id_no, email_add
       FROM pb_wdeposit_register WHERE acc_no = $1`,
      [accountNo]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const account = accountResult.rows[0];
    
    const openingResult = await dbPool.query(
      `SELECT COALESCE(SUM(credit - debit), 0) as opening_balance
       FROM ac_wdeposit_payable 
       WHERE account_no = $1 AND date::date < $2::date`,
      [accountNo, startDate]
    );
    const openingBalance = parseFloat(openingResult.rows[0]?.opening_balance || 0);
    
    const transResult = await dbPool.query(
      `SELECT TO_CHAR(date, 'DD/MM/YYYY') as trans_date,
              initcap(item) as item, reference_no, receipt_no,
              COALESCE(debit, 0) as debit, COALESCE(credit, 0) as credit
       FROM ac_wdeposit_payable 
       WHERE account_no = $1 
         AND date::date BETWEEN $2::date AND $3::date
         AND (debit <> 0 OR credit <> 0)
       ORDER BY date ASC`,
      [accountNo, startDate, endDate]
    );
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=withdrawable-statement-${accountNo}.pdf`);
      res.send(pdfBuffer);
    });

    const pageLeft = 50;
    const pageRight = 550;
    const pageWidth = pageRight - pageLeft;
    const formatMoney = (value) => Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const drawSectionTitle = (title) => {
      doc.moveDown(0.2);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111827')
        .text(title, pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.35);
    };

    const drawInfoTable = (title, rows) => {
      drawSectionTitle(title);
      let y = doc.y + 6;
      const rowHeight = 20;
      const columns = [
        { x: pageLeft, width: 78, type: 'label' },
        { x: pageLeft + 78, width: 172, type: 'value' },
        { x: pageLeft + 250, width: 78, type: 'label' },
        { x: pageLeft + 328, width: 172, type: 'value' },
      ];

      rows.forEach((row) => {
        columns.forEach((column, index) => {
          doc.rect(column.x, y, column.width, rowHeight).stroke();
          doc
            .font(column.type === 'label' ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .fillColor('#111827')
            .text(row[index] || '', column.x + 4, y + 6, {
              width: column.width - 8,
              height: rowHeight - 6,
              ellipsis: true,
            });
        });
        y += rowHeight;
      });

      doc.y = y + 10;
    };

    const transactionColumns = [
      { key: 'date', label: 'Date', x: pageLeft, width: 52, align: 'left' },
      { key: 'description', label: 'Narration', x: pageLeft + 52, width: 130, align: 'left' },
      { key: 'refNo', label: 'Ref No', x: pageLeft + 182, width: 58, align: 'left' },
      { key: 'receiptNo', label: 'Receipt No', x: pageLeft + 240, width: 58, align: 'left' },
      { key: 'debit', label: 'Withdrawn (KES)', x: pageLeft + 298, width: 67, align: 'right' },
      { key: 'credit', label: 'Deposited (KES)', x: pageLeft + 365, width: 67, align: 'right' },
      { key: 'balance', label: 'Running Amt (KES)', x: pageLeft + 432, width: 68, align: 'right' },
    ];

    const drawTransactionHeader = (y) => {
      doc.rect(pageLeft, y, pageWidth, 22).fillAndStroke('#f3f4f6', '#111827');
      transactionColumns.forEach((column) => {
        doc
          .fillColor('#111827')
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(column.label, column.x + 4, y + 6, {
            width: column.width - 8,
            align: column.align,
          });
      });
      doc.fillColor('#000000');
      return y + 22;
    };

    const drawTransactionRow = (y, row, options = {}) => {
      const rowHeight = options.rowHeight || 18;
      doc.rect(pageLeft, y, pageWidth, rowHeight).stroke();

      transactionColumns.forEach((column) => {
        doc.moveTo(column.x, y).lineTo(column.x, y + rowHeight).stroke();
        doc
          .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.5)
          .fillColor('#111827')
          .text(row[column.key] || '-', column.x + 4, y + 5, {
            width: column.width - 8,
            height: rowHeight - 5,
            align: column.align,
            ellipsis: true,
          });
      });
      doc.moveTo(pageRight, y).lineTo(pageRight, y + rowHeight).stroke();

      return y + rowHeight;
    };

    const drawReportFooter = () => {
      if (doc.y > 725) {
        doc.addPage();
      }

      doc.moveDown(0.7);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#374151')
        .text('This is a computer-generated statement.', pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.25);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
      doc.fillColor('#000000');
    };
    
    doc.fontSize(16).font('Helvetica-Bold').text(organisationName, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica-Bold').text('WITHDRAWABLE DEPOSITS STATEMENT', { align: 'center' });
    doc.moveDown();
    
    drawInfoTable('ACCOUNT INFORMATION', [
      ['Name', account.holders_name || 'N/A', 'Account No', account.acc_no || accountNo],
      ['ID No', account.id_no || 'N/A', 'Phone', account.tel1 || 'N/A'],
      ['Email', account.email_add || 'N/A', 'Print Date', new Date().toLocaleDateString('en-GB')],
    ]);

    drawInfoTable('STATEMENT PERIOD', [
      ['From', new Date(startDate).toLocaleDateString('en-GB'), 'To', new Date(endDate).toLocaleDateString('en-GB')],
    ]);

    drawSectionTitle('TRANSACTION HISTORY');
    
    let runningBalance = openingBalance;
    let totalDebit = 0, totalCredit = 0;
    let y = doc.y + 10;
    
    y = drawTransactionHeader(y);
    y = drawTransactionRow(y, {
      date: '-',
      description: 'BAL/BF',
      refNo: '-',
      receiptNo: '-',
      debit: '-',
      credit: '-',
      balance: formatMoney(openingBalance),
    }, { bold: true });
    
    for (const row of transResult.rows) {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + credit - debit;
      totalDebit += debit;
      totalCredit += credit;
      
      if (y > 700) {
        doc.addPage();
        y = 50;
        y = drawTransactionHeader(y);
      }
      
      y = drawTransactionRow(y, {
        date: row.trans_date || '-',
        description: row.item || 'Transaction',
        refNo: row.reference_no || '-',
        receiptNo: row.receipt_no || '-',
        debit: debit > 0 ? formatMoney(debit) : '-',
        credit: credit > 0 ? formatMoney(credit) : '-',
        balance: formatMoney(runningBalance),
      });
    }
    
    if (y > 680) {
      doc.addPage();
      y = drawTransactionHeader(50);
    }
    y += 4;
    y = drawTransactionRow(y, {
      date: '',
      description: 'TOTALS',
      refNo: '',
      receiptNo: '',
      debit: formatMoney(totalDebit),
      credit: formatMoney(totalCredit),
      balance: formatMoney(runningBalance),
    }, { bold: true });
    y = drawTransactionRow(y, {
      date: '',
      description: 'CLOSING BALANCE',
      refNo: '',
      receiptNo: '',
      debit: '',
      credit: '',
      balance: formatMoney(runningBalance),
    }, { bold: true });
    doc.y = y + 10;
    
    drawReportFooter();
    doc.end();
    
  } catch (error) {
    console.error('   âŒ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Start the server
// ============================================
app.listen(port, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ðŸš€ PROXY SERVER RUNNING on port ${port}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`ðŸ“ URL: http://localhost:${port}`);
  console.log(`\nðŸŒ± Spring Boot backend: ${SPRING_API_BASE}`);
  console.log(`ðŸ”„ Live remote server:  ${LIVE_API_BASE}`);
  console.log(`\nâœ… SPRING BOOT ENDPOINTS (â†’ localhost:8080):`);
  console.log(`\nðŸ“„ LOCAL ENDPOINTS (handled here):`);
  console.log(`   POST   /api/v1/auth/authenticate`);
  console.log(`   POST   /api/v1/auth/registerOtp`);
  console.log(`   POST   /api/v1/auth/change-password`);
  console.log(`   POST   /api/v1/auth/register`);
  console.log(`   POST   /api/v1/loan-statement-direct`);
  console.log(`   POST   /api/v1/withdrawable-statement-direct`);
  console.log(`\nðŸ§ª TEST ENDPOINT: http://localhost:${port}/api/v1/test`);
  console.log(`${'='.repeat(60)}\n`);
});



































