import { useState } from 'react';
import { C } from '../theme';
import AuthModal from '../components/layout/AuthModal';

export default function Landing() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", maxWidth: 960, margin: "0 auto" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.t1 }}>flint</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="https://github.com/mafiaguy/flint" target="_blank" rel="noreferrer"
            style={{ padding: "8px 16px", border: `1px solid ${C.br}`, borderRadius: 8, color: C.t2, fontSize: 13 }}>
            GitHub
          </a>
          <button onClick={() => setShowAuth(true)}
            style={{ padding: "8px 20px", background: C.t1, color: C.bg, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Sign in
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "100px 24px 60px", textAlign: "center" }}>
        <h1 style={{ fontSize: "clamp(32px,5vw,48px)", fontWeight: 800, lineHeight: 1.15, marginBottom: 16, color: C.t1 }}>
          Jobs matched to your resume, not the other way around
        </h1>
        <p style={{ fontSize: 17, color: C.t2, maxWidth: 460, margin: "0 auto 32px", lineHeight: 1.7 }}>
          FLINT scrapes 10,000+ jobs from 9 sources, scores them against your profile, and helps you apply with tailored cover letters and resumes.
        </p>
        <button onClick={() => setShowAuth(true)}
          style={{ padding: "14px 32px", background: C.t1, color: C.bg, border: "none", borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          Get started
        </button>
        <p style={{ color: C.t3, fontSize: 13, marginTop: 12 }}>Free, open source, no API keys needed.</p>
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 1, background: C.br, borderRadius: 12, overflow: "hidden" }}>
          {[
            { n: "1", t: "Upload resume", d: "Or tell us about yourself in a quick chat." },
            { n: "2", t: "Get matched", d: "AI scores jobs from LinkedIn, Greenhouse, Adzuna, and 6 more sources." },
            { n: "3", t: "Apply smarter", d: "Generate tailored cover letters and resumes. Track every application." },
          ].map((s) => (
            <div key={s.n} style={{ background: C.c1, padding: 24 }}>
              <span style={{ fontSize: 13, color: C.t3, fontWeight: 600 }}>{s.n}</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.t1, margin: "8px 0 6px" }}>{s.t}</h3>
              <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sources */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "0 24px 60px", maxWidth: 600, margin: "0 auto" }}>
        {["LinkedIn", "Adzuna", "Greenhouse", "Ashby", "Lever", "Workable", "HackerNews", "Naukri"].map((s) => (
          <span key={s} style={{ padding: "5px 12px", border: `1px solid ${C.br}`, borderRadius: 6, fontSize: 12, color: C.t3 }}>
            {s}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "20px 24px", borderTop: `1px solid ${C.br}`, fontSize: 12, color: C.t3 }}>
        Built by <a href="https://mafiaguy.github.io" target="_blank" rel="noreferrer" style={{ color: C.t2 }}>mafiaguy</a>
        {" "}&middot;{" "}
        <a href="https://github.com/mafiaguy/flint" target="_blank" rel="noreferrer" style={{ color: C.t2 }}>Source</a>
        {" "}&middot; MIT
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
