import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { C, MONO, PIPELINE_STAGES } from '../theme';
import { db } from '../api';
import useStore from '../store';
import Spinner from '../components/ui/Spinner';

// ── Draggable application card ──
function AppCard({ app, isDragging, onUpdateNotes, onInterviewPrep }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(app.notes || '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepContent, setPrepContent] = useState(app.prep_content || '');

  const stage = PIPELINE_STAGES.find((s) => s.id === app.status) || PIPELINE_STAGES[0];
  const daysSince = app.stage_updated_at
    ? Math.floor((Date.now() - new Date(app.stage_updated_at)) / 864e5)
    : app.applied_at
    ? Math.floor((Date.now() - new Date(app.applied_at)) / 864e5)
    : 0;
  const isStale = daysSince >= 7 && ['applied', 'first_call'].includes(app.status);

  const handlePrep = async () => {
    setPrepLoading(true);
    const res = await onInterviewPrep(app);
    if (res) setPrepContent(res);
    setPrepLoading(false);
  };

  return (
    <div
      style={{
        background: C.c1,
        border: `1px solid ${isStale ? C.acc + '44' : C.br}`,
        borderRadius: 12,
        padding: 14,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        animation: isDragging ? 'none' : 'up .25s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.t1, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {app.title}
          </p>
          <p style={{ fontSize: 12, color: C.t2, margin: 0 }}>{app.company}</p>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
          {isStale && (
            <span style={{ fontSize: 9, fontFamily: MONO, color: C.acc, background: C.acc + '15', padding: '2px 6px', borderRadius: 99 }}>
              {daysSince}d
            </span>
          )}
          {app.url && (
            <a href={app.url} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: C.blu, padding: '2px 6px' }}
              onClick={(e) => e.stopPropagation()}>
              Open
            </a>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
          {new Date(app.applied_at).toLocaleDateString()}
        </span>
        {app.source && (
          <span style={{ fontSize: 9, fontFamily: MONO, color: C.t3, background: C.c2, padding: '1px 6px', borderRadius: 4 }}>
            {app.source}
          </span>
        )}
        {app.interview_date && (
          <span style={{ fontSize: 9, fontFamily: MONO, color: C.pur, background: C.pur + '15', padding: '1px 6px', borderRadius: 4 }}>
            Interview: {new Date(app.interview_date).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Expand toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        style={{
          marginTop: 8, padding: '4px 10px', background: 'transparent',
          border: `1px solid ${C.br}`, borderRadius: 6, color: C.t3,
          cursor: 'pointer', fontSize: 10, fontFamily: MONO, width: '100%',
        }}
      >
        {expanded ? 'Close' : 'Details'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.br}`, paddingTop: 10 }} onClick={(e) => e.stopPropagation()}>
          {/* Notes */}
          <label style={{ fontSize: 9, fontFamily: MONO, color: C.t3, letterSpacing: 1, display: 'block', marginBottom: 4 }}>NOTES</label>
          {editingNotes ? (
            <>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Notes..." style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.5, marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { onUpdateNotes(app.id, notes); setEditingNotes(false); }}
                  style={{ padding: '4px 12px', background: C.grad, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Save
                </button>
                <button onClick={() => { setNotes(app.notes || ''); setEditingNotes(false); }}
                  style={{ padding: '4px 12px', background: 'transparent', color: C.t3, border: `1px solid ${C.br}`, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div onClick={() => setEditingNotes(true)}
              style={{ padding: 8, background: C.bg, borderRadius: 6, border: `1px solid ${C.br}`, fontSize: 12, color: notes ? C.t2 : C.t3, cursor: 'pointer', minHeight: 28, lineHeight: 1.5 }}>
              {notes || 'Click to add notes...'}
            </div>
          )}

          {/* Interview prep button */}
          {['interview', 'second_interview'].includes(app.status) && (
            <div style={{ marginTop: 8 }}>
              <button onClick={handlePrep} disabled={prepLoading}
                style={{
                  width: '100%', padding: '6px 12px', background: C.pur + '15', border: `1px solid ${C.pur}33`,
                  borderRadius: 6, color: C.pur, cursor: prepLoading ? 'wait' : 'pointer',
                  fontSize: 11, fontWeight: 600, fontFamily: MONO,
                }}>
                {prepLoading ? 'Generating prep...' : prepContent ? 'Refresh Prep' : 'Generate Interview Prep'}
              </button>
              {prepContent && (
                <div style={{
                  marginTop: 6, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.pur}22`,
                  fontSize: 11, lineHeight: 1.7, color: C.t2, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto',
                }}>
                  {prepContent}
                </div>
              )}
            </div>
          )}

          {/* Cover letter preview */}
          {app.cover_letter && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 9, fontFamily: MONO, color: C.t3, letterSpacing: 1, display: 'block', marginBottom: 4 }}>COVER LETTER</label>
              <div style={{
                padding: 8, background: C.bg, borderRadius: 6, border: `1px solid ${C.br}`,
                fontSize: 11, color: C.t2, lineHeight: 1.5, maxHeight: 100, overflow: 'auto',
              }}>
                {app.cover_letter}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sortable wrapper ──
function SortableAppCard({ app, onUpdateNotes, onInterviewPrep }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app.id || app.job_id,
    data: { app },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <AppCard app={app} isDragging={isDragging} onUpdateNotes={onUpdateNotes} onInterviewPrep={onInterviewPrep} />
    </div>
  );
}

// ── Pipeline column ──
function PipelineColumn({ stage, apps, onUpdateNotes, onInterviewPrep }) {
  const ids = apps.map((a) => a.id || a.job_id);

  return (
    <div style={{
      minWidth: 240, maxWidth: 320, flex: '0 0 260px',
      background: C.bg, borderRadius: 12, border: `1px solid ${C.br}`,
      display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 200px)',
    }}>
      {/* Column header */}
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${C.br}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: stage.color }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{stage.label}</span>
        <span style={{
          fontSize: 10, fontFamily: MONO, color: stage.color, background: stage.color + '15',
          padding: '1px 8px', borderRadius: 99, marginLeft: 'auto',
        }}>
          {apps.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {apps.map((app) => (
            <SortableAppCard
              key={app.id || app.job_id}
              app={app}
              onUpdateNotes={onUpdateNotes}
              onInterviewPrep={onInterviewPrep}
            />
          ))}
        </SortableContext>
        {apps.length === 0 && (
          <div style={{ padding: '20px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: C.t3 }}>Drag cards here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Tracker ──
export default function Tracker() {
  const { applications, updateAppStatus, updateAppNotes, profile } = useStore();
  const [activeId, setActiveId] = useState(null);
  // Default to list on mobile for better UX
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const [viewMode, setViewMode] = useState(isMobile ? 'list' : 'kanban');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Group applications by stage
  const columns = useMemo(() => {
    const grouped = {};
    for (const stage of PIPELINE_STAGES) {
      grouped[stage.id] = applications.filter((a) => a.status === stage.id);
    }
    return grouped;
  }, [applications]);

  // Only show columns that have apps or are key stages
  const activeStages = PIPELINE_STAGES.filter(
    (s) => (columns[s.id]?.length > 0) || ['applied', 'interview', 'offer'].includes(s.id)
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !active) return;

    const draggedApp = active.data?.current?.app;
    if (!draggedApp) return;

    // Find which column the item was dropped over
    // Check if dropped over another card — find its parent column
    let targetStage = null;
    for (const stage of PIPELINE_STAGES) {
      const stageApps = columns[stage.id] || [];
      if (stageApps.some((a) => (a.id || a.job_id) === over.id)) {
        targetStage = stage.id;
        break;
      }
    }

    // If dropped directly on the column (empty column), over.id might be the column itself
    if (!targetStage) {
      const matchedStage = PIPELINE_STAGES.find((s) => s.id === over.id);
      if (matchedStage) targetStage = matchedStage.id;
    }

    if (targetStage && targetStage !== draggedApp.status) {
      updateAppStatus(draggedApp.id, targetStage);
    }
  };

  const handleInterviewPrep = async (app) => {
    const res = await db.callAI({
      type: 'interview-prep',
      job: {
        title: app.title,
        company: app.company,
        location: app.location,
        desc: '',
      },
      profile,
    });
    return res?.text || null;
  };

  const activeApp = activeId
    ? applications.find((a) => (a.id || a.job_id) === activeId)
    : null;

  return (
    <div style={{ padding: '24px 32px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ color: C.t1, fontSize: 20, fontWeight: 700, margin: 0 }}>Tracker</h2>
          {applications.length > 0 && (
            <span style={{ fontSize: 13, color: C.t3 }}>{applications.length} applications</span>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 4, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.br}` }}>
            {['kanban', 'list'].map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{
                  padding: '6px 14px', border: 'none', fontSize: 12,
                  cursor: 'pointer', fontWeight: 500,
                  background: viewMode === m ? C.c1 : 'transparent',
                  color: viewMode === m ? C.t1 : C.t3,
                }}>
                {m === 'kanban' ? 'Board' : 'List'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {applications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <h3 style={{ color: C.t1, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No applications yet</h3>
          <p style={{ color: C.t3, fontSize: 14 }}>
            When you mark jobs as applied from Matches or Browse, they'll show up here.
          </p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban view */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{
            display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16,
            minHeight: 300,
          }}>
            {activeStages.map((stage) => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                apps={columns[stage.id] || []}
                onUpdateNotes={updateAppNotes}
                onInterviewPrep={handleInterviewPrep}
              />
            ))}
          </div>
          <DragOverlay>
            {activeApp ? (
              <div style={{ opacity: 0.9, transform: 'rotate(2deg)' }}>
                <AppCard app={activeApp} isDragging={false} onUpdateNotes={() => {}} onInterviewPrep={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* List view */
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          {/* Stage filter tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, overflowX: 'auto', borderRadius: 10, border: `1px solid ${C.br}`, background: C.c1 }}>
            {PIPELINE_STAGES.filter((s) => (columns[s.id]?.length > 0)).map((stage) => (
              <button key={stage.id}
                style={{
                  padding: '8px 14px', border: 'none', fontSize: 11, fontFamily: MONO, cursor: 'default',
                  background: 'transparent', color: stage.color, fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                {stage.label} ({columns[stage.id]?.length || 0})
              </button>
            ))}
          </div>
          {PIPELINE_STAGES.map((stage) => {
            const apps = columns[stage.id] || [];
            if (apps.length === 0) return null;
            return (
              <div key={stage.id} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, background: stage.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{stage.label}</span>
                  <span style={{ fontSize: 11, fontFamily: MONO, color: C.t3 }}>({apps.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {apps.map((app) => (
                    <AppCard
                      key={app.id || app.job_id}
                      app={app}
                      isDragging={false}
                      onUpdateNotes={updateAppNotes}
                      onInterviewPrep={handleInterviewPrep}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
