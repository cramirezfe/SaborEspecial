-- Frontend error capture table.
-- The anon role can INSERT rows (write-only); no row can ever be read or
-- modified through the public API, keeping the log tamper-proof.

CREATE TABLE IF NOT EXISTS error_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url    text,
  message     text        NOT NULL,
  stack       text,
  user_agent  text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated service-role queries bypass RLS; no extra policy needed for
-- admins reading the table from the Supabase dashboard.
CREATE POLICY "anon_insert_errors"
  ON error_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);
