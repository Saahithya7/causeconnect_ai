-- ==============================================================================
-- CauseConnect AI — WaitlistGuardian Schema Migration
-- Intelligent Waitlist & Cancellation Agent Schema Extensions
-- ==============================================================================

-- 1. Extend public.registrations with WaitlistGuardian monitoring columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'monitoring_enabled'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN monitoring_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'monitoring_status'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN monitoring_status text DEFAULT 'paused' 
      CHECK (monitoring_status IN ('active', 'paused', 'blocked', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'availability_status'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN availability_status text DEFAULT 'waitlisted_only'
      CHECK (availability_status IN ('waitlisted_only', 'spot_available', 'event_full', 'event_cancelled', 'registration_closed', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'last_checked_at'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN last_checked_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'next_check_at'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN next_check_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'check_retry_count'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN check_retry_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'last_check_error'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN last_check_error text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'status_change_history'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN status_change_history jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 2. Create public.waitlist_notifications table for verified availability and cancellation alerts
CREATE TABLE IF NOT EXISTS public.waitlist_notifications (
  id text PRIMARY KEY DEFAULT ('wnotif_' || substr(md5(random()::text), 1, 16)),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registration_id text NOT NULL,
  opportunity_id text NOT NULL,
  event_title text NOT NULL,
  change_type text NOT NULL CHECK (
    change_type IN (
      'spot_available',
      'reopened',
      'event_full',
      'waitlist_closed',
      'deadline_passed',
      'event_cancelled',
      'rescheduled',
      'status_unknown'
    )
  ),
  previous_status text,
  new_status text NOT NULL,
  message text NOT NULL,
  source_url text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false,
  action_taken text DEFAULT 'pending_review' CHECK (action_taken IN ('pending_review', 're_registered', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency constraint: Prevent duplicate notifications for identical status change
  CONSTRAINT uq_waitlist_notif_event_change UNIQUE (registration_id, change_type, new_status)
);

-- 3. Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_registrations_monitoring ON public.registrations(monitoring_enabled, monitoring_status);
CREATE INDEX IF NOT EXISTS idx_registrations_next_check ON public.registrations(next_check_at) WHERE monitoring_enabled = true;
CREATE INDEX IF NOT EXISTS idx_waitlist_notif_user_id ON public.waitlist_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_notif_reg_id ON public.waitlist_notifications(registration_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_notif_verified_at ON public.waitlist_notifications(verified_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.waitlist_notifications ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Users can ONLY access and update their own waitlist notifications
DROP POLICY IF EXISTS "Users can view own waitlist notifications" ON public.waitlist_notifications;
CREATE POLICY "Users can view own waitlist notifications"
  ON public.waitlist_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own waitlist notifications" ON public.waitlist_notifications;
CREATE POLICY "Users can insert own waitlist notifications"
  ON public.waitlist_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own waitlist notifications" ON public.waitlist_notifications;
CREATE POLICY "Users can update own waitlist notifications"
  ON public.waitlist_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own waitlist notifications" ON public.waitlist_notifications;
CREATE POLICY "Users can delete own waitlist notifications"
  ON public.waitlist_notifications
  FOR DELETE
  USING (auth.uid() = user_id);
