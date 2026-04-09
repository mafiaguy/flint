// ═══════════════════════════════════════════════════════
// FLINT — AI Edge Function (v3) — Dual Provider + Cache
//
// Providers:
//   Gemini Flash 2.0 — heavy/analytical (onboard, batch-match,
//     cover, tailor-resume, skill-gap)
//   Groq Llama 3.3   — speed-critical (interview-prep, chat,
//     follow-up, match)
//
// Cache: SHA-256 hash of inputs → ai_cache table. Cuts usage ~40-50%.
//
// Deploy:
//   supabase functions deploy ai
//   supabase secrets set GROQ_API_KEY=gsk_... GEMINI_API_KEY=...
// ═══════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Provider config ──
const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Route types to providers — Gemini for heavy work, Groq for speed
const GEMINI_TYPES = new Set(["onboard", "batch-match", "cover", "tailor-resume", "skill-gap", "rewrite-latex", "generate-latex"]);
const GROQ_TYPES = new Set(["match", "chat", "interview-prep"]);

// Cache TTL per type (hours). null = no cache.
const CACHE_TTL: Record<string, number | null> = {
  "match": 72,
  "batch-match": 48,
  "cover": 168,        // 7 days — same job+profile = same letter
  "tailor-resume": 168,
  "interview-prep": 168,
  "skill-gap": 24,
  "chat": null,         // never cache chat
  "onboard": null,      // never cache onboarding
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, cache-control, pragma",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Cache helpers ──
async function hashInput(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCacheSb() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function cacheGet(hash: string): Promise<string | null> {
  const sb = getCacheSb();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("ai_cache")
      .select("output")
      .eq("input_hash", hash)
      .or("expires_at.is.null,expires_at.gt.now()")
      .single();
    if (data?.output) {
      // Bump hit count (fire-and-forget)
      sb.from("ai_cache").update({ hit_count: sb.rpc ? undefined : 1 }).eq("input_hash", hash);
      return data.output;
    }
  } catch { /* miss */ }
  return null;
}

async function cacheSet(hash: string, type: string, output: string, model: string): Promise<void> {
  const sb = getCacheSb();
  if (!sb) return;
  const ttlHours = CACHE_TTL[type];
  if (ttlHours === null || ttlHours === undefined) return;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  try {
    await sb.from("ai_cache").upsert({
      input_hash: hash,
      type,
      output,
      model,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      hit_count: 0,
    }, { onConflict: "input_hash" });
  } catch (e) {
    console.error("Cache write error:", e);
  }
}

// ── Gemini Flash caller ──
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1200
): Promise<string> {
  if (!GEMINI_KEY) {
    // Fall back to Groq if Gemini not configured
    return callGroq(systemPrompt, userPrompt, maxTokens);
  }

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.7,
        },
      }),
    });

    if (!res.ok) {
      console.error("Gemini error:", await res.text());
      // Fall back to Groq
      return callGroq(systemPrompt, userPrompt, maxTokens);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";
  } catch (e) {
    console.error("Gemini call failed:", e);
    return callGroq(systemPrompt, userPrompt, maxTokens);
  }
}

// ── Gemini multi-turn ──
async function callGeminiMultiTurn(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 800
): Promise<string> {
  if (!GEMINI_KEY) {
    return callGroqMultiTurn(messages, maxTokens);
  }

  try {
    // Separate system message from conversation
    const systemMsg = messages.find(m => m.role === "system");
    const chatMsgs = messages.filter(m => m.role !== "system");

    const contents = chatMsgs.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: any = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    };
    if (systemMsg) {
      body.system_instruction = { parts: [{ text: systemMsg.content }] };
    }

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Gemini multi-turn error:", await res.text());
      return callGroqMultiTurn(messages, maxTokens);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
  } catch (e) {
    console.error("Gemini multi-turn failed:", e);
    return callGroqMultiTurn(messages, maxTokens);
  }
}

// ── Groq caller ──
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1200
): Promise<string> {
  if (!GROQ_KEY) {
    return "No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY.";
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (res.status === 429) {
    // Rate limited — wait and retry once
    const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
    console.warn(`Groq 429, retrying after ${retryAfter}s`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    const retry = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: maxTokens, temperature: 0.7 }),
    });
    if (!retry.ok) return `LLM rate limited. Please try again in a minute.`;
    const retryData = await retry.json();
    return retryData.choices?.[0]?.message?.content || "No response.";
  }

  if (!res.ok) {
    console.error("Groq error:", await res.text());
    return `LLM error (${res.status}).`;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response from LLM.";
}

async function callGroqMultiTurn(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 800
): Promise<string> {
  if (!GROQ_KEY) return "No AI provider configured.";

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    const retry = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 }),
    });
    if (!retry.ok) return `LLM rate limited. Please try again in a minute.`;
    const retryData = await retry.json();
    return retryData.choices?.[0]?.message?.content || "No response.";
  }
  if (!res.ok) return `LLM error (${res.status}).`;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response.";
}

// ── Provider router ──
function pickProvider(type: string): "gemini" | "groq" {
  if (GEMINI_KEY && GEMINI_TYPES.has(type)) return "gemini";
  return "groq";
}

async function callLLM(type: string, sys: string, usr: string, maxTokens = 1200): Promise<{ text: string; model: string }> {
  const provider = pickProvider(type);
  if (provider === "gemini") {
    const text = await callGemini(sys, usr, maxTokens);
    return { text, model: GEMINI_KEY ? "gemini-2.0-flash" : GROQ_MODEL };
  }
  const text = await callGroq(sys, usr, maxTokens);
  return { text, model: GROQ_MODEL };
}

async function callLLMMultiTurn(type: string, messages: any[], maxTokens = 800): Promise<{ text: string; model: string }> {
  const provider = pickProvider(type);
  if (provider === "gemini") {
    const text = await callGeminiMultiTurn(messages, maxTokens);
    return { text, model: GEMINI_KEY ? "gemini-2.0-flash" : GROQ_MODEL };
  }
  const text = await callGroqMultiTurn(messages, maxTokens);
  return { text, model: GROQ_MODEL };
}

// ═══════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, prompt, job, profile, jobs, messages } = body;

    // ── Build cache key from inputs ──
    let cacheKey = "";
    const ttl = CACHE_TTL[type];
    if (ttl !== null && ttl !== undefined) {
      const cacheInput = JSON.stringify({
        type,
        job: job ? { title: job.title, company: job.company, desc: (job.desc || "").slice(0, 200) } : null,
        profile: profile ? { role: profile.role, skills: profile.skills, experience: profile.experience } : null,
        jobs: jobs ? jobs.map((j: any) => j.id).sort() : null,
        prompt: prompt?.slice(0, 200),
      });
      cacheKey = await hashInput(cacheInput);

      // Check cache first
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return jsonResponse({ text: cached, cached: true });
      }
    }

    let text: string;
    let model = "unknown";

    switch (type) {
      // ── Single job match (Groq — speed) ──
      case "match": {
        const sys = `You are a brutally honest career advisor. Analyze the job listing against the candidate's profile.

Give exactly this format:
MATCH SCORE: X/10

STRENGTHS:
- [strength 1]
- [strength 2]
- [strength 3]

GAPS:
- [gap 1]
- [gap 2]

VERDICT: [Apply / Stretch / Skip] — [one-line reason]

Be specific. Reference actual skills and requirements. Max 250 words.`;

        const usr = `JOB: ${job?.title} at ${job?.company}, ${job?.location}
${job?.desc || "No description available"}

CANDIDATE: ${profile?.name || "Unknown"}, ${profile?.role || "Engineer"}, ${profile?.experience || "?"} years experience
Skills: ${profile?.skills || "Not specified"}`;

        const r = await callLLM(type, sys, usr);
        text = r.text; model = r.model;
        break;
      }

      // ── Batch match (Gemini — heavy lifting) ──
      case "batch-match": {
        const sys = `You are a job matching engine. Score each job against the candidate profile.

Return ONLY a valid JSON array. No markdown fences, no explanation, just the raw JSON array:
[{"job_id":"id","score":0.85,"reasons":[{"category":"skill_match","detail":"reason"}],"strengths":["s1"],"gaps":["g1"],"verdict":"apply"}]

Rules:
- score: 0.0 to 1.0 (0.8+ = strong fit, 0.5-0.8 = stretch, <0.5 = skip)
- verdict: "apply" | "stretch" | "skip"
- reasons: 1-3 with category: skill_match, experience_match, domain_match, location_match
- Be honest. Don't inflate scores.`;

        const jobList = (jobs || [])
          .map((j: any) => `[ID: ${j.id}] ${j.title} at ${j.company}, ${j.location}${j.remote ? " (Remote)" : ""}\n${(j.description || "").slice(0, 400)}`)
          .join("\n---\n");

        const usr = `CANDIDATE: ${profile?.name || "Unknown"}, ${profile?.role || "Engineer"}, ${profile?.experience || "?"} years
Skills: ${profile?.skills || "Not specified"}
Resume: ${(profile?.resume_text || "").slice(0, 800)}
Preferred roles: ${(profile?.preferred_roles || []).join(", ") || "Any"}

JOBS TO SCORE:
${jobList}`;

        const r = await callLLM(type, sys, usr, 3000);
        text = r.text; model = r.model;
        break;
      }

      // ── Cover letter (Gemini — writing quality) ──
      case "cover": {
        const sys = `Write a compelling, specific cover letter. Rules:
- Max 250 words
- Open with WHY this company/role excites you (specific, not generic)
- Middle: match 2-3 of YOUR skills to THEIR requirements with concrete examples
- Close with enthusiasm and availability
- No fluff. No "I am writing to express my interest."
- Sound like a confident human, not a template.
- If resume text is provided, reference specific achievements from it.`;

        const usr = `JOB: ${job?.title} at ${job?.company}
${job?.desc || ""}

CANDIDATE: ${profile?.name || "Candidate"}, ${profile?.role || "Engineer"}, ${profile?.experience || "?"} years
Skills: ${profile?.skills || "various"}
Notice: ${profile?.notice || "flexible"}
${profile?.resume_text ? `\nRESUME:\n${(profile.resume_text).slice(0, 1000)}` : ""}`;

        const r = await callLLM(type, sys, usr, 1500);
        text = r.text; model = r.model;
        break;
      }

      // ── Resume tailoring (Gemini — analytical) ──
      case "tailor-resume": {
        const sys = `You are a professional resume consultant. Given a job description and the candidate's current resume/profile, provide specific, actionable suggestions to tailor their resume for THIS role.

Format:
KEY CHANGES:
- [specific change 1]
- [specific change 2]

KEYWORDS TO ADD:
- [keyword from job desc not in resume]

BULLET POINTS TO EMPHASIZE:
- [existing experience to highlight]

SECTIONS TO REORDER:
- [suggestion]

SUMMARY REWRITE:
[Write a 2-3 sentence professional summary tailored to this role]

Be specific. Max 400 words.`;

        const usr = `JOB: ${job?.title} at ${job?.company}
${job?.desc || ""}

CANDIDATE: ${profile?.name || "Unknown"}, Role: ${profile?.role || "Engineer"}, ${profile?.experience || "?"} years
Skills: ${profile?.skills || "Not specified"}
${profile?.resume_text ? `\nCURRENT RESUME:\n${(profile.resume_text).slice(0, 1500)}` : ""}`;

        const r = await callLLM(type, sys, usr, 2000);
        text = r.text; model = r.model;
        break;
      }

      // ── Generate LaTeX from profile (Gemini) ──
      case "generate-latex": {
        const sys = `You are a LaTeX resume generator. Convert the provided resume content into a professional LaTeX resume using Jake's Resume template style.

RULES:
- Use \\section for main sections (Summary, Skills, Experience, Education, Projects, Achievements)
- Use \\resumeSubheading{title}{date}{company}{location} for job entries
- Use \\resumeSubheadingContinue{subtitle}{} for sub-categories within a role
- Use \\resumeItem{text} for bullet points inside \\resumeItemListStart/\\resumeItemListEnd
- Use \\textbf{} for emphasis, \\href{url}{text} for links
- Use \\begin{center} for the header with name and contact info
- Output ONLY the LaTeX body (between \\begin{document} and \\end{document})
- Do NOT include preamble, \\documentclass, or \\newcommand definitions
- Do NOT output markdown, explanations, or career advice
- Keep ALL facts exactly as provided`;

        const usr = `RESUME CONTENT:\n${body?.resume_content || ""}`;
        const r = await callLLM(type, sys, usr, 4000);
        text = r.text; model = r.model;
        break;
      }

      // ── LaTeX resume rewrite (Gemini — structured output) ──
      case "rewrite-latex": {
        const sys = `You are a LaTeX resume rewriter. You receive the BODY of a LaTeX resume (between \\begin{document} and \\end{document}) and a set of suggestions.

RULES:
- Rewrite the body by applying the suggestions
- Keep ALL existing LaTeX commands intact (\\resumeSubheading, \\resumeItem, \\section, \\resumeSubheadingContinue, \\resumeItemListStart, etc.)
- Keep the SAME facts, dates, companies, and structure
- Do NOT invent new experiences or achievements
- Rephrase bullet points to emphasize relevance to the target job
- Add relevant keywords from the suggestions where they fit naturally
- Output ONLY the LaTeX body content — no \\documentclass, no preamble, no \\begin{document}, no \\end{document}
- Do NOT output markdown, explanations, career advice, or anything other than LaTeX code
- Do NOT wrap output in code fences`;

        const latex_body = body?.latex_body || "";
        const suggestions_text = body?.suggestions || "";
        const target = body?.target || "";

        const usr = `TARGET ROLE: ${target}

SUGGESTIONS TO APPLY:
${suggestions_text}

LATEX BODY TO REWRITE:
${latex_body}`;

        const r = await callLLM(type, sys, usr, 4000);
        text = r.text; model = r.model;
        break;
      }

      // ── Interview prep (Groq — speed) ──
      case "interview-prep": {
        const sys = `You are an interview coach. Generate comprehensive interview prep.

Format:
COMPANY RESEARCH:
- [2-3 key facts relevant to the interview]

BEHAVIORAL QUESTIONS (5):
1. [question]
   Approach: [STAR format hint]

TECHNICAL QUESTIONS (5):
1. [question]
   Key points: [brief]

QUESTIONS TO ASK THEM:
1. [thoughtful question]

SALARY TALKING POINTS:
- [1-2 points]

Max 600 words. Be specific to the role and company.`;

        const usr = `JOB: ${job?.title} at ${job?.company}, ${job?.location}
${job?.desc || ""}

CANDIDATE: ${profile?.name || "Unknown"}, ${profile?.role || "Engineer"}, ${profile?.experience || "?"} years
Skills: ${profile?.skills || "Not specified"}
${profile?.resume_text ? `\nRESUME:\n${(profile.resume_text).slice(0, 800)}` : ""}`;

        const r = await callLLM(type, sys, usr, 2500);
        text = r.text; model = r.model;
        break;
      }

      // ── Skill gap analysis (Gemini — analytical) ──
      case "skill-gap": {
        const sys = `You are a career development advisor. Analyze the gaps between a candidate's current skills and what the job market demands for their target role.

Format:
TOP SKILLS TO DEVELOP:
1. [Skill] — [Why it matters for their target role, how common it is in job listings]
2. ...

LEARNING PATH:
- [Skill 1]: [specific free/affordable resource or approach]
- [Skill 2]: [resource]

QUICK WINS (can improve in <2 weeks):
- [actionable item]

MARKET POSITIONING:
[2-3 sentences on how they compare to the market and what would make them stand out]

Be specific and actionable. Max 400 words.`;

        const usr = `CANDIDATE: ${profile?.name || "Unknown"}, ${profile?.role || "Engineer"}, ${profile?.experience || "?"} years
Skills: ${profile?.skills || "Not specified"}
Target roles: ${(profile?.preferred_roles || []).join(", ") || "Not specified"}
Regions: ${(profile?.preferred_regions || []).join(", ") || "Any"}

COMMON GAPS FROM RECENT JOB MATCHES:
${prompt || "No gap data available yet."}`;

        const r = await callLLM(type, sys, usr, 2000);
        text = r.text; model = r.model;
        break;
      }

      // ── Onboarding chat (Gemini — conversational) ──
      case "onboard": {
        const sysMsg = {
          role: "system",
          content: `You are FLINT, a friendly AI job search agent doing an intake interview to set up a user's profile. You need to gather ALL of these fields through natural conversation:

1. role - their target job title (e.g. "Senior SRE", "Backend Engineer")
2. experience - years of experience (number)
3. skills - key technical skills (comma-separated)
4. preferred_roles - array of role categories: SRE, Platform, Security, DevSecOps, DevOps, Cloud, Infrastructure, Backend, Frontend, Fullstack, Data, ML/AI, Mobile, QA, Product, Architect
5. preferred_regions - array of: in, gb, de, fr, us, ca, au, remote
6. salary_min and salary_max - expected salary range (number, annual)
7. notice - notice period
8. visa - work authorization status
9. work_mode - Remote, Hybrid, or Onsite

Rules:
- Ask ONE thing at a time. Keep responses under 50 words.
- Be warm, conversational, and encouraging.
- Extract data from natural language (e.g. "5 years in DevOps" -> experience: 5, skills include DevOps)
- When you have ALL fields, respond with EXACTLY this at the end of your message:
\`\`\`json
{"complete": true, "profile": {"role": "...", "experience": "...", "skills": "...", "preferred_roles": [...], "preferred_regions": [...], "salary_min": 0, "salary_max": 0, "notice": "...", "visa": "...", "work_mode": "..."}}
\`\`\`
- Before sending the JSON, give a brief friendly summary of what you captured.
- If the user skips a field or says "skip", use reasonable defaults.
- Do NOT send the JSON until you've asked about ALL fields.`,
        };

        const chatMessages = [sysMsg, ...(messages || [])];
        const r = await callLLMMultiTurn(type, chatMessages, 800);
        text = r.text; model = r.model;
        break;
      }

      // ── General chat (Groq — speed) ──
      case "chat": {
        const sys = `You are a sharp career advisor for ${profile?.name || "a tech professional"}, currently a ${profile?.role || "engineer"} with ${profile?.experience || "several"} years experience. Skills: ${profile?.skills || "various"}.

Be concise. Be actionable. Give specific advice, not platitudes. Max 300 words.`;

        const r = await callLLM(type, sys, prompt || "Help me with my job search.");
        text = r.text; model = r.model;
        break;
      }

      default:
        return jsonResponse({ error: `Unknown type: ${type}` }, 400);
    }

    // ── Write to cache ──
    if (cacheKey) {
      cacheSet(cacheKey, type, text, model); // fire-and-forget
    }

    return jsonResponse({ text, model });
  } catch (e) {
    console.error("Edge function error:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});
