import { useState, useEffect } from 'react';
import { C, MONO } from '../theme';
import { db } from '../api';
import useStore from '../store';
import Spinner from '../components/ui/Spinner';

// ── Salary bar chart (pure CSS) ──
function SalaryChart({ data }) {
  if (!data || data.sample_size < 3) return null;
  const max = data.max || data.percentile_75 * 1.2;
  const fmt = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  };

  const bars = [
    { label: '25th', value: data.percentile_25, color: C.acc },
    { label: 'Median', value: data.median, color: C.grn },
    { label: '75th', value: data.percentile_75, color: C.blu },
  ];

  return (
    <div style={{ marginTop: 12 }}>
      {bars.map((b) => (
        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 50, fontSize: 10, fontFamily: MONO, color: C.t3, textAlign: 'right' }}>{b.label}</span>
          <div style={{ flex: 1, height: 20, background: C.c2, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min((b.value / max) * 100, 100)}%`,
              background: b.color + '44', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 8,
              transition: 'width .5s ease',
            }}>
              <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: b.color }}>
                {data.currency} {fmt(b.value)}
              </span>
            </div>
          </div>
        </div>
      ))}
      <p style={{ fontSize: 10, fontFamily: MONO, color: C.t3, marginTop: 4 }}>
        Based on {data.sample_size} job listings (last 90 days)
      </p>
    </div>
  );
}

export default function Profile() {
  const { profile, setProfile, matches, qa, addQA, deleteQA } = useStore();
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [activeSection, setActiveSection] = useState('profile'); // profile | skills | salary

  // Skill gap state
  const [skillGap, setSkillGap] = useState('');
  const [skillLoading, setSkillLoading] = useState(false);

  // Salary insights state
  const [salary, setSalary] = useState(null);
  const [salaryLoading, setSalaryLoading] = useState(false);

  const handleFieldChange = (key, value) => {
    setProfile({ ...profile, [key]: value });
    db.saveProfile({ [key]: value });
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await db.uploadResume(file);
    if (url) {
      setProfile({ ...profile, resume_url: url });
      db.parseResume(url);
    }
  };

  const handleAddQA = async () => {
    if (!newQ.trim() || !newA.trim()) return;
    await addQA(newQ.trim(), newA.trim());
    setNewQ('');
    setNewA('');
  };

  // Analyze skill gaps from match data
  const analyzeSkillGap = async () => {
    setSkillLoading(true);
    // Aggregate gaps from recent matches
    const gapSummary = (matches || [])
      .filter((m) => m.gaps?.length > 0)
      .flatMap((m) => m.gaps)
      .reduce((acc, gap) => {
        acc[gap] = (acc[gap] || 0) + 1;
        return acc;
      }, {});

    const gapList = Object.entries(gapSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([gap, count]) => `${gap} (appeared in ${count} job matches)`)
      .join('\n');

    const res = await db.callAI({
      type: 'skill-gap',
      prompt: gapList || 'No specific gaps identified yet — analyze based on profile.',
      profile,
    });
    setSkillGap(res?.text || 'Could not generate skill gap analysis.');
    setSkillLoading(false);
  };

  // Load salary insights
  const loadSalary = async () => {
    setSalaryLoading(true);
    // Determine category from profile role
    const roleMap = {
      sre: 'SRE', platform: 'Platform', devops: 'DevOps', backend: 'Backend',
      frontend: 'Frontend', fullstack: 'Fullstack', data: 'Data', security: 'Security',
      cloud: 'Cloud', infrastructure: 'Infrastructure', ml: 'ML/AI', ai: 'ML/AI',
    };
    const role = (profile?.role || '').toLowerCase();
    let category = 'Engineering';
    for (const [key, val] of Object.entries(roleMap)) {
      if (role.includes(key)) { category = val; break; }
    }

    const region = profile?.preferred_regions?.[0] || null;
    const data = await db.salaryInsights(category, region);
    setSalary(data);
    setSalaryLoading(false);
  };

  const editableFields = [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Target Role', placeholder: 'Senior SRE' },
    { key: 'experience', label: 'Years of Experience', placeholder: '5' },
    { key: 'skills', label: 'Key Skills', placeholder: 'AWS, K8s, Python, Go' },
    { key: 'notice', label: 'Notice Period', placeholder: '30 days' },
    { key: 'compensation', label: 'Current Compensation', placeholder: '25 LPA' },
    { key: 'expected', label: 'Expected Compensation', placeholder: '65-90 LPA' },
    { key: 'visa', label: 'Work Authorization', placeholder: 'No visa needed' },
    { key: 'work_mode', label: 'Work Mode', placeholder: 'Remote' },
  ];

  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <h2 style={{ color: C.t1, fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
        Profile
      </h2>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[
          { id: 'profile', label: 'Details' },
          { id: 'skills', label: 'Skill gap' },
          { id: 'salary', label: 'Salary' },
        ].map((t) => (
          <button key={t.id} onClick={() => setActiveSection(t.id)}
            style={{
              padding: '6px 14px', border: `1px solid ${activeSection === t.id ? C.br : 'transparent'}`,
              borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: activeSection === t.id ? C.c1 : 'transparent',
              color: activeSection === t.id ? C.t1 : C.t3,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Profile section ── */}
      {activeSection === 'profile' && (
        <>
          {/* Resume upload */}
          <div style={{
            background: C.c1, border: `1px solid ${profile?.resume_url ? C.grn + '44' : C.br}`,
            borderRadius: 14, padding: 18, marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: profile?.resume_url ? C.grn : C.acc, marginBottom: 10 }}>
              {profile?.resume_url ? 'RESUME UPLOADED' : 'UPLOAD RESUME'}
            </div>
            <p style={{ color: C.t3, fontSize: 12, marginBottom: 10 }}>Required for AI matching and resume tailoring.</p>
            <input type="file" accept=".pdf,.doc,.docx" onChange={handleResumeUpload} style={{ fontSize: 13 }} />
            {profile?.resume_url && (
              <p style={{ fontSize: 11, color: C.grn, marginTop: 8, fontFamily: MONO }}>
                {profile.resume_url.split('/').pop()}
              </p>
            )}
          </div>

          {/* Profile fields */}
          <div style={{ background: C.c1, border: `1px solid ${C.br}`, borderRadius: 14, padding: 18, marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.t3, marginBottom: 12 }}>PROFILE DETAILS</div>
            {editableFields.map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, fontFamily: MONO, color: C.t3, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                <input value={profile?.[key] || ''} onChange={(e) => handleFieldChange(key, e.target.value)} placeholder={placeholder} />
              </div>
            ))}
          </div>

          {/* Saved Q&A */}
          <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.pur, marginBottom: 10 }}>
            SAVED Q&A ({qa.length})
          </div>
          {qa.map((q) => (
            <div key={q.id} style={{
              background: C.c1, border: `1px solid ${C.br}`, borderRadius: 10, padding: 14,
              marginBottom: 8, display: 'flex', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.t2, margin: 0 }}>{q.question}</p>
                <p style={{ fontSize: 14, color: C.acc, margin: '4px 0 0' }}>{q.answer}</p>
              </div>
              <button onClick={() => deleteQA(q.id)}
                style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', opacity: 0.6, fontSize: 16 }}>
                {'\u00D7'}
              </button>
            </div>
          ))}
          <div style={{ background: C.c1, border: `1px solid ${C.br}`, borderRadius: 10, padding: 14, marginTop: 12 }}>
            <input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Question" style={{ marginBottom: 8 }} />
            <input value={newA} onChange={(e) => setNewA(e.target.value)} placeholder="Answer" onKeyDown={(e) => e.key === 'Enter' && handleAddQA()} />
            <button onClick={handleAddQA} disabled={!newQ.trim() || !newA.trim()}
              style={{ marginTop: 8, padding: '8px 16px', background: C.grad, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Add Q&A
            </button>
          </div>
        </>
      )}

      {/* ── Skill Gap section ── */}
      {activeSection === 'skills' && (
        <div style={{ background: C.c1, border: `1px solid ${C.br}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.pur, marginBottom: 4 }}>SKILL GAP ANALYSIS</div>
              <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>
                Based on {matches?.length || 0} job matches
              </p>
            </div>
            <button onClick={analyzeSkillGap} disabled={skillLoading}
              style={{
                padding: '8px 18px', background: skillLoading ? C.c2 : C.pur + '22',
                border: `1px solid ${C.pur}44`, borderRadius: 8, color: C.pur,
                cursor: skillLoading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
              }}>
              {skillLoading ? 'Analyzing...' : skillGap ? 'Re-analyze' : 'Analyze Gaps'}
            </button>
          </div>

          {skillLoading && (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <Spinner size={24} color={C.pur} />
              <p style={{ color: C.t3, fontSize: 12, marginTop: 10 }}>Analyzing your skill gaps against market demand...</p>
            </div>
          )}

          {!skillLoading && skillGap ? (
            <div style={{
              padding: 16, background: C.bg, borderRadius: 10, border: `1px solid ${C.br}`,
              fontSize: 13, lineHeight: 1.8, color: C.t2, whiteSpace: 'pre-wrap',
            }}>
              {skillGap}
            </div>
          ) : !skillLoading && (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }}>{'\u{1F4CA}'}</span>
              <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.6 }}>
                Click "Analyze Gaps" to see what skills to develop based on your job matches.
                {(!matches || matches.length === 0) && ' Run some matches first for better results.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Salary Insights section ── */}
      {activeSection === 'salary' && (
        <div style={{ background: C.c1, border: `1px solid ${C.br}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.grn, marginBottom: 4 }}>SALARY INSIGHTS</div>
              <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>
                Market rates for {profile?.role || 'your role'}
              </p>
            </div>
            <button onClick={loadSalary} disabled={salaryLoading}
              style={{
                padding: '8px 18px', background: salaryLoading ? C.c2 : C.grn + '22',
                border: `1px solid ${C.grn}44`, borderRadius: 8, color: C.grn,
                cursor: salaryLoading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
              }}>
              {salaryLoading ? 'Loading...' : salary ? 'Refresh' : 'Load Insights'}
            </button>
          </div>

          {salaryLoading && (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <Spinner size={24} color={C.grn} />
            </div>
          )}

          {!salaryLoading && salary && salary.sample_size >= 3 ? (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Low', value: salary.percentile_25, color: C.acc },
                  { label: 'Median', value: salary.median, color: C.grn },
                  { label: 'High', value: salary.percentile_75, color: C.blu },
                ].map((s) => (
                  <div key={s.label} style={{
                    flex: '1 1 100px', background: C.bg, border: `1px solid ${s.color}22`,
                    borderRadius: 10, padding: 14, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, fontFamily: MONO, color: s.color }}>
                      {salary.currency} {s.value >= 1000000 ? `${(s.value / 1000000).toFixed(1)}M` : s.value >= 1000 ? `${Math.round(s.value / 1000)}K` : s.value}
                    </div>
                  </div>
                ))}
              </div>
              <SalaryChart data={salary} />
            </>
          ) : !salaryLoading && salary ? (
            <p style={{ color: C.t3, fontSize: 13, textAlign: 'center', padding: 20 }}>
              Not enough salary data for this role/region. Try a broader category.
            </p>
          ) : !salaryLoading && (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }}>{'\u{1F4B0}'}</span>
              <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.6 }}>
                Click "Load Insights" to see market salary data based on scraped job listings.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
