CREATE TABLE IF NOT EXISTS pb_mpesa_transactions (
  id                    SERIAL PRIMARY KEY,
  merchant_request_id   VARCHAR(100),
  checkout_request_id   VARCHAR(100) UNIQUE NOT NULL,
  member_no             VARCHAR(50) NOT NULL,
  purpose               VARCHAR(20) NOT NULL,        -- withdrawable_deposit|member_deposit|loan_repayment
  account_reference     VARCHAR(50) NOT NULL,        -- withdrawable acc_no, member_no, or loan_no
  phone_no              VARCHAR(15) NOT NULL,        -- 2547XXXXXXXX normalized
  amount                NUMERIC(14,2) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|success|failed|cancelled
  result_code           INTEGER,
  result_desc           TEXT,
  mpesa_receipt_no      VARCHAR(30),
  transaction_date      TIMESTAMP,
  callback_raw          JSONB,
  ledger_posted         BOOLEAN NOT NULL DEFAULT false,
  ledger_posted_at      TIMESTAMP,
  receipt_emailed       BOOLEAN NOT NULL DEFAULT false,
  sms_sent              BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_txn_member ON pb_mpesa_transactions(member_no);
CREATE INDEX IF NOT EXISTS idx_mpesa_txn_status ON pb_mpesa_transactions(status);
