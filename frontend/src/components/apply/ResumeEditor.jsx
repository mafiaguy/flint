import { useState, useEffect, useCallback } from 'react';
import { pdf, Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';
import { C, MONO } from '../../theme';
import { db } from '../../api';
import useStore from '../../store';

// ── Detect garbage / LaTeX ──
function isGarbageText(text) {
  if (!text || text.length < 20) return true;
  return /^%PDF|obj\s*<<|\/Filter\s*\/FlateDecode|endobj|xref|startxref/.test(text);
}
function isLatex(text) {
  return text && /\\(section|begin|documentclass|textbf|item|href|resumeSubheading)\b/.test(text);
}

// ── LaTeX → structured AST ──
// Returns array of nodes: { type, ...data }
function parseLatexToAST(src) {
  let t = src;
  // Strip comments
  t = t.replace(/%.*$/gm, '');
  // Strip preamble
  const docStart = t.indexOf('\\begin{document}');
  if (docStart !== -1) t = t.slice(docStart + '\\begin{document}'.length);
  t = t.replace(/\\end\{document\}[\s\S]*/, '');

  const nodes = [];

  // Expand custom commands inline before parsing
  // \resumeSubheading{title}{date}{subtitle}{location}
  t = t.replace(/\\resumeSubheading\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}/g,
    '<SUBHEADING>$1|$2|$3|$4</SUBHEADING>');
  // \resumeSubheadingContinue{title}{}
  t = t.replace(/\\resumeSubheadingContinue\s*\{([^}]*)\}\s*\{[^}]*\}/g,
    '<SUBHEADING_CONT>$1</SUBHEADING_CONT>');
  // \resumeProjectHeading{content}{date}
  t = t.replace(/\\resumeProjectHeading\s*\{([^}]*)\}\s*\{([^}]*)\}/g,
    '<PROJECT>$1|$2</PROJECT>');
  // \resumeItem{text}
  t = t.replace(/\\resumeItem\s*\{/g, '<RITEM>');
  // \resumeSubItem
  t = t.replace(/\\resumeSubItem\s*\{/g, '<RITEM>');

  // Handle nested braces for RITEM — find matching closing brace
  let result = '';
  let i = 0;
  while (i < t.length) {
    const ritemIdx = t.indexOf('<RITEM>', i);
    if (ritemIdx === -1) {
      result += t.slice(i);
      break;
    }
    result += t.slice(i, ritemIdx);
    // Find matching }
    let depth = 0;
    let j = ritemIdx + '<RITEM>'.length;
    let start = j;
    // The opening { was already consumed by the regex, so we start at depth 0
    // and look for the unmatched }
    while (j < t.length) {
      if (t[j] === '{') depth++;
      else if (t[j] === '}') {
        if (depth === 0) { break; }
        depth--;
      }
      j++;
    }
    const content = t.slice(start, j);
    result += '<ITEM_NODE>' + content + '</ITEM_NODE>';
    i = j + 1;
  }
  t = result;

  // Sections
  t = t.replace(/\\section\*?\{([^}]*)\}/g, '<SECTION>$1</SECTION>');

  // Strip remaining environments
  t = t.replace(/\\(resumeSubHeadingListStart|resumeSubHeadingListEnd|resumeItemListStart|resumeItemListEnd)\b/g, '');
  t = t.replace(/\\begin\{itemize\}(\[[^\]]*\])?/g, '');
  t = t.replace(/\\end\{itemize\}/g, '');
  t = t.replace(/\\begin\{center\}/g, '<CENTER>');
  t = t.replace(/\\end\{center\}/g, '</CENTER>');
  t = t.replace(/\\begin\{tabular[x*]*\}[^}]*\}/g, '');
  t = t.replace(/\\end\{tabular[x*]*\}/g, '');
  t = t.replace(/\\begin\{[^}]*\}(\[[^\]]*\])?/g, '');
  t = t.replace(/\\end\{[^}]*\}/g, '');

  // \item
  t = t.replace(/\\item\s*/g, '<ITEM_NODE>');

  // Now parse line by line
  const lines = t.split('\n');
  let inCenter = false;
  let centerContent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes('<CENTER>')) { inCenter = true; centerContent = ''; continue; }
    if (trimmed.includes('</CENTER>')) {
      inCenter = false;
      nodes.push({ type: 'header', content: cleanInline(centerContent) });
      continue;
    }
    if (inCenter) { centerContent += ' ' + trimmed; continue; }

    // Section
    const secM = trimmed.match(/<SECTION>(.*?)<\/SECTION>/);
    if (secM) { nodes.push({ type: 'section', title: cleanInline(secM[1]) }); continue; }

    // Subheading
    const subM = trimmed.match(/<SUBHEADING>(.*?)<\/SUBHEADING>/);
    if (subM) {
      const [title, date, subtitle, location] = subM[1].split('|').map(s => cleanInline(s.trim()));
      nodes.push({ type: 'subheading', title, date, subtitle, location });
      continue;
    }

    // Subheading continue
    const contM = trimmed.match(/<SUBHEADING_CONT>(.*?)<\/SUBHEADING_CONT>/);
    if (contM) { nodes.push({ type: 'subheading_cont', title: cleanInline(contM[1]) }); continue; }

    // Project
    const projM = trimmed.match(/<PROJECT>(.*?)<\/PROJECT>/);
    if (projM) {
      const [content, date] = projM[1].split('|').map(s => cleanInline(s.trim()));
      nodes.push({ type: 'project', content, date }); continue;
    }

    // Item
    if (trimmed.includes('<ITEM_NODE>')) {
      const parts = trimmed.split('<ITEM_NODE>').filter(Boolean);
      for (const part of parts) {
        const cleaned = cleanInline(part.replace('</ITEM_NODE>', '').trim());
        if (cleaned) nodes.push({ type: 'item', content: cleaned });
      }
      continue;
    }

    // Plain text (skills block, etc.)
    const cleaned = cleanInline(trimmed);
    if (cleaned && cleaned.length > 2) {
      nodes.push({ type: 'text', content: cleaned });
    }
  }

  return nodes;
}

function cleanInline(s) {
  let t = s;
  t = t.replace(/\\textbf\{([^}]*)\}/g, '<b>$1</b>');
  t = t.replace(/\\textit\{([^}]*)\}/g, '<i>$1</i>');
  t = t.replace(/\\emph\{([^}]*)\}/g, '<i>$1</i>');
  t = t.replace(/\\underline\{([^}]*)\}/g, '<u>$1</u>');
  t = t.replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '<a href="$1">$2</a>');
  t = t.replace(/\\scshape\s*/g, '');
  t = t.replace(/\\Huge\s*/g, '');
  t = t.replace(/\\LARGE\s*/g, '');
  t = t.replace(/\\Large\s*/g, '');
  t = t.replace(/\\large\s*/g, '');
  t = t.replace(/\\small\s*/g, '');
  t = t.replace(/\\tiny\s*/g, '');
  t = t.replace(/\\normalsize\s*/g, '');
  t = t.replace(/\\fa\w+\\/g, '');
  t = t.replace(/\\fa\w+\s*/g, '');
  t = t.replace(/\$\\rightarrow\$/g, '\u2192');
  t = t.replace(/\$\|?\$/g, '|');
  t = t.replace(/\$[^$]*\$/g, '');
  t = t.replace(/\\textasciitilde/g, '~');
  t = t.replace(/\\&/g, '&');
  t = t.replace(/---/g, '\u2014');
  t = t.replace(/--/g, '\u2013');
  t = t.replace(/\\%/g, '%');
  t = t.replace(/\\#/g, '#');
  t = t.replace(/\\\$/g, '$');
  t = t.replace(/~/g, '\u00a0');
  t = t.replace(/\\\\/g, ' ');
  t = t.replace(/\\hfill/g, '');
  t = t.replace(/\\vspace\{[^}]*\}/g, '');
  t = t.replace(/\\hspace\{[^}]*\}/g, '');
  t = t.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1');
  t = t.replace(/\\[a-zA-Z]+\*?/g, '');
  t = t.replace(/[{}]/g, '');
  t = t.replace(/\s+/g, ' ');
  return t.trim();
}

// ── HTML Preview from AST ──
function LatexPreview({ nodes, profile, email }) {
  const nameFromHeader = nodes.find(n => n.type === 'header');
  const headerParts = nameFromHeader?.content?.split('|').map(s => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean) || [];
  // First part is usually name, rest is contact
  const displayName = profile?.name || headerParts[0] || 'Your Name';
  const contactLine = headerParts.length > 1 ? headerParts.slice(0, headerParts.length).join('  \u00b7  ') : '';

  return (
    <div style={{
      background: '#fff', color: '#1a1a1a', borderRadius: 4,
      padding: '36px 44px', maxHeight: 550, overflow: 'auto',
      fontFamily: '"Times New Roman", Georgia, serif', fontSize: 11, lineHeight: 1.45,
      border: `1px solid ${C.br}`, boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{displayName}</div>
        {contactLine && (
          <div style={{ fontSize: 9.5, color: '#444', marginTop: 3 }}
            dangerouslySetInnerHTML={{ __html: contactLine.replace(/<a href="([^"]*)">(.*?)<\/a>/g, '<a href="$1" style="color:#2563eb">$2</a>') }} />
        )}
      </div>

      {/* Body */}
      {nodes.filter(n => n.type !== 'header').map((node, i) => {
        switch (node.type) {
          case 'section':
            return (
              <div key={i} style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, borderBottom: '1px solid #333', paddingBottom: 1, marginTop: 12, marginBottom: 5, fontVariant: 'small-caps' }}>
                {node.title.replace(/<[^>]*>/g, '')}
              </div>
            );
          case 'subheading':
            return (
              <div key={i} style={{ marginTop: 6, marginBottom: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 11 }} dangerouslySetInnerHTML={{ __html: node.title }} />
                  <span style={{ fontSize: 10.5, color: '#333' }}>{node.date}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontStyle: 'italic', fontSize: 10.5 }} dangerouslySetInnerHTML={{ __html: node.subtitle }} />
                  <span style={{ fontStyle: 'italic', fontSize: 10.5, color: '#555' }}>{node.location}</span>
                </div>
              </div>
            );
          case 'subheading_cont':
            return (
              <div key={i} style={{ fontWeight: 700, fontStyle: 'italic', fontSize: 10.5, marginTop: 6, marginBottom: 2 }}
                dangerouslySetInnerHTML={{ __html: node.title }} />
            );
          case 'project':
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 10.5 }} dangerouslySetInnerHTML={{ __html: node.content }} />
                <span style={{ fontSize: 10.5, color: '#555' }}>{node.date}</span>
              </div>
            );
          case 'item':
            return (
              <div key={i} style={{ paddingLeft: 18, textIndent: -12, marginBottom: 1.5, fontSize: 10.5 }}>
                <span style={{ marginRight: 6 }}>{'\u2022'}</span>
                <span dangerouslySetInnerHTML={{ __html: node.content }} />
              </div>
            );
          case 'text':
            return (
              <div key={i} style={{ fontSize: 10.5, marginBottom: 3 }}
                dangerouslySetInnerHTML={{ __html: node.content.replace(/\n/g, '<br/>') }} />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// ── PDF from AST ──
const ps = StyleSheet.create({
  page: { padding: '36 44', fontFamily: 'Times-Roman', fontSize: 10.5, color: '#1a1a1a', lineHeight: 1.4 },
  headerName: { fontSize: 22, fontWeight: 'bold', fontFamily: 'Times-Bold', textAlign: 'center' },
  headerContact: { fontSize: 9.5, color: '#444', textAlign: 'center', marginTop: 3 },
  section: { fontSize: 11.5, fontWeight: 'bold', fontFamily: 'Times-Bold', textTransform: 'uppercase', letterSpacing: 1.2, borderBottomWidth: 0.75, borderBottomColor: '#333', paddingBottom: 1, marginTop: 10, marginBottom: 4 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  subTitle: { fontSize: 10.5, fontWeight: 'bold', fontFamily: 'Times-Bold' },
  subDate: { fontSize: 10.5, color: '#333' },
  subSubtitle: { fontSize: 10.5, fontStyle: 'italic', fontFamily: 'Times-Italic' },
  subLocation: { fontSize: 10.5, fontStyle: 'italic', fontFamily: 'Times-Italic', color: '#555' },
  contTitle: { fontSize: 10.5, fontWeight: 'bold', fontFamily: 'Times-BoldItalic', fontStyle: 'italic', marginTop: 5, marginBottom: 2 },
  item: { fontSize: 10.5, paddingLeft: 18, marginBottom: 1.5, lineHeight: 1.4 },
  text: { fontSize: 10.5, marginBottom: 3 },
  projectRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, marginBottom: 2 },
});

function strip(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
}

function LatexResumePDF({ nodes, profile, email }) {
  const nameNode = nodes.find(n => n.type === 'header');
  const headerParts = nameNode?.content?.split('|').map(s => strip(s).trim()).filter(Boolean) || [];
  const displayName = profile?.name || headerParts[0] || 'Your Name';
  const contactLine = headerParts.length > 1 ? headerParts.join('  \u00b7  ') : (email || profile?.email || '');

  return (
    <Document>
      <Page size="LETTER" style={ps.page}>
        <Text style={ps.headerName}>{displayName}</Text>
        <Text style={ps.headerContact}>{contactLine}</Text>
        {nodes.filter(n => n.type !== 'header').map((node, i) => {
          if (node.type === 'section') return <Text key={i} style={ps.section}>{strip(node.title || '')}</Text>;
          if (node.type === 'subheading') return (
            <View key={i} style={{ marginTop: 5, marginBottom: 1 }}>
              <View style={ps.subRow}>
                <Text style={ps.subTitle}>{strip(node.title || '')}</Text>
                <Text style={ps.subDate}>{strip(node.date || '')}</Text>
              </View>
              <View style={ps.subRow}>
                <Text style={ps.subSubtitle}>{strip(node.subtitle || '')}</Text>
                <Text style={ps.subLocation}>{strip(node.location || '')}</Text>
              </View>
            </View>
          );
          if (node.type === 'subheading_cont') return <Text key={i} style={ps.contTitle}>{strip(node.title || '')}</Text>;
          if (node.type === 'project') return (
            <View key={i} style={ps.projectRow}>
              <Text style={{ fontSize: 10.5 }}>{strip(node.content || '')}</Text>
              <Text style={{ fontSize: 10.5, color: '#555' }}>{strip(node.date || '')}</Text>
            </View>
          );
          if (node.type === 'item') return <Text key={i} style={ps.item}>{'\u2022  '}{strip(node.content || '')}</Text>;
          if (node.type === 'text') return <Text key={i} style={ps.text}>{strip(node.content || '')}</Text>;
          return <Text key={i}>{' '}</Text>;
        })}
      </Page>
    </Document>
  );
}

// ── Diff view — line-by-line comparison ──
function DiffView({ original, modified }) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  // Simple LCS-based diff
  const diff = computeDiff(origLines, modLines);

  return (
    <div style={{
      background: '#0d1117', border: `1px solid ${C.br}`, borderRadius: 8,
      maxHeight: 500, overflow: 'auto', fontSize: 11.5, fontFamily: MONO, lineHeight: 1.5,
    }}>
      {diff.map((line, i) => {
        const bg = line.type === 'add' ? '#1a3a1a' : line.type === 'remove' ? '#3a1a1a' : 'transparent';
        const color = line.type === 'add' ? '#4ade80' : line.type === 'remove' ? '#f87171' : '#8b949e';
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        return (
          <div key={i} style={{ padding: '1px 12px', background: bg, borderLeft: `3px solid ${line.type === 'add' ? '#22c55e' : line.type === 'remove' ? '#ef4444' : 'transparent'}` }}>
            <span style={{ color: '#555', userSelect: 'none', display: 'inline-block', width: 20 }}>{prefix}</span>
            <span style={{ color, whiteSpace: 'pre-wrap' }}>{line.text}</span>
          </div>
        );
      })}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.br}`, color: C.t3, fontSize: 10 }}>
        {diff.filter(l => l.type === 'add').length} additions, {diff.filter(l => l.type === 'remove').length} removals
      </div>
    </div>
  );
}

function computeDiff(origLines, modLines) {
  const result = [];
  const origSet = new Set(origLines.map((l, i) => `${i}:${l.trim()}`));
  const modSet = new Set(modLines.map((l, i) => `${i}:${l.trim()}`));

  // Build a map of content → line indices
  const origMap = new Map();
  origLines.forEach((l, i) => {
    const key = l.trim();
    if (!origMap.has(key)) origMap.set(key, []);
    origMap.get(key).push(i);
  });
  const modMap = new Map();
  modLines.forEach((l, i) => {
    const key = l.trim();
    if (!modMap.has(key)) modMap.set(key, []);
    modMap.get(key).push(i);
  });

  // Mark unchanged lines (same content, consumed in order)
  const origUsed = new Set();
  const modUsed = new Set();
  const unchanged = new Map(); // modIdx → origIdx

  for (let mi = 0; mi < modLines.length; mi++) {
    const key = modLines[mi].trim();
    const origIdxs = origMap.get(key);
    if (origIdxs) {
      for (const oi of origIdxs) {
        if (!origUsed.has(oi)) {
          origUsed.add(oi);
          modUsed.add(mi);
          unchanged.set(mi, oi);
          break;
        }
      }
    }
  }

  // Now interleave: show removed lines (in orig not matched), unchanged, added (in mod not matched)
  let oi = 0, mi = 0;
  while (oi < origLines.length || mi < modLines.length) {
    // Output removed lines from orig
    while (oi < origLines.length && !origUsed.has(oi)) {
      if (origLines[oi].trim()) result.push({ type: 'remove', text: origLines[oi] });
      oi++;
    }
    // Output added lines from mod
    while (mi < modLines.length && !modUsed.has(mi)) {
      if (modLines[mi].trim()) result.push({ type: 'add', text: modLines[mi] });
      mi++;
    }
    // Output matched line
    if (mi < modLines.length && unchanged.has(mi)) {
      result.push({ type: 'same', text: modLines[mi] });
      oi = unchanged.get(mi) + 1;
      mi++;
    } else {
      // Safety: advance
      if (mi < modLines.length) { result.push({ type: 'add', text: modLines[mi] }); mi++; }
      if (oi < origLines.length) { result.push({ type: 'remove', text: origLines[oi] }); oi++; }
    }
  }

  return result;
}

// ── Main component ──
export default function ResumeEditor({ job }) {
  const { profile, setProfile } = useStore();
  const [latexSrc, setLatexSrc] = useState('');
  const [originalLatex, setOriginalLatex] = useState('');
  const [nodes, setNodes] = useState([]);
  const [suggestions, setSuggestions] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfEmail, setPdfEmail] = useState(profile?.email || '');
  const [view, setView] = useState('editor');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const rt = profile?.resume_text || '';
    if (isLatex(rt)) {
      setLatexSrc(rt);
      setOriginalLatex(rt);
      setNodes(parseLatexToAST(rt));
    }
  }, []);

  const updateLatex = useCallback((src) => {
    setLatexSrc(src);
    if (isLatex(src)) setNodes(parseLatexToAST(src));
  }, []);

  const generateLatex = async () => {
    setGenerating(true);
    const resumeText = profile?.resume_text || '';
    const src = isGarbageText(resumeText)
      ? `Name: ${profile?.name}\nRole: ${profile?.role}\nExperience: ${profile?.experience} years\nSkills: ${profile?.skills}`
      : resumeText;
    const res = await db.callAI({
      type: 'chat',
      messages: [{
        role: 'user',
        content: `Convert this resume into professional LaTeX code. Use the Jake's Resume template style with \\resumeSubheading, \\resumeItem, \\section, \\textbf, \\begin{itemize}. Include \\documentclass through \\end{document}. Output ONLY the LaTeX code, no markdown fences.

RESUME:
${src.slice(0, 6000)}`,
      }],
      profile,
    });
    if (res?.text) {
      const latex = res.text.replace(/^```\w*\n?/, '').replace(/```\s*$/, '').trim();
      updateLatex(latex);
      setView('preview');
    }
    setGenerating(false);
  };

  const saveToProfile = async () => {
    await db.saveProfile({ resume_text: latexSrc });
    setProfile({ ...profile, resume_text: latexSrc });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const analyze = async () => {
    if (!latexSrc.trim()) { setSuggestions('Add your LaTeX resume first.'); return; }
    setAnalyzing(true);
    // Send plain text version for better AI analysis
    const plainText = nodes.map(n => {
      if (n.type === 'section') return `\n${n.title.replace(/<[^>]*>/g, '').toUpperCase()}`;
      if (n.type === 'subheading') return `${strip(n.title)} - ${strip(n.subtitle)} (${strip(n.date)})`;
      if (n.type === 'subheading_cont') return strip(n.title);
      if (n.type === 'item') return `- ${strip(n.content)}`;
      if (n.type === 'text') return strip(n.content);
      return '';
    }).join('\n');
    const res = await db.callAI({
      type: 'tailor-resume',
      job: { title: job.title, company: job.company, desc: (job.description || '').slice(0, 1200) },
      profile: { ...profile, resume_text: plainText },
    });
    setSuggestions(res?.text || 'Could not generate suggestions.');
    setAnalyzing(false);
  };

  const applySuggestions = async () => {
    if (!originalLatex) setOriginalLatex(latexSrc);
    setApplying(true);
    const res = await db.callAI({
      type: 'chat',
      messages: [{
        role: 'user',
        content: `You are a LaTeX resume expert. Rewrite this LaTeX resume by applying the suggestions below. Keep the same facts and structure. Rephrase and emphasize what's relevant to the target job. Do NOT invent experience.

Output ONLY the complete LaTeX (\\documentclass through \\end{document}). No markdown fences.

CURRENT LATEX:
${latexSrc.slice(0, 7000)}

SUGGESTIONS:
${suggestions}

TARGET: ${job?.title} at ${job?.company}`,
      }],
      profile,
    });
    if (res?.text) {
      const latex = res.text.replace(/^```\w*\n?/, '').replace(/```\s*$/, '').trim();
      updateLatex(latex);
      setView('preview');
    }
    setApplying(false);
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const blob = await pdf(
        <LatexResumePDF nodes={nodes} profile={profile} email={pdfEmail} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resume_${(job.company || 'company').replace(/\s+/g, '_')}_${(job.title || 'role').replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF generation error:', e);
    }
    setDownloading(false);
  };

  const hasLatex = latexSrc.trim().length > 0;

  const btnStyle = (active, color = C.pur) => ({
    padding: '6px 16px', background: active ? color + '22' : 'transparent',
    border: `1px solid ${active ? color + '44' : C.br}`,
    borderRadius: 8, color: active ? color : C.t3, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: MONO,
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.pur }}>RESUME TAILOR</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {!hasLatex && (
            <button onClick={generateLatex} disabled={generating} style={btnStyle(true)}>
              {generating ? 'Generating...' : 'Generate LaTeX from Profile'}
            </button>
          )}
          {hasLatex && (
            <button onClick={analyze} disabled={analyzing} style={btnStyle(true)}>
              {analyzing ? 'Analyzing...' : suggestions ? 'Re-analyze' : 'Get Suggestions'}
            </button>
          )}
        </div>
      </div>

      {/* Email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: C.t3, fontFamily: MONO, whiteSpace: 'nowrap' }}>EMAIL IN PDF</label>
        <input type="email" value={pdfEmail} onChange={(e) => setPdfEmail(e.target.value)}
          placeholder={profile?.email || 'your@email.com'}
          style={{ flex: 1, padding: '5px 10px', fontSize: 13, background: 'transparent', border: `1px solid ${C.br}`, borderRadius: 6, color: C.t1 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.br}` }}>
        {[
          { id: 'editor', label: 'LaTeX Editor' },
          { id: 'preview', label: 'Rendered Preview' },
          { id: 'suggestions', label: 'AI Suggestions' },
          { id: 'changes', label: 'Changes' },
        ].map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            flex: 1, padding: '8px', border: 'none', fontSize: 11, fontWeight: 700,
            fontFamily: MONO, cursor: 'pointer',
            background: view === t.id ? C.pur + '22' : C.c2,
            color: view === t.id ? C.pur : C.t3,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LaTeX Editor ── */}
      {view === 'editor' && (
        <>
          {!hasLatex && !generating && (
            <div style={{ padding: 16, marginBottom: 10, background: C.acc + '15', border: `1px solid ${C.acc}33`, borderRadius: 8, fontSize: 12, color: C.acc, lineHeight: 1.6, textAlign: 'center' }}>
              Paste your LaTeX resume code below, or click <strong>"Generate LaTeX from Profile"</strong> above.
            </div>
          )}
          {generating ? (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" style={{ margin: '0 auto' }} />
              <p style={{ color: C.t3, fontSize: 12, marginTop: 10 }}>Generating LaTeX resume...</p>
            </div>
          ) : (
            <>
              <textarea value={latexSrc} onChange={(e) => updateLatex(e.target.value)}
                placeholder={'\\documentclass[11pt]{article}\n...\n\\begin{document}\n...\n\\end{document}'}
                rows={20} style={{ resize: 'vertical', lineHeight: 1.35, fontSize: 11.5, minHeight: 300, fontFamily: MONO }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <p style={{ fontSize: 11, color: C.t3, fontFamily: MONO, margin: 0 }}>{latexSrc.length} chars</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveToProfile} disabled={!hasLatex} style={btnStyle(saved, C.grn)}>
                    {saved ? 'Saved!' : 'Save to Profile'}
                  </button>
                  <button onClick={() => { if (hasLatex) { setNodes(parseLatexToAST(latexSrc)); setView('preview'); } }}
                    disabled={!hasLatex} style={btnStyle(hasLatex, C.grn)}>
                    Render Preview
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Rendered Preview ── */}
      {view === 'preview' && (
        <>
          {nodes.length > 0 ? (
            <>
              <LatexPreview nodes={nodes} profile={profile} email={pdfEmail} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <button onClick={() => setView('editor')} style={btnStyle(false)}>Back to Editor</button>
                <button onClick={downloadPDF} disabled={downloading} style={btnStyle(true, C.grn)}>
                  {downloading ? 'Creating PDF...' : 'Download as PDF'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <p style={{ color: C.t3, fontSize: 13 }}>No LaTeX to render.</p>
              <button onClick={generateLatex} disabled={generating} style={{ ...btnStyle(true), marginTop: 12 }}>
                {generating ? 'Generating...' : 'Generate LaTeX from Profile'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── AI Suggestions ── */}
      {view === 'suggestions' && (
        <>
          {analyzing ? (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" style={{ margin: '0 auto' }} />
              <p style={{ color: C.t3, fontSize: 12, marginTop: 10 }}>Comparing your resume to this job description...</p>
            </div>
          ) : suggestions ? (
            <>
              <div style={{ padding: 16, background: C.bg, borderRadius: 10, border: `1px solid ${C.br}`, fontSize: 13, lineHeight: 1.8, color: C.t2, whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>
                {suggestions}
              </div>
              <button onClick={applySuggestions} disabled={applying} style={{ ...btnStyle(true), marginTop: 10, width: '100%', padding: '10px' }}>
                {applying ? 'Rewriting LaTeX...' : 'Apply Suggestions to LaTeX'}
              </button>
              <p style={{ fontSize: 10, color: C.t3, marginTop: 6, textAlign: 'center' }}>
                AI will rewrite your LaTeX with suggestions applied, then show the rendered preview.
              </p>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.6 }}>
                {hasLatex
                  ? `Click "Get Suggestions" to compare your resume against ${job?.title || 'this role'} at ${job?.company || 'this company'}.`
                  : 'Add your LaTeX resume first, then come back for AI suggestions.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Changes Diff ── */}
      {view === 'changes' && (
        <>
          {originalLatex && originalLatex !== latexSrc ? (
            <DiffView original={originalLatex} modified={latexSrc} />
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <p style={{ color: C.t3, fontSize: 13 }}>
                {!originalLatex
                  ? 'No original resume saved yet. Paste your LaTeX, save to profile, then apply suggestions to see changes.'
                  : 'No changes yet. Apply AI suggestions to see what was modified.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
