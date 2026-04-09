import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import useStore from '@/store';

function MatchCard({ match }) {
  const navigate = useNavigate();
  const job = match.jobs || {};
  const pct = Math.round(match.score * 100);
  const days = job.posted ? Math.max(0, Math.floor((Date.now() - new Date(job.posted)) / 864e5)) : null;

  return (
    <Card
      className="flex cursor-pointer gap-4 p-4 transition-colors hover:bg-accent"
      onClick={() => navigate(`/job/${encodeURIComponent(job.id)}`)}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border font-mono text-lg font-bold ${pct >= 80 ? 'border-green-500/30 bg-green-500/10 text-green-400' : pct >= 60 ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' : 'border-muted bg-muted text-muted-foreground'}`}>
        {pct}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{job.title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{job.company} &middot; {job.location}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs font-normal">{job.source}</Badge>
          {job.remote && <Badge variant="outline" className="text-xs font-normal">Remote</Badge>}
          {days !== null && <span className="text-xs text-muted-foreground">{days === 0 ? 'Today' : `${days}d ago`}</span>}
          {(match.strengths || []).slice(0, 2).map((s, i) => (
            <Badge key={i} variant="secondary" className="text-xs font-normal">{s}</Badge>
          ))}
        </div>
      </div>
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mt-1 shrink-0 text-muted-foreground">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Card>
  );
}

export default function Matches() {
  const { matches, loading, loadMatches, refreshMatches, profile, applications } = useStore();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [hideApplied, setHideApplied] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (matches.length === 0) loadMatches();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await refreshMatches();
    setRefreshing(false);
  };

  const appliedJobIds = useMemo(() => new Set((applications || []).map((a) => a.job_id)), [applications]);

  const { filtered, counts } = useMemo(() => {
    let base = matches;
    if (hideApplied) base = base.filter((m) => !appliedJobIds.has(m.job_id));
    if (search) {
      const q = search.toLowerCase();
      base = base.filter((m) => {
        const j = m.jobs || {};
        return (j.title || '').toLowerCase().includes(q) || (j.company || '').toLowerCase().includes(q) || (j.location || '').toLowerCase().includes(q);
      });
    }
    const strong = base.filter((m) => m.score >= 0.7);
    const stretch = base.filter((m) => m.score >= 0.4 && m.score < 0.7);
    const f = filter === 'strong' ? strong : filter === 'stretch' ? stretch : base;
    return { filtered: f, counts: { all: base.length, strong: strong.length, stretch: stretch.length } };
  }, [matches, filter, hideApplied, appliedJobIds, search]);

  if (loading && matches.length === 0) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-lg font-semibold">{matches.length} matches</h1>
        <div className="flex-1" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, company..." className="h-8 w-48 text-sm" />
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Matching...' : 'Refresh'}
        </Button>
      </div>

      {matches.length > 0 && (
        <div className="mb-5 flex gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'strong', label: 'Strong fit' },
            { id: 'stretch', label: 'Worth a shot' },
          ].map((f) => (
            <Button key={f.id} variant={filter === f.id ? 'secondary' : 'ghost'} size="sm"
              onClick={() => setFilter(f.id)}>
              {f.label} ({counts[f.id]})
            </Button>
          ))}
          <div className="flex-1" />
          <Button variant={hideApplied ? 'secondary' : 'ghost'} size="sm" onClick={() => setHideApplied(!hideApplied)}>
            Hide applied
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <h3 className="text-base font-medium">
            {matches.length === 0 ? 'No matches yet' : 'No matches in this filter'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {matches.length === 0
              ? !profile?.onboarding_complete
                ? 'Set up your profile so we can match you with relevant jobs.'
                : 'Click Refresh to analyze jobs against your profile.'
              : 'Try a different filter.'}
          </p>
          {matches.length === 0 && !profile?.onboarding_complete && (
            <Button variant="outline" className="mt-4" onClick={() => navigate('/onboarding')}>
              Set up profile
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {filtered.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
