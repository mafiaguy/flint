-- ═══════════════════════════════════════════════════════
-- 🔥 FLINT — Database Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- 
-- This is safe to keep in a public repo.
-- It's just schema — no secrets, no data.
-- ═══════════════════════════════════════════════════════

-- ── Jobs table (populated by GitHub Actions scraper) ──
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  company     TEXT,
  location    TEXT,
  country     TEXT,               -- ISO 2-letter: in, gb, de, us, remote
  description TEXT,
  url         TEXT,
  salary      TEXT DEFAULT '—',
  source      TEXT,               -- LinkedIn, Adzuna, Greenhouse, Lever, Ashby, Workable, HackerNews, Naukri
  posted      DATE,
  category    TEXT,               -- SRE, Platform, Security, DevSecOps, DevOps, Infrastructure, Cloud
  remote      BOOLEAN DEFAULT false,
  scraped_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes for performance ──
CREATE INDEX IF NOT EXISTS idx_jobs_posted     ON jobs (posted DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source     ON jobs (source);
CREATE INDEX IF NOT EXISTS idx_jobs_country    ON jobs (country);
CREATE INDEX IF NOT EXISTS idx_jobs_category   ON jobs (category);
CREATE INDEX IF NOT EXISTS idx_jobs_remote     ON jobs (remote) WHERE remote = true;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_jobs_fts ON jobs
  USING gin(to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(company, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(location, '')
  ));

-- ── Applications table (user-tracked) ──
CREATE TABLE IF NOT EXISTS applications (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id       TEXT,
  title        TEXT,
  company      TEXT,
  location     TEXT,
  source       TEXT,
  url          TEXT,
  cover_letter TEXT,
  answers      JSONB,
  status       TEXT DEFAULT 'applied',   -- applied, interviewing, offered, rejected
  applied_at   TIMESTAMPTZ DEFAULT now(),
  user_id      UUID                      -- set by migration 002 with auth.users FK
);

CREATE INDEX IF NOT EXISTS idx_apps_user    ON applications (user_id);
CREATE INDEX IF NOT EXISTS idx_apps_status  ON applications (status);

-- ── Row Level Security ──
-- Jobs: anyone can read (public job board)
-- Applications: open for now, lock down with auth later

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Public read access to jobs
CREATE POLICY "jobs_public_read"
  ON jobs FOR SELECT
  USING (true);

-- Scraper writes jobs (uses service_role key, bypasses RLS)
-- No INSERT policy needed since service_role bypasses RLS

-- Applications: public read/write for now
-- TODO: Add Supabase Auth and restrict by user_id
CREATE POLICY "apps_public_insert"
  ON applications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "apps_public_read"
  ON applications FOR SELECT
  USING (true);

CREATE POLICY "apps_public_update"
  ON applications FOR UPDATE
  USING (true);

-- ── Helper: cleanup old jobs (run monthly via cron or manually) ──
-- DELETE FROM jobs WHERE posted < now() - INTERVAL '60 days';

-- ── Stats view (optional, for a dashboard) ──
CREATE OR REPLACE VIEW job_stats AS
SELECT
  source,
  country,
  category,
  remote,
  COUNT(*) as count,
  MIN(posted) as oldest,
  MAX(posted) as newest
FROM jobs
GROUP BY source, country, category, remote
ORDER BY count DESC;