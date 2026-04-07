-- ═══════════════════════════════════════════════════════
-- 🔥 FLINT — Migration 002: Add user auth & profiles
-- Run AFTER 001_init.sql in Supabase SQL Editor
--
-- Fixes: user_id type mismatch (TEXT → UUID)
-- ═══════════════════════════════════════════════════════

-- ── User profiles (linked to Supabase Auth) ──
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name        TEXT,
  email       TEXT,
  avatar_url  TEXT,
  role        TEXT,
  experience  TEXT,
  skills      TEXT,
  notice      TEXT,
  compensation TEXT,
  expected    TEXT,
  visa        TEXT,
  work_mode   TEXT DEFAULT 'No Preference',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Saved Q&A per user ──
CREATE TABLE IF NOT EXISTS saved_qa (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_user ON saved_qa(user_id);

-- ═══════════════════════════════════════════════════════
-- Fix applications.user_id: drop TEXT column, add UUID
-- auth.uid() returns UUID, so the column must match
-- ═══════════════════════════════════════════════════════

-- Drop the old TEXT column if it exists
ALTER TABLE applications DROP COLUMN IF EXISTS user_id;

-- Add it back as UUID
ALTER TABLE applications
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_apps_userid ON applications(user_id);

-- ═══════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Saved Q&A
ALTER TABLE saved_qa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qa_select_own" ON saved_qa;
DROP POLICY IF EXISTS "qa_insert_own" ON saved_qa;
DROP POLICY IF EXISTS "qa_update_own" ON saved_qa;
DROP POLICY IF EXISTS "qa_delete_own" ON saved_qa;

CREATE POLICY "qa_select_own" ON saved_qa
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "qa_insert_own" ON saved_qa
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "qa_update_own" ON saved_qa
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "qa_delete_own" ON saved_qa
  FOR DELETE USING (auth.uid() = user_id);

-- Applications: drop old open policies, add user-scoped
DROP POLICY IF EXISTS "apps_public_insert" ON applications;
DROP POLICY IF EXISTS "apps_public_read" ON applications;
DROP POLICY IF EXISTS "apps_public_update" ON applications;
DROP POLICY IF EXISTS "apps_select_own" ON applications;
DROP POLICY IF EXISTS "apps_insert_own" ON applications;
DROP POLICY IF EXISTS "apps_update_own" ON applications;

CREATE POLICY "apps_select_own" ON applications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "apps_insert_own" ON applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "apps_update_own" ON applications
  FOR UPDATE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- Auto-create profile on signup
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();