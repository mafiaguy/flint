import { useState } from 'react';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { C, MONO } from '../../theme';
import { db } from '../../api';
import useStore from '../../store';

// PDF styles for tailored resume
const pdfStyles = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 11, color: '#1a1a1a' },
  name: { fontSize: 20, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  contact: { fontSize: 10, color: '#555', marginBottom: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#ddd', marginVertical: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#333', marginBottom: 6, letterSpacing: 1 },
  body: { fontSize: 11, lineHeight: 1.6 },
  paragraph: { marginBottom: 8 },
  bullet: { fontSize: 11, lineHeight: 1.6, marginBottom: 4, paddingLeft: 12 },
});

function ResumePDF({ content, profile }) {
  const lines = content.split('\n');
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (/^[A-Z][A-Z\s&/]+:?$/.test(line) || /^#{1,3}\s/.test(line)) {
      elements.push(
        <View key={i} style={{ marginTop: elements.length > 0 ? 10 : 0 }}>
          <Text style={pdfStyles.sectionTitle}>{line.replace(/^#+\s*/, '').replace(/:$/, '')}</Text>
        </View>
      );
    } else if (/^[-•*]\s/.test(line)) {
      elements.push(
        <Text key={i} style={pdfStyles.bullet}>{'\u2022 '}{line.replace(/^[-•*]\s*/, '')}</Text>
      );
    } else {
      elements.push(
        <Text key={i} style={pdfStyles.paragraph}>{line}</Text>
      );
    }
  }

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View>
          <Text style={pdfStyles.name}>{profile?.name || 'Your Name'}</Text>
          <Text style={pdfStyles.contact}>{profile?.email || ''}</Text>
          {profile?.role && <Text style={pdfStyles.contact}>{profile.role} {'\u2022'} {profile?.experience || ''} years experience</Text>}
          {profile?.skills && <Text style={pdfStyles.contact}>{profile.skills}</Text>}
        </View>
        <View style={pdfStyles.divider} />
        <View style={pdfStyles.body}>{elements}</View>
      </Page>
    </Document>
  );
}

function ResumePreview({ content, profile }) {
  const lines = content.split('\n');

  const renderLines = () => {
    const elements = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { elements.push(<div key={i} style={{ height: 8 }} />); continue; }

      if (/^[A-Z][A-Z\s&/]+:?$/.test(line) || /^#{1,3}\s/.test(line)) {
        elements.push(
          <div key={i} style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#ddd', letterSpacing: 1, marginTop: 12, marginBottom: 4 }}>
            {line.replace(/^#+\s*/, '').replace(/:$/, '')}
          </div>
        );
      } else if (/^[-•*]\s/.test(line)) {
        elements.push(
          <div key={i} style={{ fontSize: 11, lineHeight: 1.6, paddingLeft: 14, color: '#bbb' }}>
            {'\u2022 '}{line.replace(/^[-•*]\s*/, '')}
          </div>
        );
      } else {
        elements.push(
          <div key={i} style={{ fontSize: 11, lineHeight: 1.6, marginBottom: 4, color: '#bbb' }}>{line}</div>
        );
      }
    }
    return elements;
  };

  return (
    <div style={{
      background: '#111', border: `1px solid ${C.br}`, borderRadius: 10,
      padding: 32, maxHeight: 500, overflow: 'auto', fontFamily: 'Helvetica, Arial, sans-serif',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{profile?.name || 'Your Name'}</div>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{profile?.email || ''}</div>
      {profile?.role && <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{profile.role} &bull; {profile?.experience || ''} years experience</div>}
      {profile?.skills && <div style={{ fontSize: 10, color: '#888' }}>{profile.skills}</div>}
      <div style={{ borderBottom: '1px solid #333', margin: '12px 0' }} />
      {renderLines()}
    </div>
  );
}

// Detect garbage resume_text (raw PDF binary, etc.)
function isGarbageText(text) {
  if (!text || text.length < 20) return true;
  return /^%PDF|obj\s*<<|\/Filter\s*\/FlateDecode|endobj|xref|startxref/.test(text);
}

// Convert LaTeX source to clean structured plain text
function latexToText(latex) {
  let text = latex;
  // Remove comments
  text = text.replace(/%.*$/gm, '');
  // Remove preamble (everything before \begin{document})
  text = text.replace(/[\s\S]*?\\begin\{document\}/, '');
  // Remove \end{document}
  text = text.replace(/\\end\{document\}[\s\S]*/, '');
  // Convert section commands to ALL CAPS headers
  text = text.replace(/\\section\*?\{([^}]+)\}/g, (_, t) => `\n${t.toUpperCase()}\n`);
  text = text.replace(/\\subsection\*?\{([^}]+)\}/g, (_, t) => `\n${t}\n`);
  // Convert \textbf, \textit, \emph
  text = text.replace(/\\textbf\{([^}]+)\}/g, '$1');
  text = text.replace(/\\textit\{([^}]+)\}/g, '$1');
  text = text.replace(/\\emph\{([^}]+)\}/g, '$1');
  text = text.replace(/\\underline\{([^}]+)\}/g, '$1');
  // Convert \href{url}{text} to text
  text = text.replace(/\\href\{[^}]+\}\{([^}]+)\}/g, '$1');
  // Convert itemize/enumerate items
  text = text.replace(/\\item\s*/g, '- ');
  // Remove begin/end environments
  text = text.replace(/\\begin\{[^}]+\}(\[[^\]]*\])?/g, '');
  text = text.replace(/\\end\{[^}]+\}/g, '');
  // Remove common commands
  text = text.replace(/\\(vspace|hspace|hfill|vfill|newpage|clearpage|pagebreak|noindent|centering|raggedright|raggedleft|small|footnotesize|large|Large|huge|Huge|normalsize|par)\*?(\{[^}]*\})?/g, '');
  // Remove \command{content} → content for remaining
  text = text.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1');
  // Remove remaining backslash commands
  text = text.replace(/\\[a-zA-Z]+\*?/g, '');
  // Clean up braces
  text = text.replace(/[{}]/g, '');
  // Clean up special chars
  text = text.replace(/~/g, ' ');
  text = text.replace(/\\\\/g, '\n');
  text = text.replace(/\\&/g, '&');
  text = text.replace(/\\%/g, '%');
  text = text.replace(/\\#/g, '#');
  text = text.replace(/\\\$/g, '$');
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export default function ResumeEditor({ job }) {
  const { profile, setProfile } = useStore();
  const [suggestions, setSuggestions] = useState('');
  const initialText = isGarbageText(profile?.resume_text) ? '' : (profile?.resume_text || '');
  const [editedResume, setEditedResume] = useState(initialText);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfEmail, setPdfEmail] = useState(profile?.email || '');
  const [view, setView] = useState('edit'); // edit | suggestions | preview
  const [saved, setSaved] = useState(false);
  const [showLatexPaste, setShowLatexPaste] = useState(false);
  const [latexInput, setLatexInput] = useState('');
  const [converting, setConverting] = useState(false);

  const handleLatexConvert = () => {
    if (!latexInput.trim()) return;
    const converted = latexToText(latexInput);
    setEditedResume(converted);
    setShowLatexPaste(false);
    setLatexInput('');
  };

  // Use AI for better LaTeX conversion when the basic parser isn't enough
  const handleLatexAIConvert = async () => {
    if (!latexInput.trim()) return;
    setConverting(true);
    const res = await db.callAI({
      type: 'chat',
      messages: [{
        role: 'user',
        content: `Convert this LaTeX resume source code to clean plain text. Keep the exact same content, facts, dates, and structure. Use ALL CAPS for section headers, "- " for bullet points, blank lines between sections. Output ONLY the resume text — no explanations, no markdown fences.

LATEX SOURCE:
${latexInput.slice(0, 8000)}`,
      }],
      profile,
    });
    if (res?.text) {
      setEditedResume(res.text);
      setShowLatexPaste(false);
      setLatexInput('');
    }
    setConverting(false);
  };

  // Save edited resume back to profile so AI uses the correct text
  const saveResume = async () => {
    await db.saveProfile({ resume_text: editedResume });
    setProfile({ ...profile, resume_text: editedResume });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // AI suggestions compare the user's resume (editedResume) against the JD
  const analyze = async () => {
    if (!editedResume.trim()) {
      setSuggestions('Paste your resume text in the Edit Resume tab first.');
      return;
    }
    setAnalyzing(true);
    const res = await db.callAI({
      type: 'tailor-resume',
      job: {
        title: job.title,
        company: job.company,
        desc: (job.description || '').slice(0, 1200),
      },
      profile: {
        ...profile,
        resume_text: editedResume,
      },
    });
    setSuggestions(res?.text || 'Could not generate suggestions. Please try again.');
    setAnalyzing(false);
  };

  const applySuggestions = async () => {
    setApplying(true);
    const res = await db.callAI({
      type: 'chat',
      messages: [{
        role: 'user',
        content: `You are a professional resume writer. Rewrite the resume below by applying the tailoring suggestions. Keep the same structure and facts — do NOT invent experience. Just rephrase, reorder, and emphasize what's relevant to the target job.

Output ONLY the final resume body text. No header (name/email — that's added separately). No markdown fences, no explanations. Use ALL CAPS for section headers, "- " for bullets, blank lines between sections.

CURRENT RESUME:
${editedResume}

SUGGESTIONS TO APPLY:
${suggestions}

TARGET: ${job?.title} at ${job?.company}`,
      }],
      profile,
    });
    if (res?.text) {
      setEditedResume(res.text);
      setView('edit');
    }
    setApplying(false);
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const pdfProfile = { ...profile, email: pdfEmail || profile?.email };
      const blob = await pdf(
        <ResumePDF content={editedResume} profile={pdfProfile} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resume_Tailored_${(job.company || 'company').replace(/\s+/g, '_')}_${(job.title || 'role').replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF generation error:', e);
    }
    setDownloading(false);
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.pur }}>RESUME TAILOR</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={analyze}
            disabled={analyzing || !editedResume.trim()}
            style={{
              padding: '6px 16px', background: 'transparent', border: `1px solid ${C.pur}55`,
              borderRadius: 8, color: !editedResume.trim() ? C.t3 : C.pur, cursor: analyzing ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: MONO,
            }}
          >
            {analyzing ? 'Analyzing...' : suggestions ? 'Re-analyze' : 'Get Suggestions'}
          </button>
        </div>
      </div>

      {/* Email for PDF */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: C.t3, fontFamily: MONO, whiteSpace: 'nowrap' }}>EMAIL IN PDF</label>
        <input
          type="email"
          value={pdfEmail}
          onChange={(e) => setPdfEmail(e.target.value)}
          placeholder={profile?.email || 'your@email.com'}
          style={{
            flex: 1, padding: '5px 10px', fontSize: 13,
            background: 'transparent', border: `1px solid ${C.br}`,
            borderRadius: 6, color: C.t1,
          }}
        />
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.br}` }}>
        {[
          { id: 'edit', label: 'Edit Resume' },
          { id: 'suggestions', label: 'AI Suggestions' },
          { id: 'preview', label: 'Preview' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            style={{
              flex: 1, padding: '8px', border: 'none', fontSize: 11, fontWeight: 700,
              fontFamily: MONO, cursor: 'pointer',
              background: view === t.id ? C.pur + '22' : C.c2,
              color: view === t.id ? C.pur : C.t3,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Edit view — this is now the default/first tab */}
      {view === 'edit' && (
        <>
          {!editedResume.trim() && !showLatexPaste && (
            <div style={{
              padding: 16, marginBottom: 10, background: C.acc + '15', border: `1px solid ${C.acc}33`,
              borderRadius: 8, fontSize: 12, color: C.acc, lineHeight: 1.6,
            }}>
              <p style={{ marginBottom: 8 }}>Your uploaded resume couldn't be parsed as text (LaTeX PDFs aren't supported by the basic parser).</p>
              <p style={{ marginBottom: 10 }}>Choose how to import your resume:</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowLatexPaste(true)} style={{
                  padding: '8px 16px', background: C.pur + '22', border: `1px solid ${C.pur}44`,
                  borderRadius: 8, color: C.pur, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                }}>
                  Paste LaTeX Code
                </button>
                <button onClick={() => setShowLatexPaste(false)} style={{
                  padding: '8px 16px', background: 'transparent', border: `1px solid ${C.br}`,
                  borderRadius: 8, color: C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                }}>
                  Paste Plain Text
                </button>
              </div>
            </div>
          )}

          {/* LaTeX paste modal */}
          {showLatexPaste && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: C.pur, fontFamily: MONO, fontWeight: 700 }}>PASTE YOUR LATEX SOURCE</span>
                <button onClick={() => setShowLatexPaste(false)} style={{ color: C.t3, cursor: 'pointer', background: 'none', border: 'none', fontSize: 14 }}>&times;</button>
              </div>
              <textarea
                value={latexInput}
                onChange={(e) => setLatexInput(e.target.value)}
                placeholder={'\\documentclass{article}\n\\begin{document}\n\\section{Experience}\n...\n\\end{document}'}
                rows={12}
                style={{ resize: 'vertical', lineHeight: 1.4, fontSize: 12, minHeight: 200, fontFamily: MONO }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={handleLatexConvert}
                  disabled={!latexInput.trim()}
                  style={{
                    padding: '8px 16px', background: 'transparent', border: `1px solid ${C.br}`,
                    borderRadius: 8, color: C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                  }}
                >
                  Quick Convert
                </button>
                <button
                  onClick={handleLatexAIConvert}
                  disabled={!latexInput.trim() || converting}
                  style={{
                    padding: '8px 16px', background: C.pur + '22', border: `1px solid ${C.pur}44`,
                    borderRadius: 8, color: C.pur, cursor: converting ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                  }}
                >
                  {converting ? 'Converting...' : 'AI Convert (better)'}
                </button>
              </div>
              <p style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>Quick Convert strips LaTeX commands locally. AI Convert uses LLM for cleaner output.</p>
            </div>
          )}

          {!showLatexPaste && (
            <>
              <textarea
                value={editedResume}
                onChange={(e) => setEditedResume(e.target.value)}
                placeholder={`SUMMARY\nExperienced SRE with 5+ years...\n\nEXPERIENCE\nSenior SRE, Company Name (2022-Present)\n- Led migration to Kubernetes...\n- Reduced incident response time by 40%...\n\nEDUCATION\nB.Tech Computer Science, University (2018)`}
                rows={16}
                style={{ resize: 'vertical', lineHeight: 1.6, fontSize: 13, minHeight: 250 }}
              />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 11, color: C.t3, fontFamily: MONO, margin: 0 }}>
                {editedResume.split(/\s+/).filter(Boolean).length} words
              </p>
              <button onClick={() => setShowLatexPaste(true)} style={{ fontSize: 10, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, textDecoration: 'underline' }}>
                Import LaTeX
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={saveResume}
                disabled={!editedResume.trim()}
                style={{
                  padding: '8px 18px', background: 'transparent', border: `1px solid ${saved ? C.grn + '44' : C.br}`,
                  borderRadius: 8, color: saved ? C.grn : C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                }}
              >
                {saved ? 'Saved!' : 'Save to Profile'}
              </button>
              <button
                onClick={() => setView('preview')}
                disabled={!editedResume.trim()}
                style={{
                  padding: '8px 18px', background: 'transparent', border: `1px solid ${C.br}`,
                  borderRadius: 8, color: C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                }}
              >
                Preview
              </button>
              <button
                onClick={downloadPDF}
                disabled={downloading || !editedResume.trim()}
                style={{
                  padding: '8px 18px', background: C.grn + '22', border: `1px solid ${C.grn}44`,
                  borderRadius: 8, color: C.grn, cursor: downloading ? 'wait' : 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: MONO,
                }}
              >
                {downloading ? 'Creating PDF...' : 'Download PDF'}
              </button>
            </div>
          </div>
            </>
          )}
        </>
      )}

      {/* Suggestions view */}
      {view === 'suggestions' && (
        <>
          {analyzing ? (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              <p style={{ color: C.t3, fontSize: 12, marginTop: 10 }}>
                Comparing your resume to this job description...
              </p>
            </div>
          ) : suggestions ? (
            <>
              <div style={{
                padding: 16, background: C.bg, borderRadius: 10, border: `1px solid ${C.br}`,
                fontSize: 13, lineHeight: 1.8, color: C.t2, whiteSpace: 'pre-wrap',
                maxHeight: 400, overflow: 'auto',
              }}>
                {suggestions}
              </div>
              <button
                onClick={applySuggestions}
                disabled={applying}
                style={{
                  marginTop: 10, width: '100%', padding: '10px', background: C.pur + '22',
                  border: `1px solid ${C.pur}44`, borderRadius: 8, color: C.pur,
                  cursor: applying ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                }}
              >
                {applying ? 'Rewriting resume...' : 'Apply Suggestions to Resume'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.6 }}>
                {editedResume.trim()
                  ? `Click "Get Suggestions" to compare your resume against this ${job?.title || 'role'} at ${job?.company || 'company'}.`
                  : 'Paste your resume in the Edit Resume tab first, then come back for AI suggestions.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* Preview view */}
      {view === 'preview' && (
        <>
          {editedResume.trim() ? (
            <>
              <ResumePreview content={editedResume} profile={{ ...profile, email: pdfEmail || profile?.email }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => setView('edit')}
                  style={{
                    padding: '8px 18px', background: 'transparent', border: `1px solid ${C.br}`,
                    borderRadius: 8, color: C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: MONO,
                  }}
                >
                  Back to Edit
                </button>
                <button
                  onClick={downloadPDF}
                  disabled={downloading}
                  style={{
                    padding: '8px 18px', background: C.grn + '22', border: `1px solid ${C.grn}44`,
                    borderRadius: 8, color: C.grn, cursor: downloading ? 'wait' : 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: MONO,
                  }}
                >
                  {downloading ? 'Creating PDF...' : 'Download PDF'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <p style={{ color: C.t3, fontSize: 13 }}>No resume content to preview. Switch to Edit to paste your resume.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
