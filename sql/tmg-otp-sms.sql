-- Reviewed activation step: not applied automatically by the server.
-- No changes to shareholders, balances or existing user passwords.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $$ BEGIN
  IF current_database() <> 'metrohealth_services' THEN
    RAISE EXCEPTION 'This migration is for metrohealth_services only';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.sms_tmg_portal_otp AS
SELECT 'Shareholder'::text AS recipient_name,
       p.phone_no AS recipient_no,
       ('TMG Shares Portal: Your ' || CASE WHEN p.logged_in THEN 'password reset' ELSE 'account setup' END ||
        ' OTP is ' || p.pass_key::text || '. Valid for 10 minutes. Do not share this code.')::text AS message,
       'public.pb_share_passkey'::text AS reftable,
       'id'::text AS reffield,
       p.id::text AS refvalue,
       'sms_sent'::text AS refupdatefield
FROM public.pb_share_passkey p
WHERE p.user_name='tmg-shares-portal'
  AND p.sms_sent=false AND p.key_used=false
  AND p.cdate>=now()-interval '10 minutes'
  AND p.phone_no IS NOT NULL;

-- Preserve every existing SMS branch and the current column types/order.
-- integration.poll_sms already consumes sms_normal_messages.
DO $$
DECLARE original_definition text; new_columns text;
BEGIN
  SELECT pg_get_viewdef('public.sms_normal_messages'::regclass,true) INTO original_definition;
  IF position('sms_tmg_portal_otp' IN original_definition)=0 THEN
    SELECT string_agg(format('%I::%s AS %I',
      (ARRAY['recipient_name','recipient_no','message','reftable','reffield','refvalue','refupdatefield'])[attnum],
      format_type(atttypid,atttypmod),attname),',' ORDER BY attnum)
      INTO new_columns FROM pg_attribute
      WHERE attrelid='public.sms_normal_messages'::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE 'CREATE OR REPLACE VIEW public.sms_normal_messages AS ' ||
      regexp_replace(original_definition,';\s*$','') ||
      ' UNION ALL SELECT ' || new_columns || ' FROM public.sms_tmg_portal_otp';
  END IF;
END $$;
COMMIT;
