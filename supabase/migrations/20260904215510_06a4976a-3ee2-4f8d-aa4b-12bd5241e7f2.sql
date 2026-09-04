CREATE TABLE public.race_event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  stint_id TEXT NOT NULL,
  stint_label TEXT NOT NULL DEFAULT '',
  event_at TIMESTAMP WITH TIME ZONE NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.race_event_log TO authenticated;
GRANT ALL ON public.race_event_log TO service_role;

ALTER TABLE public.race_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams insert own race events"
ON public.race_event_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teams read own race events"
ON public.race_event_log FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));