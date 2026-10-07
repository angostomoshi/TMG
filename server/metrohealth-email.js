const nodemailer = require('nodemailer');

// Email is sent only to the address verified against the shareholder register.
module.exports = pool => async ({ record, code, purpose, verifyOnly = false }) => {
  const result = await pool.query(`SELECT smtp_host,smpt_port,smtp_username,smtp_password,
    protocols,require_auth,default_sender FROM public.pb_emailserver_settings
    WHERE company_id=$1 AND lower(coalesce(sender_type,''))='general' ORDER BY ids LIMIT 1`, [record.company_id]);
  const settings = result.rows[0];
  if (!settings) throw new Error('No company-scoped general email sender configured');
  const port = Number(settings.smpt_port || 587);
  const transport = nodemailer.createTransport({ host:settings.smtp_host,port,secure:port===465,
    requireTLS:port!==465, logger:false,debug:false,
    auth:settings.require_auth ? { user:settings.smtp_username,pass:settings.smtp_password } : undefined,
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000 });
  try {
    if (verifyOnly) { await transport.verify(); return; }
    const delivery = await transport.sendMail({ from:settings.default_sender || settings.smtp_username,to:record.email_add,
      subject: purpose==='create-account' ? 'TMG Shares Portal account setup OTP' : 'TMG Shares Portal password reset OTP',
      text:`Your TMG Shares Portal OTP is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this message.` });
    if (!delivery.accepted?.length || delivery.rejected?.length) throw new Error('Mail server did not accept the OTP recipient');
  } finally { transport.close(); }
};
