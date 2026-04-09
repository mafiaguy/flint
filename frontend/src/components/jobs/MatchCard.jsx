import { useNavigate } from 'react-router-dom';
import { C, MONO, FLAGS, SOURCE_COLORS } from '../../theme';

export default function MatchCard({ match }) {
  const navigate = useNavigate();
  const job = match.jobs || {};
  const srcColor = SOURCE_COLORS[job.source] || C.t3;
  const days = job.posted ? Math.max(0, Math.floor((Date.now() - new Date(job.posted)) / 864e5)) : null;

  const pct = Math.round(match.score * 100);
  const scoreColor = pct >= 80 ? C.grn : pct >= 60 ? C.acc : C.t3;

  return (
    <div
      onClick={() => navigate(`/job/${encodeURIComponent(job.id)}`)}
      style={{
        background: C.c1, border: `1px solid ${C.br}`, borderRadius: 10, padding: "14px 16px",
        cursor: "pointer", transition: "border-color .15s",
        display: "flex", gap: 14, alignItems: "flex-start",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.t3 + "44")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.br)}
    >
      {/* Score */}
      <div style={{
        width: 44, height: 44, borderRadius: 8, border: `1px solid ${scoreColor}33`,
        background: scoreColor + "0a", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor, fontFamily: MONO, lineHeight: 1 }}>{pct}</span>
        <span style={{ fontSize: 8, color: scoreColor + "88", fontFamily: MONO }}>%</span>
      </div>

      {/* Job info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.t1, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.title}
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: C.t2 }}>{job.company}</span>
          <span style={{ fontSize: 12, color: C.t3 }}>{job.location}</span>
          {job.remote && <span style={{ fontSize: 11, color: C.t3 }}>Remote</span>}
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: srcColor, fontWeight: 600 }}>{job.source}</span>
          {days !== null && <span style={{ fontSize: 11, color: C.t3 }}>{days === 0 ? "Today" : `${days}d ago`}</span>}
          {job.salary && job.salary !== "\u2014" && (
            <span style={{ fontSize: 11, color: C.grn, fontFamily: MONO }}>{job.salary}</span>
          )}
          {/* Strengths */}
          {(match.strengths || []).slice(0, 2).map((s, i) => (
            <span key={i} style={{
              fontSize: 11, color: C.t2, background: C.c2, padding: "1px 8px", borderRadius: 4,
            }}>
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Arrow */}
      <svg width="16" height="16" fill="none" stroke={C.t3} strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 4 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </div>
  );
}
