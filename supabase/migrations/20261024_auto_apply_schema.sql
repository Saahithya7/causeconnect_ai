-- ==============================================================================
-- CauseConnect AI — Volunteer profile fields used by Apply with AI
-- Idempotent schema migration for Supabase PostgreSQL
-- ==============================================================================

-- 1. Extend public.profiles table with missing volunteer details
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'date_of_birth') THEN
    ALTER TABLE public.profiles ADD COLUMN date_of_birth date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone') THEN
    ALTER TABLE public.profiles ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'education_experience') THEN
    ALTER TABLE public.profiles ADD COLUMN education_experience text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'has_background_check') THEN
    ALTER TABLE public.profiles ADD COLUMN has_background_check boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'background_check_consent') THEN
    ALTER TABLE public.profiles ADD COLUMN background_check_consent boolean DEFAULT false;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
