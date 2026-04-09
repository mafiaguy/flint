// ── FLINT Supabase Client & API Helpers ──

import { createClient } from '@supabase/supabase-js';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPA_KEY = import.meta.env.VITE_SUPABASE_KEY || '';

export const sb = createClient(SUPA_URL, SUPA_KEY);

// ── Edge function caller ──
const edge = async (fn, body, useAuth = false) => {
  try {
    let token = SUPA_KEY;
    if (useAuth) {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) token = session.access_token;
    }
    const r = await fetch(`${SUPA_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
};

// ── Database helpers ──
export const db = {
  // Jobs
  async getJobs(search, cat, lim = 80) {
    let q = sb.from("jobs").select("*").order("posted", { ascending: false }).limit(lim);
    if (search) q = q.or(`title.ilike.%${search}%,company.ilike.%${search}%`);
    if (cat && cat !== "All") q = q.eq("category", cat);
    const { data } = await q;
    return data || [];
  },

  // Profile
  async getProfile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
    return data;
  },

  async saveProfile(p) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from("profiles").upsert({ id: user.id, ...p, updated_at: new Date().toISOString() });
  },

  // Saved Q&A
  async getQA() {
    const { data } = await sb.from("saved_qa").select("*").order("created_at");
    return data || [];
  },
  async addQA(q, a) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from("saved_qa").insert({ user_id: user.id, question: q, answer: a });
  },
  async deleteQA(id) {
    await sb.from("saved_qa").delete().eq("id", id);
  },

  // Applications
  async getApps() {
    const { data } = await sb.from("applications").select("*").order("applied_at", { ascending: false });
    return data || [];
  },

  async updateAppStatus(id, status, extra = {}) {
    await sb.from("applications").update({
      status,
      stage_updated_at: new Date().toISOString(),
      ...extra,
    }).eq("id", id);
  },

  async updateAppNotes(id, notes) {
    await sb.from("applications").update({ notes }).eq("id", id);
  },

  async deleteApp(id) {
    await sb.from("applications").delete().eq("id", id);
  },

  // Resume
  async uploadResume(file) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user || !file) return null;
    const fp = `${user.id}/${file.name}`;
    await sb.storage.from("resumes").upload(fp, file, { upsert: true });
    const { data: u } = sb.storage.from("resumes").getPublicUrl(fp);
    await sb.from("profiles").update({ resume_url: u.publicUrl }).eq("id", user.id);
    return u.publicUrl;
  },

  // Job Matches
  async getMatches(limit = 50) {
    const { data } = await sb
      .from("job_matches")
      .select("*, jobs(*)")
      .order("score", { ascending: false })
      .limit(limit);
    return data || [];
  },

  // Apply queue
  async queueApply(job, cover) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const p = await this.getProfile();
    const m = (job.url || "").match(/greenhouse\.io\/(\w+)\/jobs\/(\d+)/);
    await sb.from("apply_queue").insert({
      user_id: user.id, job_id: job.id, job_title: job.title,
      company: job.company, job_url: job.url, source: job.source,
      board_slug: m?.[1], gh_job_id: m?.[2],
      cover_letter: cover, resume_url: p?.resume_url, status: "pending",
    });
  },

  // Onboarding messages
  async getOnboardingMessages() {
    const { data } = await sb
      .from("onboarding_messages")
      .select("*")
      .order("created_at", { ascending: true });
    return data || [];
  },

  async saveOnboardingMessage(role, content) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from("onboarding_messages").insert({ user_id: user.id, role, content });
  },

  // Resume parsing
  async parseResume(resumeUrl) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    return edge("parse-resume", { user_id: user.id, resume_url: resumeUrl });
  },

  async parseResumeText(text) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    return edge("parse-resume", { user_id: user.id, resume_text: text });
  },

  // Edge functions
  scrapeForm: (url, src) => edge("scrape-form", { url, source: src }),
  triggerApply: () => edge("trigger-apply", {}),
  callAI: (body) => edge("ai", body),
  liveSearch: (q) => edge("search-jobs", { query: q }),
  matchJobs: () => edge("match-jobs", {}, true),
  salaryInsights: (category, country) => edge("salary-insights", { category, country }),
};
