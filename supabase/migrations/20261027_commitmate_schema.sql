-- ==============================================================================
-- CauseConnect AI — CommitMate: Availability, Conflict & Reminders Schema Migration
-- Idempotent schema migration for Supabase PostgreSQL
-- ==============================================================================

-- 1. Extend public.profiles table with volunteer availability and timezone settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'timezone') THEN
    ALTER TABLE public.profiles ADD COLUMN timezone text DEFAULT 'UTC';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'weekly_hours_target') THEN
    ALTER TABLE public.profiles ADD COLUMN weekly_hours_target integer DEFAULT 5;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferred_working_hours') THEN
    ALTER TABLE public.profiles ADD COLUMN preferred_working_hours jsonb DEFAULT '{"start": "08:00", "end": "18:00"}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'time_slots') THEN
    ALTER TABLE public.profiles ADD COLUMN time_slots jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'google_calendar_connected') THEN
    ALTER TABLE public.profiles ADD COLUMN google_calendar_connected boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'google_calendar_email') THEN
    ALTER TABLE public.profiles ADD COLUMN google_calendar_email text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'reminder_preferences') THEN
    ALTER TABLE public.profiles ADD COLUMN reminder_preferences jsonb DEFAULT '{"before24h": true, "before1h": true, "browserNotifications": true}'::jsonb;
  END IF;
END $$;

-- 2. Extend public.registrations with Google Calendar event references & reminder tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'google_calendar_event_id') THEN
    ALTER TABLE public.registrations ADD COLUMN google_calendar_event_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'calendar_synced_at') THEN
    ALTER TABLE public.registrations ADD COLUMN calendar_synced_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'reminders_enabled') THEN
    ALTER TABLE public.registrations ADD COLUMN reminders_enabled boolean DEFAULT true;
  END IF;
END $$;

-- 3. Create public.event_reminders table for scheduled and delivered notifications
CREATE TABLE IF NOT EXISTS public.event_reminders (
  id text PRIMARY KEY DEFAULT ('rem_' || substr(md5(random()::text), 1, 16)),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registration_id text,
  opportunity_id text,
  opportunity_title text NOT NULL,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '1h', 'custom', 'test')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'delivered', 'failed', 'cancelled')),
  delivered_at timestamptz,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'browser', 'email')),
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  error_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create indexes for efficient reminder lookup & delivery
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id ON public.event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_status_scheduled ON public.event_reminders(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_registrations_google_calendar_event_id ON public.registrations(google_calendar_event_id);

-- 5. Enable Row Level Security (RLS) on public.event_reminders
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

-- 6. Strict RLS Policies: Users can ONLY access, insert, update, and manage their own reminders
DROP POLICY IF EXISTS "Users can view their own reminders" ON public.event_reminders;
CREATE POLICY "Users can view their own reminders"
  ON public.event_reminders
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own reminders" ON public.event_reminders;
CREATE POLICY "Users can insert their own reminders"
  ON public.event_reminders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reminders" ON public.event_reminders;
CREATE POLICY "Users can update their own reminders"
  ON public.event_reminders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reminders" ON public.event_reminders;
CREATE POLICY "Users can delete their own reminders"
  ON public.event_reminders
  FOR DELETE
  USING (auth.uid() = user_id);
