CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, team_name, contact_name, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'team_name', 'Equipa'),
    COALESCE(NEW.raw_user_meta_data ->> 'contact_name', ''),
    NEW.email,
    'pending'::public.team_status
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'team'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DELETE FROM public.user_roles ur
USING public.profiles p
WHERE ur.user_id = p.id
  AND lower(p.email) = 'filipebmp@gmail.com'
  AND ur.role = 'admin'::public.app_role;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'team'::public.app_role FROM public.profiles p
WHERE lower(p.email) = 'filipebmp@gmail.com'
ON CONFLICT DO NOTHING;

UPDATE public.profiles SET status = 'pending'::public.team_status
WHERE lower(email) = 'filipebmp@gmail.com';