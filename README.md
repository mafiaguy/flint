# 🔥 FLINT — Spark Your Next Move

Zero-config, open-source job search tool. Users open the site, jobs are already there. No API keys, no signup, no friction.

**9 job sources** → LinkedIn, Adzuna, Greenhouse, Lever, Ashby, Workable, HackerNews, Naukri, Apify  
**AI-powered** → match scoring, cover letters, career chat (Llama 3.3 70B via Groq)  
**50+ company boards** → Cloudflare, Datadog, Razorpay, OpenAI, Stripe, Vercel, and more  
**$0/month** → runs entirely on free tiers

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  GitHub Actions (cron every 8h, free 2000 min/mo)   │
│                                                      │
│  Playwright ──→ LinkedIn, Naukri                     │
│  fetch()    ──→ Greenhouse (25 boards)               │
│  fetch()    ──→ Lever (9 boards)                     │
│  fetch()    ──→ Ashby (9 boards)                     │
│  fetch()    ──→ Workable (7 boards)                  │
│  fetch()    ──→ Adzuna API (10 countries)             │
│  fetch()    ──→ HackerNews Who's Hiring              │
│  fetch()    ──→ Apify LinkedIn (fallback)             │
└──────────────────────┬──────────────────────────────┘
                       │ writes to
                       ▼
┌─────────────────────────────────────────────────────┐
│  Supabase (free tier: 500MB DB, 50k edge calls/mo)  │
│                                                      │
│  PostgreSQL    → jobs table, applications table      │
│  Edge Function → /ai (proxies Groq, key hidden)      │
│  Edge Function → /search-jobs (proxies Adzuna live)  │
└──────────────────────┬──────────────────────────────┘
                       │ reads from
                       ▼
┌─────────────────────────────────────────────────────┐
│  GitHub Pages (free static hosting)                  │
│                                                      │
│  React SPA → zero config for users                   │
│  No API keys needed → just open and use              │
└─────────────────────────────────────────────────────┘
```

---

## Step-by-Step Setup (30 minutes)

### Step 1: Fork or clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/flint.git
cd flint
```

### Step 2: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → Sign up (free) → New Project
2. Pick any region, set a database password
3. Wait for project to finish provisioning (~2 min)
4. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...` — keep this SECRET)

### Step 3: Run the database migration

1. In Supabase dashboard, go to **SQL Editor → New Query**
2. Open `supabase/migrations/001_init.sql` from this repo
3. Paste the entire contents and click **Run**
4. You should see "Success" — this creates the `jobs` and `applications` tables

> **"Is it safe to have migrations in a public repo?"**
> Yes. Every open-source project does this (Supabase itself, PostHog, Cal.com). Migrations are just schema — no secrets, no data.

### Step 4: Deploy Supabase Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project (find ref in Supabase dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets — these stay server-side, users never see them
supabase secrets set GROQ_API_KEY=gsk_your_key_here
supabase secrets set ADZUNA_APP_ID=your_app_id
supabase secrets set ADZUNA_APP_KEY=your_app_key
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ_your_service_role_key

# Deploy both functions
supabase functions deploy ai
supabase functions deploy search-jobs
```

**Where to get the keys:**
| Key | Where | Cost |
|---|---|---|
| GROQ_API_KEY | [console.groq.com](https://console.groq.com) → API Keys | Free (14,400 req/day) |
| ADZUNA_APP_ID | [developer.adzuna.com](https://developer.adzuna.com) → Register | Free |
| ADZUNA_APP_KEY | Same as above | Free |
| APIFY_TOKEN | [apify.com](https://apify.com) → Settings → Integrations | Free tier |

### Step 5: Configure GitHub Secrets (for the scraper)

1. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret** for each:

| Secret name | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase **service_role** key |
| `ADZUNA_APP_ID` | Your Adzuna App ID |
| `ADZUNA_APP_KEY` | Your Adzuna App Key |
| `APIFY_TOKEN` | Your Apify API token (optional) |

### Step 6: Update the frontend

Open `frontend/index.html` and set your Supabase public credentials at the top:

```javascript
window.FLINT_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_KEY: "eyJ_your_anon_key_here",
};
```

> The anon key is safe to commit — it's designed to be public. Supabase uses Row Level Security (RLS) to protect data.

### Step 7: Enable GitHub Pages

1. Go to repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/frontend`
4. Click Save
5. Your site will be live at `https://YOUR_USERNAME.github.io/flint/`

### Step 8: Run the first scrape

1. Go to repo **Actions** tab
2. Click **"🔥 FLINT Job Scraper"** in the sidebar
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait 5-10 minutes for it to finish
5. Check your Supabase dashboard → Table Editor → `jobs` table — it should have data!

After this, the scraper runs automatically every 8 hours.

### Step 9: Open your site 🎉

Go to `https://YOUR_USERNAME.github.io/flint/` — jobs should be loaded!

---

## Repo Structure

```
flint/
├── .github/
│   └── workflows/
│       └── scrape-jobs.yml         ← Runs every 8h on GitHub Actions
├── scraper/
│   ├── scrape.js                   ← The big scraper (9 sources)
│   └── package.json
├── supabase/
│   ├── migrations/
│   │   └── 001_init.sql            ← Database schema (safe for public repo)
│   └── functions/
│       ├── ai/
│       │   └── index.ts            ← Groq LLM proxy (key hidden server-side)
│       └── search-jobs/
│           └── index.ts            ← Adzuna live search proxy
├── frontend/
│   └── index.html                  ← Complete React SPA (GitHub Pages)
└── README.md                       ← You are here
```

## Job Sources

| Source | Method | What it scrapes |
|---|---|---|
| **LinkedIn** | Playwright (public pages) | Jobs from public search results |
| **Adzuna** | REST API | 10 countries: IN, GB, DE, FR, US, CA, AU, PL, AT, NZ |
| **Apify** | API (LinkedIn fallback) | LinkedIn via cloud Playwright actor |
| **Greenhouse** | Public JSON API | 25 companies including Cloudflare, Datadog, GitLab, Razorpay |
| **Lever** | Public JSON API | 9 companies including Vercel, Neon, Supabase, Temporal |
| **Ashby** | Public JSON API | 9 companies including Notion, OpenAI, Anthropic, Linear |
| **Workable** | Public Widget API | 7 companies including Zerodha, PhonePe, Swiggy, BrowserStack |
| **HackerNews** | Algolia API | Monthly "Who's Hiring" thread |
| **Naukri** | Playwright | India-specific job listings |

## Adding More Companies

Open `scraper/scrape.js` and add to the relevant array:

```javascript
// Greenhouse — check: https://boards-api.greenhouse.io/v1/boards/SLUG/jobs
GREENHOUSE_BOARDS.push({ slug: "stripe", name: "Stripe" });

// Lever — check: https://api.lever.co/v0/postings/SLUG?mode=json
LEVER_BOARDS.push({ slug: "figma", name: "Figma" });

// Ashby — check: https://api.ashbyhq.com/posting-api/job-board/SLUG
ASHBY_BOARDS.push({ slug: "cursor", name: "Cursor" });
```

## Free Tier Limits

| Service | Free Tier | More Than Enough For |
|---|---|---|
| **Supabase** | 500MB database, 50k Edge Function invocations/month | ~50k jobs + heavy AI usage |
| **Groq** | 14,400 requests/day on Llama 3.3 70B | ~600 AI matches per hour |
| **Adzuna** | Free API key, reasonable rate limits | All live searches |
| **Apify** | Free tier with monthly credits | ~30 LinkedIn scrapes/month |
| **GitHub Actions** | 2,000 minutes/month | 3 scrapes/day = ~300 min/month |
| **GitHub Pages** | Unlimited static hosting | The entire frontend |

**Total monthly cost: $0**

## License

MIT — do whatever you want with it.

## Credits

Inspired by [career-ops](https://github.com/santifer/career-ops).  
Built with [Supabase](https://supabase.com), [Playwright](https://playwright.dev), [Groq](https://groq.com), and [Adzuna](https://developer.adzuna.com).