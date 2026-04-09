import { useState } from 'react';
import { C, MONO, FLAGS, CATS } from '../theme';
import { db } from '../api';
import useStore from '../store';
import Chip from '../components/ui/Chip';
import ScanBar from '../components/ui/ScanBar';
import JobCard from '../components/jobs/JobCard';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

const QUICK = ["Site Reliability Engineer", "Platform Engineer", "Cloud Security", "DevSecOps", "DevOps", "Infrastructure"];

export default function Browse() {
  const { jobs, setJobs, profile, applications, addApplication } = useStore();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [selCountries, setSelCountries] = useState([]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(jobs.length ? `${jobs.length} jobs` : "");

  // Modals
  const [matchJob, setMatchJob] = useState(null);
  const [matchRes, setMatchRes] = useState("");
  const [matchLoading, setMatchLoading] = useState(false);

  const appliedIds = applications.map((a) => a.job_id);

  const doSearch = async () => {
    setLoading(true);
    const [cached, live] = await Promise.all([db.getJobs(search, cat), db.liveSearch(search)]);
    const all = [...(cached || []), ...(live?.jobs || [])];
    const seen = new Set();
    const unique = all.filter((j) => {
      const k = (j.title + j.company).toLowerCase().replace(/\W/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    unique.sort((a, b) => new Date(b.posted || 0) - new Date(a.posted || 0));
    setJobs(unique);
    setStatus(`${unique.length} jobs`);
    setLoading(false);
  };

  const doMatch = async (job) => {
    setMatchJob(job);
    setMatchRes("");
    setMatchLoading(true);
    const r = await db.callAI({
      type: "match",
      job: { title: job.title, company: job.company, location: job.location, desc: (job.description || "").slice(0, 800) },
      profile,
    });
    setMatchRes(r?.text || "AI unavailable.");
    setMatchLoading(false);
  };

  const handleApply = async (job) => {
    window.open(job.url, "_blank");
    await addApplication(job);
  };

  const filtered = jobs.filter((j) => {
    const mc = cat === "All" || (j.category || "").toLowerCase().includes(cat.toLowerCase());
    const ms = !search || [j.title, j.company, j.location].join(" ").toLowerCase().includes(search.toLowerCase());
    const mr = !remoteOnly || j.remote;
    const ml = selCountries.length === 0 || selCountries.includes(j.country);
    return mc && ms && mr && ml;
  });

  return (
    <div style={{ padding: "24px 32px 60px" }}>
      {/* Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
          onKeyDown={(e) => e.key === "Enter" && doSearch()} style={{ flex: 1, fontSize: 15, padding: "13px 16px" }} />
        <button onClick={doSearch} disabled={loading}
          style={{
            padding: "0 22px", background: loading ? C.c2 : C.grad, color: loading ? C.t3 : "#fff",
            border: "none", borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: loading ? "wait" : "pointer",
          }}>
          SEARCH
        </button>
      </div>

      {/* Quick filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {QUICK.map((p) => <Chip key={p} active={search === p} onClick={() => setSearch(p)}>{p}</Chip>)}
      </div>

      {/* Categories */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {CATS.map((c) => <Chip key={c} active={cat === c} color={C.pur} onClick={() => setCat(c)}>{c}</Chip>)}
      </div>

      {/* Region */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, fontFamily: MONO, color: C.t3 }}>REGION:</span>
        {Object.entries(FLAGS).filter(([k]) => k !== "other").map(([cc, flag]) => (
          <Chip key={cc} active={selCountries.includes(cc)} color={C.blu}
            onClick={() => setSelCountries((p) => p.includes(cc) ? p.filter((c) => c !== cc) : [...p, cc])}>
            {flag} {cc.toUpperCase()}
          </Chip>
        ))}
      </div>

      {/* Remote & clear */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setRemoteOnly((p) => !p)}
          style={{
            padding: "5px 16px", fontSize: 12, border: `1px solid ${remoteOnly ? C.grn + "55" : C.br}`,
            borderRadius: 99, background: remoteOnly ? C.grn + "15" : "transparent",
            color: remoteOnly ? C.grn : C.t3, cursor: "pointer", fontWeight: 600, fontFamily: MONO,
          }}>
          {"\u{1F30D}"} Remote{remoteOnly && " \u2713"}
        </button>
        {(selCountries.length > 0 || remoteOnly) && (
          <button onClick={() => { setSelCountries([]); setRemoteOnly(false); }}
            style={{ padding: "5px 12px", fontSize: 11, border: `1px solid ${C.br}`, borderRadius: 99, background: "transparent", color: C.t3, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      {loading && <ScanBar />}
      {status && <p style={{ fontSize: 11, fontFamily: MONO, color: C.t3, margin: "0 0 12px" }}>{status} &middot; {filtered.length} showing</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((j) => (
          <JobCard key={j.id} job={j} applied={appliedIds.includes(j.id)} onApply={handleApply} onMatch={doMatch} />
        ))}
      </div>

      {/* Match modal */}
      {matchJob && (
        <Modal onClose={() => setMatchJob(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.pur, marginBottom: 6 }}>AI MATCH</div>
              <h3 style={{ color: C.t1, fontSize: 16, fontWeight: 700, margin: 0 }}>{matchJob.title} &middot; {matchJob.company}</h3>
            </div>
            <button onClick={() => setMatchJob(null)} style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", fontSize: 20 }}>
              {"\u2715"}
            </button>
          </div>
          {matchLoading ? (
            <div style={{ textAlign: "center", padding: 40 }}><Spinner size={36} color={C.acc} /></div>
          ) : (
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.8, color: C.t2, background: C.bg, padding: 18, borderRadius: 12, border: `1px solid ${C.br}` }}>
              {matchRes}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
