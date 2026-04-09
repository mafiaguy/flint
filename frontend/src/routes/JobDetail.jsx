import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { C, MONO, FLAGS, SOURCE_COLORS } from '../theme';
import { sb } from '../api';
import useStore from '../store';
import Spinner from '../components/ui/Spinner';
import CoverLetterEditor from '../components/apply/CoverLetterEditor';
import ResumeEditor from '../components/apply/ResumeEditor';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, addApplication, applications } = useStore();

  const [job, setJob] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const isApplied = applications.some((a) => a.job_id === decodeURIComponent(id));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const decodedId = decodeURIComponent(id);
      const [jobRes, matchRes] = await Promise.all([
        sb.from('jobs').select('*').eq('id', decodedId).single(),
        sb.from('job_matches').select('*').eq('job_id', decodedId).single(),
      ]);
      setJob(jobRes.data);
      setMatch(matchRes.data);
      setLoading(false);
    })();
  }, [id]);

  const markApplied = async () => {
    if (!job) return;
    await addApplication(job);
    navigate('/tracker');
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center' }}>
        <Spinner size={36} color={C.acc} />
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ color: C.t3, fontSize: 14 }}>Job not found.</p>
        <button
          onClick={() => navigate('/matches')}
          style={{ marginTop: 16, padding: '10px 20px', background: C.c2, color: C.t1, border: `1px solid ${C.br}`, borderRadius: 8, cursor: 'pointer' }}
        >
          Back to Matches
        </button>
      </div>
    );
  }

  const srcColor = SOURCE_COLORS[job.source] || C.acc;
  const days = job.posted ? Math.max(0, Math.floor((Date.now() - new Date(job.posted)) / 864e5)) : null;
  const scorePct = match ? Math.round(match.score * 100) : null;
  const scoreColor = scorePct >= 80 ? C.grn : scorePct >= 60 ? C.acc : scorePct ? C.red : C.t3;

  return (
    <div style={{ maxWidth: 800, padding: '24px 32px 60px' }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.br}`, borderRadius: 8, color: C.t2, fontSize: 12, cursor: 'pointer', marginBottom: 16 }}
      >
        Back
      </button>

      {/* Job header card */}
      <div style={{ background: C.c1, border: `1px solid ${C.br}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Company avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: srcColor + '15',
            border: `1px solid ${srcColor}33`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 22, fontWeight: 900, color: srcColor,
            fontFamily: MONO, flexShrink: 0,
          }}>
            {job.company?.charAt(0) || '?'}
          </div>

          {/* Job info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 700, color: srcColor }}>{(job.source || '').toUpperCase()}</span>
              <span style={{ fontSize: 11, color: C.t3 }}>{FLAGS[job.country] || '\u{1F310}'}</span>
              {job.remote && <span style={{ fontSize: 10, color: C.grn, fontFamily: MONO }}>{'\u{1F30D}'} Remote</span>}
              {days !== null && <span style={{ fontSize: 10, color: C.t3, fontFamily: MONO }}>{days === 0 ? 'Today' : `${days}d ago`}</span>}
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: C.t1, lineHeight: 1.3 }}>{job.title}</h1>
            <p style={{ margin: 0, fontSize: 16, color: C.t2 }}>{job.company}</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.t3 }}>{job.location}</p>
            {job.salary && job.salary !== '\u2014' && (
              <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700, color: C.grn, fontFamily: MONO }}>{job.salary}</p>
            )}
          </div>
        </div>

        {/* Match score bar */}
        {match && (
          <div style={{ marginTop: 16, padding: 14, background: C.bg, borderRadius: 12, border: `1px solid ${C.br}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: scoreColor }}>
                {scorePct}%
              </span>
              <span style={{ fontSize: 13, color: C.t2, fontWeight: 600 }}>Match Score</span>
              <span style={{
                fontSize: 11, fontFamily: MONO, fontWeight: 700, padding: '2px 10px', borderRadius: 99,
                marginLeft: 'auto',
                color: match.verdict === 'apply' ? C.grn : match.verdict === 'stretch' ? C.acc : C.red,
                background: (match.verdict === 'apply' ? C.grn : match.verdict === 'stretch' ? C.acc : C.red) + '15',
              }}>
                {match.verdict === 'apply' ? 'Strong Fit' : match.verdict === 'stretch' ? 'Worth a Shot' : 'Stretch'}
              </span>
            </div>

            {/* Score bar */}
            <div style={{ height: 6, background: C.c2, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ height: '100%', width: `${scorePct}%`, background: scoreColor, borderRadius: 3, transition: 'width .5s ease' }} />
            </div>

            {/* Strengths & gaps */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(match.strengths || []).map((s, i) => (
                <span key={`s${i}`} style={{ fontSize: 11, fontFamily: MONO, color: C.grn, background: C.grn + '11', padding: '3px 10px', borderRadius: 6 }}>+ {s}</span>
              ))}
              {(match.gaps || []).map((g, i) => (
                <span key={`g${i}`} style={{ fontSize: 11, fontFamily: MONO, color: C.acc, background: C.acc + '11', padding: '3px 10px', borderRadius: 6 }}>- {g}</span>
              ))}
            </div>

            {/* Reasons */}
            {match.reasons?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {match.reasons.map((r, i) => (
                  <p key={i} style={{ fontSize: 12, color: C.t2, margin: '4px 0', lineHeight: 1.5 }}>
                    <span style={{ color: C.t3, fontFamily: MONO, fontSize: 10 }}>{(r.category || '').replace(/_/g, ' ').toUpperCase()}</span>
                    {' '}{r.detail || r}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: '1 1 100%', padding: 14, background: C.grad, color: '#fff',
              borderRadius: 12, textAlign: 'center', fontWeight: 800, fontSize: 15, display: 'block',
            }}
          >
            Apply on {job.source}
          </a>
          {!isApplied ? (
            <button
              onClick={markApplied}
              style={{ flex: 1, padding: 12, background: C.c2, color: C.t1, border: `1px solid ${C.br}`, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Mark as Applied
            </button>
          ) : (
            <span style={{ flex: 1, padding: 12, background: C.grn + '15', color: C.grn, borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 13, fontFamily: MONO }}>
              Applied
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.br}` }}>
        {[
          { id: 'overview', label: 'Job Details' },
          { id: 'cover', label: 'Cover Letter' },
          { id: 'resume', label: 'Tailor Resume' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, padding: '10px 8px', border: 'none', fontSize: 12, fontWeight: 700,
              fontFamily: MONO, cursor: 'pointer',
              background: activeTab === t.id ? C.acc + '22' : C.c1,
              color: activeTab === t.id ? C.acc : C.t3,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: C.c1, border: `1px solid ${C.br}`, borderRadius: 14, padding: 20 }}>
        {activeTab === 'overview' && (
          <div style={{
            fontSize: 14, lineHeight: 1.8, color: C.t2, whiteSpace: 'pre-wrap',
            maxHeight: 600, overflow: 'auto',
          }}>
            {job.description || 'No description available.'}
          </div>
        )}

        {activeTab === 'cover' && <CoverLetterEditor job={job} />}
        {activeTab === 'resume' && <ResumeEditor job={job} />}
      </div>
    </div>
  );
}
