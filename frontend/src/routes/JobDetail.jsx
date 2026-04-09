import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { sb } from '@/api';
import useStore from '@/store';
import { FLAGS } from '@/theme';

const CoverLetterEditor = lazy(() => import('@/components/apply/CoverLetterEditor'));
const ResumeEditor = lazy(() => import('@/components/apply/ResumeEditor'));

function decodeHtml(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, addApplication, applications } = useStore();

  const [job, setJob] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

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
    return <div className="flex justify-center p-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>;
  }

  if (!job) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Job not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/matches')}>Back to Matches</Button>
      </div>
    );
  }

  const days = job.posted ? Math.max(0, Math.floor((Date.now() - new Date(job.posted)) / 864e5)) : null;
  const pct = match ? Math.round(match.score * 100) : null;

  return (
    <div className="max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">&larr; Back</Button>

      {/* Job header */}
      <Card className="mb-4 p-5">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted font-mono text-lg font-bold">
            {job.company?.charAt(0) || '?'}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="outline">{job.source}</Badge>
              <span className="text-xs text-muted-foreground">{FLAGS[job.country] || '\u{1F310}'}</span>
              {job.remote && <Badge variant="secondary">Remote</Badge>}
              {days !== null && <span className="text-xs text-muted-foreground">{days === 0 ? 'Today' : `${days}d ago`}</span>}
            </div>
            <h1 className="text-xl font-bold">{job.title}</h1>
            <p className="text-muted-foreground">{job.company} &middot; {job.location}</p>
            {job.salary && job.salary !== '\u2014' && <p className="mt-1 font-mono text-green-400">{job.salary}</p>}
          </div>
        </div>

        {/* Match score */}
        {match && (
          <div className="mt-4 rounded-lg border bg-background p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className={`font-mono text-2xl font-bold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                {pct}%
              </span>
              <span className="text-sm text-muted-foreground">Match Score</span>
              <Badge variant="outline" className="ml-auto">
                {match.verdict === 'apply' ? 'Strong Fit' : match.verdict === 'stretch' ? 'Worth a Shot' : 'Stretch'}
              </Badge>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-muted-foreground'}`}
                style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(match.strengths || []).map((s, i) => <Badge key={i} variant="secondary" className="text-xs">+ {s}</Badge>)}
              {(match.gaps || []).map((g, i) => <Badge key={i} variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">- {g}</Badge>)}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild className="flex-1"><a href={job.url} target="_blank" rel="noreferrer">Apply on {job.source}</a></Button>
          {!isApplied ? (
            <Button variant="outline" onClick={markApplied}>Mark as Applied</Button>
          ) : (
            <Badge variant="secondary" className="px-4 py-2 text-sm">Applied</Badge>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Job Details</TabsTrigger>
          <TabsTrigger value="cover">Cover Letter</TabsTrigger>
          <TabsTrigger value="resume">Tailor Resume</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card className="p-5 text-sm leading-relaxed text-muted-foreground max-h-[600px] overflow-auto">
            {(() => {
              const desc = job.description || '';
              const decoded = desc.includes('&') ? decodeHtml(desc) : desc;
              const isHtml = /<[a-z][\s\S]*>/i.test(decoded);
              return isHtml ? (
                <div className="prose prose-invert prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_a]:text-blue-400 [&_a]:underline [&_table]:w-full"
                  dangerouslySetInnerHTML={{ __html: decoded }} />
              ) : (
                <div className="whitespace-pre-wrap">{decoded || 'No description available.'}</div>
              );
            })()}
          </Card>
        </TabsContent>
        <TabsContent value="cover">
          <Card className="p-5">
            <Suspense fallback={<div className="flex justify-center p-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
              <CoverLetterEditor job={job} />
            </Suspense>
          </Card>
        </TabsContent>
        <TabsContent value="resume">
          <Card className="p-5">
            <Suspense fallback={<div className="flex justify-center p-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
              <ResumeEditor job={job} />
            </Suspense>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
