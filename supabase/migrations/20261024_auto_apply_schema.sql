-- ==============================================================================
-- CauseConnect AI — Auto-Apply & Playwright Verification Schema Migration
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

-- 2. Create public.applications table for stateful auto-apply & independent verification
CREATE TABLE IF NOT EXISTS public.applications (
  id text PRIMARY KEY DEFAULT ('app_' || substr(md5(random()::text), 1, 16)),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'awaiting_approval',
      'approved',
      'submitting',
      'submitted_unverified',
      'verified',
      'waitlisted',
      'rejected',
      'failed',
      'verification_inconclusive'
    )
  ),
  draft_version integer NOT NULL DEFAULT 1,
  action_hash text NOT NULL,
  idempotency_key text NOT NULL,
  data_to_submit jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_timestamp timestamptz,
  approved_by_user_id uuid REFERENCES auth.users(id),
  verification_evidence text,
  confirmation_reference text,
  observed_status text,
  error_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_opportunity_application UNIQUE (user_id, opportunity_id)
);

-- 3. Create index for fast status lookups and idempotency enforcement
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON public.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_idempotency_key ON public.applications(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);

-- 4. Enable Row Level Security (RLS) on public.applications
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies: Users can ONLY access, update, and manage their own applications
DROP POLICY IF EXISTS "Users can view their own applications" ON public.applications;
CREATE POLICY "Users can view their own applications"
  ON public.applications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own applications" ON public.applications;
CREATE POLICY "Users can insert their own applications"
  ON public.applications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own applications" ON public.applications;
CREATE POLICY "Users can update their own applications"
  ON public.applications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own applications" ON public.applications;
CREATE POLICY "Users can delete their own applications"
  ON public.applications
  FOR DELETE
  USING (auth.uid() = user_id);

-- 6. Trigger to automatically refresh updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_applications_updated_at ON public.applications;
CREATE TRIGGER trigger_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
