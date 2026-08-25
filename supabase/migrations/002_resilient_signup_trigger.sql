-- ═══════════════════════════════════════════════════════════════════════════
-- 002_resilient_signup_trigger.sql
--
-- Fixes: POST /auth/v1/signup → 500 "duplicate key value violates unique
-- constraint users_email_key" when re-signing up an email whose previous
-- auth.users entry was deleted (Dashboard deletes do NOT remove the matching
-- public.users row, so the provisioning trigger then collides on email).
--
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. One-time cleanup: drop orphaned public.users rows ────────────────────
-- (auth account gone, row left behind — cascades its stale chats/memories)
DELETE FROM public.users p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Backfill any live auth account that is still missing its public.users row
INSERT INTO public.users (id, first_name, last_name, email)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'first_name', ''), 'Patient'),
  COALESCE(NULLIF(u.raw_user_meta_data->>'last_name', ''), ''),
  COALESCE(u.email, '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- ── B. Harden the provisioning trigger ──────────────────────────────────────
-- Reclaims a stale public.users row that still holds the signup email before
-- inserting, so a re-used email can never abort the auth transaction again.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The only way another public.users row shares this email is if its auth
  -- owner was deleted (GoTrue enforces unique emails among LIVE accounts),
  -- so removing the orphan here is safe and frees the email for reuse.
  DELETE FROM public.users
  WHERE email IS NOT NULL
    AND email = COALESCE(NEW.email, '')
    AND id <> NEW.id;

  INSERT INTO public.users (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), 'Patient'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name', ''), ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
