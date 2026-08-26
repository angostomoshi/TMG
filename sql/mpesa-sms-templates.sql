CREATE OR REPLACE VIEW public.sms_mpesapayment AS
SELECT
  initcap(sc.holders_name::text) AS recipient_name,
  pb_mpesa_transactions.phone_no AS recipient_no,
  (
    'Dear '
    || COALESCE(NULLIF(sc.holders_name::text, ''), pb_mpesa_transactions.member_no::text)
    || ', your M-Pesa payment of KES '
    || trim(to_char(pb_mpesa_transactions.amount, 'FM999,999,999,990.00'))
    || ' (Receipt '
    || pb_mpesa_transactions.mpesa_receipt_no::text
    || ') for '
    || CASE
         WHEN pb_mpesa_transactions.purpose = 'loan_repayment'
           THEN 'loan ' || pb_mpesa_transactions.account_reference::text
         ELSE 'savings'
       END
    || ' has been received. Metro Sacco.'
  ) AS message,
  'pb_mpesa_transactions'::text AS reftable,
  'checkout_request_id'::text AS reffield,
  pb_mpesa_transactions.checkout_request_id AS refvalue,
  'sms_sent'::text AS refupdatefield
FROM pb_mpesa_transactions
JOIN pb_share_register sc
  ON pb_mpesa_transactions.member_no::text = sc.acc_no::text
WHERE pb_mpesa_transactions.status = 'success'
  AND pb_mpesa_transactions.sms_sent <> true;
