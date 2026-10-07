-- Dedicated TMG credentials: no inherited users or accounting records are modified.
CREATE TABLE IF NOT EXISTS public.tmg_portal_users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_no text NOT NULL UNIQUE CHECK (member_no = upper(trim(member_no)) AND member_no <> ''),
  mobile_no text NOT NULL,
  email text,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'USER' CHECK (role = 'USER'),
  created_at timestamptz NOT NULL DEFAULT now()
);
