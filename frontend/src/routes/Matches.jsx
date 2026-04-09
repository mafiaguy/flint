import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, MONO } from '../theme';
import useStore from '../store';
import MatchCard from '../components/jobs/MatchCard';
import Spinner from '../components/ui/Spinner';
import ScanBar from '../components/ui/ScanBar';

export default function Matches() {
  const { matches, loading, loadMatches, refreshMatches, profile } = useStore();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (matches.length === 0) loadMatches();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await refreshMatches();
    setRefreshing(false);
  };

  const filtered = matches.filter((m) => {
    if (filter === "strong") return m.score >= 0.7;
    if (filter === "stretch") return m.score >= 0.4 && m.score < 0.7;
    return true;
  });

  const newCount = matches.filter(
    (m) => new Date(m.computed_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length;

  if (loading && matches.length === 0) {
    return (
      <div style={{ padding: "60px 16px", textAlign: "center" }}>
        <Spinner size={28} color={C.t3} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <h2 style={{ color: C.t1, fontSize: 20, fontWeight: 700, margin: 0 }}>
          Matches
        </h2>
        {matches.length > 0 && (
          <span style={{ fontSize: 13, color: C.t3 }}>
            {matches.length} jobs
            {newCount > 0 && ` \u00b7 ${newCount} new`}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={refresh} disabled={refreshing}
          style={{
            padding: "8px 16px", background: C.c1, color: C.t1,
            border: `1px solid ${C.br}`, borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: refreshing ? "wait" : "pointer",
          }}>
          {refreshing ? "Matching..." : "Refresh"}
        </button>
      </div>

      {refreshing && <ScanBar />}

      {/* Filters */}
      {matches.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[
            { id: "all", label: "All", count: matches.length },
            { id: "strong", label: "Strong fit", count: matches.filter((m) => m.score >= 0.7).length },
            { id: "stretch", label: "Worth a shot", count: matches.filter((m) => m.score >= 0.4 && m.score < 0.7).length },
          ].map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 14px", fontSize: 13,
                border: `1px solid ${filter === f.id ? C.br : "transparent"}`,
                borderRadius: 8, background: filter === f.id ? C.c1 : "transparent",
                color: filter === f.id ? C.t1 : C.t3, cursor: "pointer", fontWeight: 500,
              }}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <h3 style={{ color: C.t1, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {matches.length === 0 ? "No matches yet" : "No matches in this filter"}
          </h3>
          <p style={{ color: C.t3, fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: "0 auto 20px" }}>
            {matches.length === 0
              ? !profile?.onboarding_complete
                ? "Set up your profile so we can match you with relevant jobs."
                : "Click Refresh to analyze jobs against your profile."
              : "Try a different filter."}
          </p>
          {matches.length === 0 && !profile?.onboarding_complete && (
            <button onClick={() => navigate("/onboarding")}
              style={{
                padding: "10px 24px", background: C.c1, color: C.t1,
                border: `1px solid ${C.br}`, borderRadius: 8,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}>
              Set up profile
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
