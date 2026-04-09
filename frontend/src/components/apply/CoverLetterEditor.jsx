import { useState } from 'react';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { C, MONO } from '../../theme';
import { db } from '../../api';
import useStore from '../../store';

// PDF styles
const pdfStyles = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 11, lineHeight: 1.6, color: '#1a1a1a' },
  header: { marginBottom: 20 },
  name: { fontSize: 18, fontWeight: 'bold', marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 10, color: '#666', marginBottom: 2 },
  date: { fontSize: 10, color: '#666', marginTop: 16, marginBottom: 16 },
  company: { fontSize: 11, fontWeight: 'bold', marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  body: { fontSize: 11, lineHeight: 1.7, textAlign: 'justify' },
  paragraph: { marginBottom: 10 },
  closing: { marginTop: 20 },
});

function CoverLetterPDF({ content, profile, job }) {
  const paragraphs = content.split('\n').filter((p) => p.trim());
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.name}>{profile?.name || 'Applicant'}</Text>
          <Text style={pdfStyles.contact}>{profile?.email || ''}</Text>
          {profile?.role && <Text style={pdfStyles.contact}>{profile.role}</Text>}
        </View>
        <Text style={pdfStyles.date}>{today}</Text>
        <View style={{ marginBottom: 16 }}>
          <Text style={pdfStyles.company}>{job?.company || 'Hiring Manager'}</Text>
          <Text style={pdfStyles.contact}>Re: {job?.title || 'Open Position'}</Text>
        </View>
        <View style={pdfStyles.body}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={pdfStyles.paragraph}>{p.trim()}</Text>
          ))}
        </View>
        <View style={pdfStyles.closing}>
          <Text>Best regards,</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold', marginTop: 4 }}>{profile?.name || 'Applicant'}</Text>
        </View>
      </Page>
    </Document>
  );
}

export default function CoverLetterEditor({ job }) {
  const { profile } = useStore();
  const [content, setContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfEmail, setPdfEmail] = useState(profile?.email || '');

  const generate = async () => {
    setGenerating(true);
    const res = await db.callAI({
      type: 'cover',
      job: {
        title: job.title,
        company: job.company,
        desc: (job.description || '').slice(0, 1200),
      },
      profile: {
        ...profile,
        resume_text: profile?.resume_text || '',
      },
    });
    setContent(res?.text || 'Could not generate cover letter. Please try again.');
    setGenerating(false);
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const blob = await pdf(
        <CoverLetterPDF content={content} profile={{ ...profile, email: pdfEmail || profile?.email }} job={job} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cover_Letter_${(job.company || 'company').replace(/\s+/g, '_')}_${(job.title || 'role').replace(/\s+/g, '_')}.pdf`;
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
        <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.pur }}>COVER LETTER</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={generate}
            disabled={generating}
            style={{
              padding: '6px 16px', background: 'transparent', border: `1px solid ${C.pur}55`,
              borderRadius: 8, color: C.pur, cursor: generating ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: MONO,
            }}
          >
            {generating ? 'Generating...' : content ? 'Regenerate' : 'Generate'}
          </button>
          {content && (
            <button
              onClick={downloadPDF}
              disabled={downloading}
              style={{
                padding: '6px 16px', background: C.grn + '22', border: `1px solid ${C.grn}44`,
                borderRadius: 8, color: C.grn, cursor: downloading ? 'wait' : 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: MONO,
              }}
            >
              {downloading ? 'Creating PDF...' : 'Download PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Email for PDF */}
      {content && !generating && (
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
      )}

      {/* Loading state */}
      {generating && (
        <div style={{ textAlign: 'center', padding: 30 }}>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          <p style={{ color: C.t3, fontSize: 12, marginTop: 10 }}>
            Crafting a tailored cover letter...
          </p>
        </div>
      )}

      {/* Editor */}
      {!generating && (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Click Generate to create a tailored cover letter, or write your own..."
            rows={14}
            style={{
              resize: 'vertical', lineHeight: 1.7, fontSize: 14,
              minHeight: 200,
            }}
          />
          {content && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <p style={{ fontSize: 11, color: C.t3, fontFamily: MONO, margin: 0 }}>
                {content.split(/\s+/).length} words &middot; Edit freely above
              </p>
              <button
                onClick={() => setContent('')}
                style={{
                  padding: '4px 10px', background: 'transparent', border: `1px solid ${C.br}`,
                  borderRadius: 6, color: C.t3, cursor: 'pointer', fontSize: 11,
                }}
              >
                Clear
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
