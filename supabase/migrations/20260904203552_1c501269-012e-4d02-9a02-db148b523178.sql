CREATE TABLE public.password_reset_attempts (
  email text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.password_reset_attempts TO service_role;

ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to reset attempts"
ON public.password_reset_attempts
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE TRIGGER update_password_reset_attempts_updated_at
BEFORE UPDATE ON public.password_reset_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.register_password_reset_attempt(_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_attempts constant integer := 5;
  window_len constant interval := interval '1 hour';
  block_len constant interval := interval '30 minutes';
  norm_email text := lower(trim(_email));
  row public.password_reset_attempts%ROWTYPE;
BEGIN
  SELECT * INTO row FROM public.password_reset_attempts WHERE email = norm_email FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.password_reset_attempts (email, attempts, window_start)
    VALUES (norm_email, 1, now())
    RETURNING * INTO row;
    RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  END IF;

  IF row.blocked_until IS NOT NULL AND row.blocked_until > now() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', ceil(extract(epoch FROM (row.blocked_until - now())))::int
    );
  END IF;

  IF row.window_start < now() - window_len OR (row.blocked_until IS NOT NULL AND row.blocked_until <= now()) THEN
    UPDATE public.password_reset_attempts
    SET attempts = 1, window_start = now(), blocked_until = NULL
    WHERE email = norm_email;
    RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  END IF;

  IF row.attempts + 1 > max_attempts THEN
    UPDATE public.password_reset_attempts
    SET attempts = row.attempts + 1, blocked_until = now() + block_len
    WHERE email = norm_email;
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', ceil(extract(epoch FROM block_len))::int
    );
  END IF;

  UPDATE public.password_reset_attempts
  SET attempts = row.attempts + 1
  WHERE email = norm_email;

  RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.register_password_reset_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_password_reset_attempt(text) TO service_role;