ALTER TABLE public.race_event_log
ADD CONSTRAINT race_event_log_unique_stint_event
UNIQUE (user_id, stint_id, event);