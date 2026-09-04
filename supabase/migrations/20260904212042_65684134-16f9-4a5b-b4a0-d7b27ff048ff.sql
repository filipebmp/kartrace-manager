CREATE TABLE public.stint_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stint_id text NOT NULL,
  stint_label text NOT NULL DEFAULT '',
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stint_audit_log TO authenticated;
GRANT ALL ON public.stint_audit_log TO service_role;

ALTER TABLE public.stint_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams insert own audit entries"
  ON public.stint_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teams read own audit entries"
  ON public.stint_audit_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX stint_audit_log_user_created_idx ON public.stint_audit_log (user_id, created_at DESC);