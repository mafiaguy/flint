import { useState } from 'react';
import { C, MONO } from '../theme';
import AuthModal from '../components/layout/AuthModal';

const SOURCES = ["LinkedIn", "Adzuna", "Greenhouse", "Ashby", "Lever", "Workable", "HackerNews", "Naukri"];

const FEATURES = [
  { t: "Resume matching", d: "Upload once. Every job gets scored against your experience, skills, and preferences." },
  { t: "9 job sources", d: "LinkedIn, Greenhouse, Ashby, Adzuna, Lever, Workable, HackerNews, Naukri scraped every 8 hours." },
  { t: "Cover letters", d: "One-click generation tailored to each company and role. Edit in-browser, export as PDF." },
  { t: "Resume tailoring", d: "AI analyzes each job posting and suggests specific changes to your resume." },
  { t: "Application tracker", d: "Kanban board from Applied through Interview to Offer. Drag to update, add notes." },
  { t: "Interview prep", d: "Auto-generated when you move to Interview stage. Questions, talking points, company research." },
];

export default function Landing() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* Nav */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 32px", maxWidth: 1200, margin: "0 auto",
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.t1 }}>flint</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="https://github.com/mafiaguy/flint" target="_blank" rel="noreferrer"
            style={{ padding: "8px 16px", color: C.t3, fontSize: 14 }}>
            GitHub
          </a>
          <button onClick={() => setShowAuth(true)}
            style={{
              padding: "8px 20px", background: C.t1, color: C.bg, border: "none",
              borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px 60px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          {/* Left: copy */}
          <div>
            <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2, color: C.t1, marginBottom: 16 }}>
              Jobs matched to your resume, not the other way around
            </h1>
            <p style={{ fontSize: 16, color: C.t2, lineHeight: 1.7, marginBottom: 28, maxWidth: 480 }}>
              FLINT scrapes 10,000+ jobs from 9 sources every 8 hours, scores each one against your profile, and helps you apply with tailored cover letters and resumes.
            </p>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button onClick={() => setShowAuth(true)}
                style={{
                  padding: "12px 28px", background: C.t1, color: C.bg, border: "none",
                  borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}>
                Get started
              </button>
              <span style={{ fontSize: 13, color: C.t3 }}>Free and open source</span>
            </div>
          </div>

          {/* Right: preview card */}
          <div style={{
            background: C.c1, border: `1px solid ${C.br}`, borderRadius: 12,
            padding: 24, display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ fontSize: 12, color: C.t3, fontFamily: MONO, marginBottom: 4 }}>Top matches for you</div>
            {[
              { score: 92, title: "Senior Platform Engineer", company: "Datadog", loc: "Remote", src: "Greenhouse" },
              { score: 87, title: "Site Reliability Engineer", company: "GitLab", loc: "Remote", src: "Ashby" },
              { score: 81, title: "Cloud Infrastructure Lead", company: "Stripe", loc: "US / Remote", src: "Greenhouse" },
              { score: 74, title: "DevOps Engineer", company: "Razorpay", loc: "Bangalore", src: "LinkedIn" },
            ].map((j, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, alignItems: "center", padding: "10px 12px",
                background: C.bg, borderRadius: 8, border: `1px solid ${C.br}`,
              }}>
                <span style={{
                  fontSize: 14, fontWeight: 800, fontFamily: MONO, width: 36, textAlign: "center",
                  color: j.score >= 85 ? C.grn : j.score >= 75 ? C.acc : C.t3,
                }}>
                  {j.score}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</div>
                  <div style={{ fontSize: 12, color: C.t3 }}>{j.company} &middot; {j.loc}</div>
                </div>
                <span style={{ fontSize: 11, color: C.t3 }}>{j.src}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sources bar */}
      <div style={{
        maxWidth: 1200, margin: "0 auto", padding: "0 32px 48px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 12, color: C.t3 }}>Sources:</span>
        {SOURCES.map((s) => (
          <span key={s} style={{ fontSize: 13, color: C.t3 }}>{s}</span>
        ))}
      </div>

      {/* Features grid */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px 80px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.t1, marginBottom: 24 }}>How it works</h2>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1,
          background: C.br, borderRadius: 10, overflow: "hidden",
        }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: C.c1, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.t1, margin: "0 0 8px" }}>{f.t}</h3>
              <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center", padding: "20px 32px", borderTop: `1px solid ${C.br}`,
        fontSize: 13, color: C.t3,
      }}>
        Built by <a href="https://mafiaguy.github.io" target="_blank" rel="noreferrer" style={{ color: C.t2 }}>mafiaguy</a>
        {" "}&middot;{" "}
        <a href="https://github.com/mafiaguy/flint" target="_blank" rel="noreferrer" style={{ color: C.t2 }}>Source</a>
        {" "}&middot; MIT
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
