import { BUILTIN_STEPS, checklistProgress, type DashCounts } from '../../agenda';
import type { AgendaStep } from '../../types';

// The daily agenda as a CI pipeline (Jenkins / Harness style): stage nodes on
// a track, SUCCESS in green, the current stage RUNNING with a spinning ring
// and a flowing connector, the rest QUEUED. Every number comes from the
// same selectors the tiles use — nothing here reads logs.
//
// Motion is state-driven only: the ring spins and the connector flows on the
// stage that is actually running; nothing animates on mount.
interface Props {
  steps: { step: AgendaStep; done: boolean }[];
  counts: DashCounts;
  todayChecks: Set<string>;
  pageContent: (pageId: string) => string | null;
  walking: boolean;
  onGo: (step: AgendaStep) => void;
}

type Status = 'success' | 'running' | 'queued';

export function AgendaPipeline({ steps, counts, todayChecks, pageContent, walking, onGo }: Props) {
  const runningIdx = steps.findIndex(s => !s.done);
  const doneCount = steps.filter(s => s.done).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const allDone = steps.length > 0 && runningIdx === -1;

  const statusOf = (i: number): Status => (steps[i].done ? 'success' : i === runningIdx ? 'running' : 'queued');
  const metric = (step: AgendaStep): { text: string; warn?: boolean } => {
    const c = counts;
    switch (step.builtin) {
      case 'review': return { text: c.review === 0 ? 'queue empty' : `${c.review} to review`, warn: c.review > 0 };
      case 'sweep': return { text: todayChecks.has('sweep') ? 'swept today' : 'not swept yet' };
      case 'plan': return { text: c.todayTotal === 0 ? 'nothing marked today' : c.unplannedToday === 0 ? 'all planned' : `${c.unplannedToday} unplanned`, warn: c.unplannedToday > 0 };
      case 'mail': return { text: c.mail === 0 ? 'nothing pending' : `${c.mail} to answer`, warn: c.mail > 0 };
      case 'sprint': return { text: c.sprint === 0 ? 'pool empty' : `${c.sprint} in the pool`, warn: c.sprint > 0 };
      case 'today': return { text: c.todayTotal === 0 ? 'no today-tasks' : `${c.todayTotal - c.todayRemaining}/${c.todayTotal} done`, warn: c.todayRemaining > 0 };
      default: {
        if (step.docPageId) {
          const content = pageContent(step.docPageId);
          if (content == null) return { text: 'page deleted', warn: true };
          const [d, t] = checklistProgress(step.docPageId, content, todayChecks);
          return { text: t === 0 ? 'no to-dos' : `${d}/${t} ticked`, warn: d < t };
        }
        return { text: todayChecks.has(step.id) ? 'checked' : 'manual check' };
      }
    }
  };
  const icon = (step: AgendaStep) => step.builtin ? BUILTIN_STEPS[step.builtin].icon : step.docPageId ? '☑' : '•';
  const hint = (step: AgendaStep) => step.builtin ? BUILTIN_STEPS[step.builtin].hint : step.docPageId ? 'Checklist — open it and tick every box (ticks reset at midnight)' : 'Custom step — click to check it off (resets at midnight)';

  const GREEN = 'var(--t-success)', BLUE = 'var(--t-acc)', GREY = 'var(--t-brd)';
  const colorOf = (s: Status) => (s === 'success' ? GREEN : s === 'running' ? BLUE : GREY);

  return (
    <div style={{ background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: '14px 18px 18px', marginBottom: 54 }}>
      {/* header strip — build-style summary + segmented progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: allDone ? GREEN : BLUE, boxShadow: allDone ? 'none' : `0 0 0 4px color-mix(in oklab, ${BLUE} 20%, transparent)`, animation: !allDone && walking ? 'agendaPulse 1.6s ease-in-out infinite' : 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-txt)' }}>
          {allDone ? 'Pipeline finished' : walking ? 'Walkthrough running' : 'Pipeline in progress'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>· {doneCount}/{steps.length} stages · {pct}%</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, height: 5, marginBottom: 18 }}>
        {steps.map((s, i) => {
          const st = statusOf(i);
          return <div key={s.step.id} style={{ flex: 1, borderRadius: 999, background: st === 'queued' ? 'var(--t-surf3)' : colorOf(st), opacity: st === 'running' ? 0.55 : 1, transition: 'background 0.3s' }} />;
        })}
      </div>

      {/* the track */}
      <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4 }}>
        {steps.map(({ step, done }, i) => {
          const st = statusOf(i);
          const m = metric(step);
          const col = colorOf(st);
          const prevDone = i > 0 && steps[i - 1].done;
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
              {/* connector — solid green behind success, flowing into the running stage, dashed grey ahead */}
              {i > 0 && (
                <div style={{ width: 44, display: 'flex', alignItems: 'center' }}>
                  <div style={{
                    width: '100%', height: 3, borderRadius: 2,
                    background: st === 'running' && prevDone
                      ? `repeating-linear-gradient(90deg, ${BLUE} 0 8px, transparent 8px 14px)`
                      : done ? GREEN : prevDone ? `repeating-linear-gradient(90deg, ${GREY} 0 6px, transparent 6px 11px)` : `repeating-linear-gradient(90deg, ${GREY} 0 6px, transparent 6px 11px)`,
                    backgroundSize: '200% 100%',
                    animation: st === 'running' && prevDone ? 'agendaFlow 0.9s linear infinite' : 'none',
                    opacity: st === 'queued' && !prevDone ? 0.7 : 1,
                  }} />
                </div>
              )}
              {/* stage node */}
              <div onClick={() => onGo(step)} title={hint(step)}
                style={{
                  width: 148, boxSizing: 'border-box', padding: '12px 12px 10px', borderRadius: 12, cursor: 'pointer', position: 'relative',
                  background: st === 'running' ? `color-mix(in oklab, ${BLUE} 6%, var(--t-surf))` : st === 'success' ? `color-mix(in oklab, ${GREEN} 5%, var(--t-surf))` : 'var(--t-surf2)',
                  border: `1.5px solid ${st === 'queued' ? 'var(--t-brd)' : col}`,
                  boxShadow: st === 'running' ? `0 0 0 4px color-mix(in oklab, ${BLUE} 14%, transparent)` : 'none',
                  transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* status badge: ✓ / spinning ring / hollow */}
                  <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
                    {st === 'running' && (
                      <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2.5px solid color-mix(in oklab, ${BLUE} 25%, transparent)`, borderTopColor: BLUE, animation: 'spin 1.1s linear infinite' }} />
                    )}
                    <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, background: st === 'success' ? GREEN : st === 'running' ? 'var(--t-surf)' : 'var(--t-surf)', color: st === 'success' ? 'white' : st === 'running' ? BLUE : 'var(--t-muted)', border: st === 'success' ? 'none' : `1.5px solid ${st === 'running' ? 'transparent' : 'var(--t-brd)'}` }}>
                      {st === 'success' ? '✓' : icon(step)}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: st === 'queued' ? 'var(--t-txt2)' : 'var(--t-txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.label}</div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: st === 'success' ? GREEN : st === 'running' ? BLUE : 'var(--t-muted)' }}>
                      {st === 'success' ? 'success' : st === 'running' ? (walking ? 'running' : 'next') : 'queued'}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 9, fontSize: 11.5, color: m.warn && st !== 'success' ? 'var(--t-amber)' : 'var(--t-muted)', fontWeight: m.warn && st !== 'success' ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.text}
                </div>
                <div style={{ position: 'absolute', right: 8, top: 8, fontSize: 10, color: 'var(--t-muted)' }}>#{i + 1}</div>
              </div>
            </div>
          );
        })}
        {steps.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>No agenda steps — add some in Settings → Dashboard.</div>}
      </div>
    </div>
  );
}
