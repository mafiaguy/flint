// ═══════════════════════════════════════════════════════════
// 🔥 FLINT — Job Scraper v2
// Changes from v1:
//   - Scrapes ALL tech jobs (not just SRE/Platform)
//   - Fetches full JDs from Greenhouse/Lever individual endpoints
//   - Auto-scrapes application form questions from Greenhouse
//   - Fixed broken board slugs (removed 404s)
//   - Fixed Apify input format
//   - Broadened Naukri scraping
// ═══════════════════════════════════════════════════════════

const { chromium } = require("playwright");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADZUNA_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_KEY = process.env.ADZUNA_APP_KEY;
const APIFY_TOKEN = process.env.APIFY_TOKEN;

// ── ALL tech roles (broad — frontend filters narrow it down) ──
const SEARCH_QUERIES = [
  "Software Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "Fullstack Engineer",
  "Site Reliability Engineer",
  "Platform Engineer",
  "DevOps Engineer",
  "Cloud Engineer",
  "Security Engineer",
  "Data Engineer",
  "ML Engineer",
  "Infrastructure Engineer",
  "DevSecOps Engineer",
  "QA Engineer",
  "Solutions Architect",
  "Product Manager Technical",
];

const ADZUNA_COUNTRIES = ["in", "gb", "de", "fr", "us", "ca", "au", "pl", "at", "nz"];

// ── Tech role filter (broad — includes all engineering) ──
const TECH_REGEX =
  /\b(engineer|developer|architect|devops|sre|platform|cloud|secur|data|ml\b|ai\b|backend|frontend|fullstack|full.stack|mobile|ios|android|qa|test|infra|reliab|software|system|network|database|dba|product.?manage|technical|devsecops|web|embedded|machine.?learn|scientist|analyst|designer|ux\b|ui\b|python|java|golang|rust|typescript|node|react|kubernetes|docker|aws|gcp|azure|terraform|cyber)\b/i;

// ═══════════════════════════════════════════════════════════
// VERIFIED GREENHOUSE BOARDS (removed all 404s, added new)
// Test any slug: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
// ═══════════════════════════════════════════════════════════
// Only boards confirmed working (removed all 404s from previous run)
const GREENHOUSE = [
  // ── Confirmed working ──
  { slug: "cloudflare", name: "Cloudflare" },
  { slug: "datadog", name: "Datadog" },
  { slug: "gitlab", name: "GitLab" },
  { slug: "grafanalabs", name: "Grafana Labs" },
  { slug: "elastic", name: "Elastic" },
  { slug: "cockroachlabs", name: "CockroachDB" },
  { slug: "mongodb", name: "MongoDB" },
  { slug: "planetscale", name: "PlanetScale" },
  { slug: "tailscale", name: "Tailscale" },
  { slug: "postman", name: "Postman" },
  { slug: "pagerduty", name: "PagerDuty" },
  { slug: "newrelic", name: "New Relic" },
  { slug: "yugabyte", name: "YugabyteDB" },
  { slug: "groww", name: "Groww" },
  // ── Moved from Lever (confirmed on Greenhouse now) ──
  { slug: "vercel", name: "Vercel" },
  { slug: "anthropic", name: "Anthropic" },
  // ── Add more verified slugs below ──
  // To test: curl https://boards-api.greenhouse.io/v1/boards/SLUG/jobs
];

// ═══════════════════════════════════════════════════════════
// VERIFIED LEVER BOARDS
// Test: https://api.lever.co/v0/postings/{slug}?mode=json
// ═══════════════════════════════════════════════════════════
// All previous Lever boards returned 404 — companies moved to Ashby/Greenhouse
// To find new Lever companies: curl https://api.lever.co/v0/postings/SLUG?mode=json
const LEVER = [
  // Add verified Lever boards here as you find them
];

// ═══════════════════════════════════════════════════════════
// VERIFIED ASHBY BOARDS
// Test: https://api.ashbyhq.com/posting-api/job-board/{slug}
// ═══════════════════════════════════════════════════════════
// Confirmed working + fixed slugs
const ASHBY = [
  // ── Confirmed working from last run ──
  { slug: "notion", name: "Notion" },
  { slug: "ramp", name: "Ramp" },
  { slug: "linear", name: "Linear" },
  { slug: "openai", name: "OpenAI" },
  { slug: "resend", name: "Resend" },
  // ── Moved from Lever (confirmed on Ashby) ──
  { slug: "supabase", name: "Supabase" },
  // ── Fixed slugs ──
  { slug: "perplexity", name: "Perplexity" },
  // To test: curl https://api.ashbyhq.com/posting-api/job-board/SLUG
];

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function categorize(title) {
  const t = (title || "").toLowerCase();
  if (/sre|site.?reliab|production.?eng/.test(t)) return "SRE";
  if (/platform/.test(t)) return "Platform";
  if (/devsecops|appsec/.test(t)) return "DevSecOps";
  if (/secur|cyber|pen.?test/.test(t)) return "Security";
  if (/devops/.test(t)) return "DevOps";
  if (/infra/.test(t)) return "Infrastructure";
  if (/cloud/.test(t)) return "Cloud";
  if (/data.?(eng|sci)|etl|pipeline/.test(t)) return "Data";
  if (/machine.?learn|ml\b|ai\b|deep.?learn/.test(t)) return "ML/AI";
  if (/front.?end|react|angular|vue|ui\b/.test(t)) return "Frontend";
  if (/back.?end|api|server|node|python|java|golang|rust/.test(t)) return "Backend";
  if (/full.?stack/.test(t)) return "Fullstack";
  if (/mobile|ios|android|flutter|react.?native/.test(t)) return "Mobile";
  if (/qa|quality|test|sdet/.test(t)) return "QA";
  if (/product.?manag/.test(t)) return "Product";
  if (/architect/.test(t)) return "Architect";
  if (/design|ux\b/.test(t)) return "Design";
  return "Engineering";
}

function detectCountry(loc) {
  const l = (loc || "").toLowerCase();
  if (/india|bengal|mumbai|delhi|hyderab|pune|chennai|gurgaon|noida|kolkata/.test(l)) return "in";
  if (/\buk\b|london|england|manchester|bristol|edinburgh|cambridge/.test(l)) return "gb";
  if (/germany|berlin|munich|frankfurt|hamburg/.test(l)) return "de";
  if (/france|paris|lyon/.test(l)) return "fr";
  if (/\bus\b|\busa\b|new york|san francisco|seattle|austin|boston|chicago|los angeles/.test(l)) return "us";
  if (/canada|toronto|vancouver|montreal/.test(l)) return "ca";
  if (/australia|sydney|melbourne/.test(l)) return "au";
  if (/ireland|dublin/.test(l)) return "ie";
  if (/singapore/.test(l)) return "sg";
  if (/remote|worldwide|anywhere|distributed/.test(l)) return "remote";
  return "other";
}

function strip(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function makeId(prefix, ...parts) {
  return `${prefix}-${parts.join("-").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30)}-${Date.now().toString(36).slice(-4)}`;
}

function today() { return new Date().toISOString().split("T")[0]; }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upsertJobs(jobs) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  for (let i = 0; i < jobs.length; i += 50) {
    const batch = jobs.slice(i, i + 50);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(batch),
      });
      if (!r.ok) console.error("  DB error:", (await r.text()).slice(0, 200));
      else console.log(`  ✓ Upserted batch ${Math.floor(i / 50) + 1} (${batch.length} jobs)`);
    } catch (e) { console.error("  DB:", e.message); }
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 1: GREENHOUSE (full JD + application questions)
// ═══════════════════════════════════════════════════════════

async function scrapeGreenhouse() {
  console.log("\n🌿 [Greenhouse] Fetching", GREENHOUSE.length, "boards with full JDs...");
  const all = [];

  for (const board of GREENHOUSE) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`);
      if (!r.ok) { console.log(`  · ${board.name}: ${r.status}`); continue; }
      const data = await r.json();
      let count = 0;

      for (const j of data.jobs || []) {
        if (!TECH_REGEX.test(j.title) && !TECH_REGEX.test(strip(j.content || ""))) continue;
        const loc = j.location?.name || "Unknown";
        count++;

        // Full description from content field
        const fullDesc = strip(j.content || "");

        // Fetch application questions for this job
        let questions = [];
        try {
          const qr = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs/${j.id}?questions=true`);
          if (qr.ok) {
            const qd = await qr.json();
            questions = (qd.questions || []).map(q => ({
              label: q.label,
              required: q.required,
              type: q.fields?.[0]?.type || "text",
              options: q.fields?.[0]?.values?.map(v => v.label) || [],
            }));
          }
        } catch {}

        all.push({
          id: `gh-${j.id}`,
          title: j.title,
          company: board.name,
          location: loc,
          country: detectCountry(loc),
          description: fullDesc,
          url: j.absolute_url || "",
          salary: "—",
          source: "Greenhouse",
          posted: j.updated_at ? j.updated_at.split("T")[0] : today(),
          category: categorize(j.title),
          remote: /remote/i.test(loc) || /remote/i.test(j.title),
          questions: questions.length > 0 ? JSON.stringify(questions) : null,
        });
      }

      if (count > 0) console.log(`  ✓ ${board.name} → ${count} jobs`);
      await sleep(200);
    } catch (e) { console.error(`  ✗ ${board.name}: ${e.message}`); }
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// SOURCE 2: LEVER (full JD from API)
// ═══════════════════════════════════════════════════════════

async function scrapeLever() {
  console.log("\n🔧 [Lever] Fetching", LEVER.length, "boards...");
  const all = [];

  for (const board of LEVER) {
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${board.slug}?mode=json`);
      if (!r.ok) { console.log(`  · ${board.name}: ${r.status}`); continue; }
      const data = await r.json();
      let count = 0;

      for (const j of data) {
        if (!TECH_REGEX.test(j.text) && !TECH_REGEX.test(strip(j.descriptionPlain || ""))) continue;
        const loc = j.categories?.location || "Unknown";
        count++;

        // Lever gives full description in descriptionPlain or description
        const fullDesc = j.descriptionPlain || strip(j.description || "");

        // Lever includes lists (requirements, etc.)
        const lists = (j.lists || []).map(l => `${l.text}: ${(l.content || "").replace(/<[^>]*>/g, " ")}`).join("\n");

        all.push({
          id: `lv-${j.id}`,
          title: j.text,
          company: board.name,
          location: loc,
          country: detectCountry(loc),
          description: (fullDesc + "\n" + lists).trim(),
          url: j.hostedUrl || "",
          salary: "—",
          source: "Lever",
          posted: j.createdAt ? new Date(j.createdAt).toISOString().split("T")[0] : today(),
          category: categorize(j.text),
          remote: /remote/i.test(loc),
          questions: null,
        });
      }

      if (count > 0) console.log(`  ✓ ${board.name} → ${count} jobs`);
    } catch (e) { console.error(`  ✗ ${board.name}: ${e.message}`); }
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// SOURCE 3: ASHBY
// ═══════════════════════════════════════════════════════════

async function scrapeAshby() {
  console.log("\n🟣 [Ashby] Fetching", ASHBY.length, "boards...");
  const all = [];

  for (const board of ASHBY) {
    try {
      const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${board.slug}`);
      if (!r.ok) { console.log(`  · ${board.name}: ${r.status}`); continue; }
      const data = await r.json();
      let count = 0;

      for (const j of data.jobs || []) {
        if (!TECH_REGEX.test(j.title)) continue;
        const loc = j.location || j.locationName || "Unknown";
        count++;

        all.push({
          id: `ab-${j.id}`,
          title: j.title,
          company: board.name,
          location: loc,
          country: detectCountry(loc),
          description: strip(j.descriptionHtml || j.descriptionPlain || ""),
          url: j.jobUrl || j.applyUrl || "",
          salary: j.compensationTierSummary || "—",
          source: "Ashby",
          posted: j.publishedAt ? new Date(j.publishedAt).toISOString().split("T")[0] : today(),
          category: categorize(j.title),
          remote: /remote/i.test(loc) || j.isRemote === true,
          questions: null,
        });
      }

      if (count > 0) console.log(`  ✓ ${board.name} → ${count} jobs`);
    } catch (e) { console.error(`  ✗ ${board.name}: ${e.message}`); }
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// SOURCE 4: ADZUNA API
// ═══════════════════════════════════════════════════════════

async function scrapeAdzuna() {
  if (!ADZUNA_ID || !ADZUNA_KEY) { console.log("\n⏭  [Adzuna] No keys"); return []; }
  console.log("\n📊 [Adzuna] Fetching across", ADZUNA_COUNTRIES.length, "countries...");
  const all = [];

  for (const query of SEARCH_QUERIES) {
    for (const cc of ADZUNA_COUNTRIES) {
      try {
        const url = `https://api.adzuna.com/v1/api/jobs/${cc}/search/1?app_id=${ADZUNA_ID}&app_key=${ADZUNA_KEY}&results_per_page=20&what=${encodeURIComponent(query)}&max_days_old=7&content-type=application/json`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();

        for (const j of data.results || []) {
          all.push({
            id: `az-${j.id}`,
            title: j.title,
            company: j.company?.display_name || "—",
            location: j.location?.display_name || cc.toUpperCase(),
            country: cc,
            description: j.description || "",
            url: j.redirect_url || "",
            salary: j.salary_min ? `${Math.round(j.salary_min).toLocaleString()}` : "—",
            source: "Adzuna",
            posted: j.created ? j.created.split("T")[0] : today(),
            category: categorize(j.title),
            remote: /remote/i.test(j.title + " " + (j.description || "")),
            questions: null,
          });
        }
      } catch {}
    }
    console.log(`  ✓ "${query}" done`);
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// SOURCE 5: LINKEDIN (Playwright)
// ═══════════════════════════════════════════════════════════

async function scrapeLinkedIn(browser) {
  console.log("\n🔗 [LinkedIn] Scraping public listings...");
  const all = [];

  for (const query of SEARCH_QUERIES.slice(0, 6)) {
    try {
      const page = await browser.newPage({
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      });
      await page.goto(
        `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&f_TPR=r604800`,
        { waitUntil: "domcontentloaded", timeout: 30000 }
      );
      await sleep(2000);

      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(1500);
      }

      const jobs = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".base-card")).slice(0, 25).map(c => ({
          title: c.querySelector(".base-search-card__title")?.textContent?.trim() || "",
          company: c.querySelector(".base-search-card__subtitle")?.textContent?.trim() || "",
          location: c.querySelector(".job-search-card__location")?.textContent?.trim() || "",
          url: c.querySelector("a")?.href || "",
          posted: c.querySelector("time")?.getAttribute("datetime") || "",
        })).filter(j => j.title)
      );

      for (const j of jobs) {
        all.push({
          id: makeId("li", j.title, j.company),
          title: j.title, company: j.company, location: j.location,
          country: detectCountry(j.location), description: "",
          url: j.url.split("?")[0], salary: "—", source: "LinkedIn",
          posted: j.posted || today(), category: categorize(j.title),
          remote: /remote/i.test(j.location), questions: null,
        });
      }

      await page.close();
      console.log(`  ✓ "${query}" → ${jobs.length} jobs`);
      await sleep(3000);
    } catch (e) { console.error(`  ✗ "${query}": ${e.message}`); }
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// SOURCE 6: APIFY (LinkedIn fallback — fixed input format)
// ═══════════════════════════════════════════════════════════

async function scrapeApify() {
  // Disabled: harvestapi actor fails on Apify free tier (timeouts/400s)
  // Playwright LinkedIn already gets 100+ jobs per run
  // Board APIs (Greenhouse/Ashby) pull 3000+ jobs
  // Re-enable if you find a reliable free actor
  console.log("\n⏭  [Apify] Skipped — Playwright LinkedIn + board APIs are sufficient");
  return [];
}

// ═══════════════════════════════════════════════════════════
// SOURCE 7: HACKER NEWS — Who's Hiring
// ═══════════════════════════════════════════════════════════

async function scrapeHN() {
  console.log("\n🟧 [HackerNews] Fetching Who's Hiring...");
  const all = [];
  try {
    const sr = await fetch(
      "https://hn.algolia.com/api/v1/search?query=who%20is%20hiring&tags=story,ask_hn&numericFilters=created_at_i>" +
      Math.floor(Date.now() / 1000 - 35 * 86400)
    );
    if (!sr.ok) throw new Error(`Algolia ${sr.status}`);
    const sd = await sr.json();
    const thread = sd.hits?.find(h => /who is hiring/i.test(h.title) && h.num_comments > 50);
    if (!thread) { console.log("  · No recent thread"); return []; }

    console.log(`  · Found: "${thread.title}" (${thread.num_comments} comments)`);

    const cr = await fetch(`https://hn.algolia.com/api/v1/search?tags=comment,story_${thread.objectID}&hitsPerPage=300`);
    const cd = await cr.json();

    for (const c of cd.hits || []) {
      const text = strip(c.comment_text || "");
      if (!TECH_REGEX.test(text) || text.length < 50) continue;

      const firstLine = text.split(/[|\n]/)[0].trim().slice(0, 80);
      const locMatch = text.match(/(?:location|based in|office)[:\s]+([^|\n]{3,50})/i);
      const urlMatch = (c.comment_text || "").match(/href="(https?:\/\/[^"]+)"/);
      const isRemote = /remote/i.test(text);

      // Try to extract a role from the text
      const roleMatch = text.match(/(?:hiring|looking for|seeking)[:\s]+([\w\s/]+?)(?:\.|,|\n|$)/i);

      all.push({
        id: `hn-${c.objectID}`,
        title: roleMatch ? roleMatch[1].trim().slice(0, 80) : `${categorize(text)} Engineer`,
        company: firstLine || "HN Listing",
        location: isRemote ? "Remote" : (locMatch ? locMatch[1].trim() : "Various"),
        country: detectCountry(locMatch ? locMatch[1] : (isRemote ? "remote" : "")),
        description: text.slice(0, 3000),
        url: urlMatch ? urlMatch[1] : `https://news.ycombinator.com/item?id=${c.objectID}`,
        salary: "—", source: "HackerNews",
        posted: c.created_at ? c.created_at.split("T")[0] : today(),
        category: categorize(text), remote: isRemote, questions: null,
      });
    }
    console.log(`  ✓ ${all.length} jobs from thread`);
  } catch (e) { console.error(`  ✗ HN: ${e.message}`); }
  return all;
}

// ═══════════════════════════════════════════════════════════
// SOURCE 8: NAUKRI (Playwright — updated selectors)
// ═══════════════════════════════════════════════════════════

async function scrapeNaukri(browser) {
  console.log("\n🇮🇳 [Naukri] Scraping Indian listings...");
  const all = [];
  const queries = ["software engineer", "devops", "cloud engineer", "data engineer", "backend developer", "fullstack developer", "sre"];

  for (const query of queries) {
    try {
      const page = await browser.newPage({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      });

      const url = `https://www.naukri.com/${query.replace(/\s+/g, "-")}-jobs?k=${encodeURIComponent(query)}&experience=3&jobAge=7`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(4000);

      // Scroll to load
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(2000);
      }

      const jobs = await page.evaluate(() => {
        // Naukri uses multiple possible selectors — try all
        const cards = document.querySelectorAll(
          "article.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple, [data-job-id], .list > .jobTuple"
        );

        return Array.from(cards).slice(0, 20).map(c => {
          // Try multiple selector patterns for each field
          const title = (
            c.querySelector("a.title, .row1 a, .jobTuple-title a, [class*='title'] a, .info h2 a")?.textContent ||
            c.querySelector("a")?.textContent || ""
          ).trim();

          const company = (
            c.querySelector(".comp-name, .companyInfo a, .subTitle a, [class*='comp'] a, .info .companyName a")?.textContent || ""
          ).trim();

          const location = (
            c.querySelector(".locWdth, .loc-wrap .locWdth, .location .loc, [class*='loc'] span, .info .location span")?.textContent || ""
          ).trim();

          const salary = (
            c.querySelector("[class*='salary'] span, .sal-wrap span, .ni-job-tuple-icon-srp-rupee + span")?.textContent || ""
          ).trim();

          const link = c.querySelector("a.title, .row1 a, a[href*='job-listings']")?.href || c.querySelector("a")?.href || "";

          return { title, company, location, salary, url: link };
        }).filter(j => j.title && j.title.length > 3);
      });

      for (const j of jobs) {
        all.push({
          id: makeId("nk", j.title, j.company),
          title: j.title, company: j.company,
          location: j.location || "India", country: "in",
          description: "", url: j.url, salary: j.salary || "—",
          source: "Naukri", posted: today(),
          category: categorize(j.title),
          remote: /remote/i.test(j.location), questions: null,
        });
      }

      await page.close();
      console.log(`  ✓ "${query}" → ${jobs.length} jobs`);
      await sleep(3000);
    } catch (e) { console.error(`  ✗ "${query}": ${e.message}`); }
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const start = Date.now();
  console.log("═".repeat(56));
  console.log("🔥 FLINT Scraper v2 — All tech jobs, full JDs");
  console.log(`   ${new Date().toISOString()}`);
  console.log("═".repeat(56));

  const browser = await chromium.launch({ headless: true });

  // API-based sources in parallel
  const [adzuna, greenhouse, lever, ashby, hn, apify] = await Promise.allSettled([
    scrapeAdzuna(), scrapeGreenhouse(), scrapeLever(),
    scrapeAshby(), scrapeHN(), scrapeApify(),
  ]);

  // Browser-based sources sequentially
  const linkedin = await scrapeLinkedIn(browser).catch(() => []);
  const naukri = await scrapeNaukri(browser).catch(() => []);
  await browser.close();

  let allJobs = [];
  const sources = { adzuna, greenhouse, lever, ashby, hn, apify };
  for (const [name, result] of Object.entries(sources)) {
    if (result.status === "fulfilled" && result.value?.length) {
      allJobs.push(...result.value);
      console.log(`\n  📦 ${name}: ${result.value.length} jobs`);
    }
  }
  allJobs.push(...(linkedin || []), ...(naukri || []));
  console.log(`  📦 linkedin: ${(linkedin || []).length}`);
  console.log(`  📦 naukri: ${(naukri || []).length}`);

  // Deduplicate
  const seen = new Set();
  allJobs = allJobs.filter(j => {
    const k = `${j.title}-${j.company}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  console.log("\n" + "═".repeat(56));
  console.log(`📊 Total unique jobs: ${allJobs.length}`);
  console.log("═".repeat(56));

  await upsertJobs(allJobs);
  console.log(`\n✅ Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });