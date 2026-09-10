import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store';
import { dashCounts, stepDone, BUILTIN_STEPS, todayKey, docPageContentLookup } from '../../agenda';

// Walkthrough mode — the approved store-driven design: a small floating bar
// that NAVIGATES between the app's screens, one agenda step at a time, and
// waits at each until the step's own done-condition is met (the same
// selectors the dashboard uses), then advances to the next screen. The app
// stays fully interactive; state survives refresh; Skip/Exit any time.
export function WalkthroughBar() {
  const walkthrough = useStore(s => s.walkthrough);
  const setWalkthrough = useStore(s => s.setWalkthrough);
  const steps = useStore(s => s.dashboardConfig.agendaSteps);
  const items = useStore(s => s.items);
  const sprintToggles = useStore(s => s.sprintTypeToggles);
  const sprintOrder = useStore(s => s.sprintOrder);
  const reviewSession = useStore(s => s.reviewSession);
  const customSystems = useStore(s => s.customSystems);
  const hubConfig = useStore(s => s.hubConfig);
  const agendaChecks = useStore(s => s.agendaChecks);
  const toggleAgendaCheck = useStore(s => s.toggleAgendaCheck);
  const notebooks = useStore(s => s.notebooks);
  const pageContent = useMemo(() => docPageContentLookup(notebooks), [notebooks]);

  const counts = useMemo(
    () => dashCounts(items, sprintToggles, sprintOrder, reviewSession, customSystems, hubConfig),
    [items, sprintToggles, sprintOrder, reviewSession, customSystems, hubConfig]);
  const todayChecks = useMemo(
    () => new Set(agendaChecks.date === todayKey() ? agendaChecks.ids : []),
    [agendaChecks]);

  // Stale walkthrough (started before today) → exit quietly.
  useEffect(() => {
    if (!walkthrough) return;
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    if ((walkthrough.startedAt ?? 0) < t0.getTime()) setWalkthrough(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkthrough?.stepId]);

  const idx = steps.findIndex(s => s.id === walkthrough?.stepId);
  const step = idx >= 0 ? steps[idx] : null;
  const done = step ? stepDone(step, counts, todayChecks, pageContent) : false;

  const navigatedFor = useRef<string | null>(null);
  // replace, not push: hopping review → plan → mail must not stack overlay
  // entries, or closing one would 'go back' into the previous one.
  const go = (hash: string) => { if (window.location.hash !== `#${hash}`) window.location.replace(`#${hash}`); };

  // Enter the current step's screen once per step.
  useEffect(() => {
    if (!step) return;
    if (navigatedFor.current === step.id) return;
    navigatedFor.current = step.id;
    if (step.builtin === 'today') {
      // Straight into focus mode on the first today-task (feed as fallback).
      const first = counts.todayTasks[0];
      go(first ? `play/${first.id}` : 'feed');
    } else if (step.builtin) go(BUILTIN_STEPS[step.builtin].hash);
    else if (step.docPageId) go(`checklist/${step.docPageId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Advance when the step completes (or was already complete on arrival).
  useEffect(() => {
    if (!step || !done) return;
    const t = setTimeout(() => advance(), 600); // brief beat so the ✓ is seen
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, done]);

  function advance() {
    const next = steps[idx + 1];
    if (next) setWalkthrough(next.id);
    else { setWalkthrough(null); window.location.replace('#home'); }
  }

  if (!walkthrough) return null;
  if (!step) { setWalkthrough(null); return null; }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 64, zIndex: 640, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--t-txt)', color: 'var(--t-bg)', borderRadius: 14, padding: '12px 16px', boxShadow: '0 10px 32px rgba(0,0,0,0.35)', maxWidth: 420 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{done ? '✓' : (step.builtin ? BUILTIN_STEPS[step.builtin].icon : step.docPageId ? '☑' : '•')}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Walkthrough {idx + 1}/{steps.length}: {step.label}
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.75, lineHeight: 1.4 }}>
          {done ? 'Done — moving on…' : step.builtin ? BUILTIN_STEPS[step.builtin].hint : step.docPageId ? 'Checklist — tick every box to continue.' : 'Manual step — mark it done to continue.'}
        </div>
      </div>
      {step.docPageId && !done && (
        <button onClick={() => go(`checklist/${step.docPageId}`)}
          style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}>
          ☑ Open checklist
        </button>
      )}
      {!step.builtin && !step.docPageId && !done && (
        <button onClick={() => toggleAgendaCheck(step.id)}
          style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}>
          ✓ Done
        </button>
      )}
      <button onClick={advance} title="Skip this step"
        style={{ border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'inherit', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}>
        Skip →
      </button>
      <button onClick={() => setWalkthrough(null)} title="Exit walkthrough"
        style={{ border: 'none', background: 'transparent', color: 'inherit', fontSize: 16, cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 2 }}>
        ×
      </button>
    </div>
  );
}
