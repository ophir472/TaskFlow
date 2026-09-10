import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { dashCounts, TILE_DEFS, BUILTIN_STEPS, stepDone, todayKey, docPageContentLookup } from '../../agenda';
import { buildQueue } from '../../engine';
import { AgendaPipeline } from './AgendaPipeline';
import type { Task } from '../../types';

// Dashboard versions — a registry so designs can coexist and Settings can
// switch between them (e.g. 'v1' and a future 'v1-gamified').
export const DASHBOARD_VERSIONS: Record<string, { label: string; component: () => React.JSX.Element }> = {
  v1: { label: 'v1 — tiles + agenda', component: HomeV1 },
};

export function Home() {
  const version = useStore(s => s.dashboardConfig.version);
  const Version = (DASHBOARD_VERSIONS[version] ?? DASHBOARD_VERSIONS.v1).component;
  return <Version />;
}

const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 };

function HomeV1() {
  const items = useStore(s => s.items);
  const sprintToggles = useStore(s => s.sprintTypeToggles);
  const sprintOrder = useStore(s => s.sprintOrder);
  const reviewSession = useStore(s => s.reviewSession);
  const customSystems = useStore(s => s.customSystems);
  const hubConfig = useStore(s => s.hubConfig);
  const config = useStore(s => s.dashboardConfig);
  const agendaChecks = useStore(s => s.agendaChecks);
  const toggleAgendaCheck = useStore(s => s.toggleAgendaCheck);
  const setWalkthrough = useStore(s => s.setWalkthrough);
  const walkthrough = useStore(s => s.walkthrough);
  const notebooks = useStore(s => s.notebooks);
  const pageContent = useMemo(() => docPageContentLookup(notebooks), [notebooks]);
  const setTableFilterPreset = useStore(s => s.setTableFilterPreset);
  const [hoverTile, setHoverTile] = useState<string | null>(null);

  const counts = useMemo(
    () => dashCounts(items, sprintToggles, sprintOrder, reviewSession, customSystems, hubConfig),
    [items, sprintToggles, sprintOrder, reviewSession, customSystems, hubConfig]);

  const todayChecks = useMemo(
    () => new Set(agendaChecks.date === todayKey() ? agendaChecks.ids : []),
    [agendaChecks]);

  const tiles = config.tiles
    .map(id => TILE_DEFS.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);

  const steps = config.agendaSteps.map(step => ({ step, done: stepDone(step, counts, todayChecks, pageContent) }));
  const nextStep = steps.find(s => !s.done);
  const planned = stepDone({ id: 'plan', builtin: 'plan', label: '' }, counts, todayChecks);

  // Today's tasks, actively ordered by the TABLE's manual order — dragging
  // rows in the table reorders this list live; unordered ones follow the
  // queue (score) order after them.
  const taskOrder = useStore(s => s.taskOrder);
  const todayOrdered = useMemo(() => {
    if (!planned) return [];
    const queue = buildQueue(items).filter(it => it.kind === 'task' && (it as Task).forToday) as Task[];
    const pos = new Map(taskOrder.map((id, i) => [id, i]));
    return [...queue].sort((a, b) => (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }, [items, planned, taskOrder]);

  function goStep(step: { builtin?: string; id: string; label: string; docPageId?: string }) {
    if (step.builtin) window.location.hash = BUILTIN_STEPS[step.builtin].hash;
    else if (step.docPageId) window.location.hash = `checklist/${step.docPageId}`;   // tick it inline
    else toggleAgendaCheck(step.id);
  }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '44px 56px 90px' }}>
      {/* Header + continue-where-I-left-off */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 44 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--t-txt)' }}>TaskFlow</div>
          <div style={{ fontSize: 13, color: 'var(--t-muted)', marginTop: 2 }}>
            {nextStep ? `Next up: ${nextStep.step.label}` : 'All done for today 🎉'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {config.agendaSteps.length > 0 && (
            <button onClick={() => setWalkthrough(config.agendaSteps[0].id)}
              title="Guided pass through every agenda step — the app navigates for you and waits at each screen"
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13.5, fontWeight: 700, padding: '10px 16px', borderRadius: 10, cursor: 'pointer' }}>
              🚶 Walkthrough
            </button>
          )}
          {nextStep && (
            // Continue works for every kind of step: built-ins navigate to their
            // screen, checklist steps open the popup, manual steps get checked off.
            <button onClick={() => goStep(nextStep.step)}
              title={nextStep.step.builtin ? BUILTIN_STEPS[nextStep.step.builtin].hint : nextStep.step.docPageId ? 'Open the checklist and tick every box' : 'Mark this manual step done for today'}
              style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 700, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}>
              {nextStep.step.builtin || nextStep.step.docPageId ? `▶ Continue: ${nextStep.step.label}` : `✓ Mark done: ${nextStep.step.label}`}
            </button>
          )}
        </div>
      </div>

      {/* Gamification — level/XP from completions, all store-derived */}
      {config.gamification && (() => {
        const day0 = new Date(); day0.setHours(0, 0, 0, 0);
        const t0 = day0.getTime();
        const tasksAll = items.filter((it): it is Task => it.kind === 'task');
        const doneToday = tasksAll.filter(t => t.type !== 'mail' && (t.archived || t.status === 'done') && t.updatedAt >= t0).length;
        const stepsToday = tasksAll.reduce((n, t) => n + t.subtasks.filter(su => su.done && (su.doneAt ?? 0) >= t0).length, 0);
        const mailToday = tasksAll.filter(t => t.type === 'mail' && t.archived && t.updatedAt >= t0).length;
        const xpToday = doneToday * 10 + stepsToday * 3 + mailToday * 2;
        const lifetime = tasksAll.filter(t => t.archived).length * 10;
        const level = 1 + Math.floor(lifetime / 100);
        const into = lifetime % 100;
        let streak = 0;
        for (let d = 0; d < 60; d++) {
          const s0 = t0 - d * 86_400_000, s1 = s0 + 86_400_000;
          const any = tasksAll.some(t => t.archived && t.updatedAt >= s0 && t.updatedAt < s1);
          if (any) streak++;
          else if (d === 0) continue; // an empty today doesn't break the streak yet
          else break;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 14, padding: '14px 22px', marginBottom: 34 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--t-acc)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>{level}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-txt)' }}>Level {level}</div>
                <div style={{ width: 130, height: 6, background: 'var(--t-surf3)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${into}%`, height: '100%', background: 'var(--t-acc)' }} />
                </div>
              </div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--t-txt2)' }}><b style={{ color: 'var(--t-acc-dk)' }}>+{xpToday} XP</b> today</span>
            <span style={{ fontSize: 13, color: 'var(--t-txt2)' }}>🎉 {doneToday} task{doneToday !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 13, color: 'var(--t-txt2)' }}>✓ {stepsToday} step{stepsToday !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 13, color: 'var(--t-txt2)' }}>✉ {mailToday} sent</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: streak > 1 ? 'var(--t-amber)' : 'var(--t-muted)' }}>🔥 {streak}-day streak</span>
          </div>
        );
      })()}

      {/* Stat tiles */}
      <div style={sectionTitle}>At a glance</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18, marginBottom: 54 }}>
        {tiles.map(t => {
          const n = t.count(counts);
          const hovered = hoverTile === t.id;
          return (
            <button key={t.id}
              onClick={() => { if (t.preset) setTableFilterPreset(t.preset); window.location.hash = t.hash; }}
              onMouseEnter={() => setHoverTile(t.id)}
              onMouseLeave={() => setHoverTile(cur => cur === t.id ? null : cur)}
              title={`Open ${t.label}`}
              style={{ position: 'relative', textAlign: 'left', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: '18px 20px', cursor: 'pointer', minHeight: 128, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: hovered ? '0 6px 22px rgba(0,0,0,0.09)' : '0 1px 3px rgba(0,0,0,0.04)', transition: 'box-shadow 0.12s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15 }}>{t.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-txt2)' }}>{t.label}</span>
              </div>
              <div style={{ fontSize: 40, fontWeight: 800, color: n > 0 ? t.color : 'var(--t-muted)', lineHeight: 1 }}>{n}</div>
              {hovered && (
                <span
                  onClick={e => { e.stopPropagation(); if (t.preset) setTableFilterPreset(t.preset); window.location.hash = t.hash; }}
                  title={`Jump into ${t.label}`}
                  style={{ position: 'absolute', right: 12, bottom: 12, width: 34, height: 34, borderRadius: '50%', background: t.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                  <span style={{ transform: 'translateX(1px)' }}>▶</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Daily agenda — CI-pipeline style (Jenkins / Harness): stage nodes,
          SUCCESS / RUNNING / QUEUED, flowing connector into the running stage.
          Full width — the stages stretch to fill the page. */}
      <div style={sectionTitle}>Daily agenda</div>
      <AgendaPipeline steps={steps} counts={counts} todayChecks={todayChecks} pageContent={pageContent} walking={!!walkthrough} onGo={goStep} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 56, alignItems: 'start' }}>
      <div>
      {/* Activation: plan first, then today's list in work order */}
      {!planned ? (
        <div style={{ background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: '26px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
          <button onClick={() => { window.location.hash = 'plan'; }}
            title="Plan today's tasks"
            style={{ width: 54, height: 54, borderRadius: '50%', border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
            <span style={{ transform: 'translateX(2px)' }}>▶</span>
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-txt)' }}>
              {counts.todayTotal === 0 ? 'Nothing marked for today yet' : `Plan today — ${counts.unplannedToday} task${counts.unplannedToday !== 1 ? 's' : ''} awaiting steps`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t-muted)', marginTop: 3 }}>
              {counts.todayTotal === 0 ? 'Mark cards "Today" in the feed, then plan their steps here.' : 'Write each task\'s steps — the lines you type become its subtasks.'}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={sectionTitle}>Today, in order</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todayOrdered.length === 0 && (
              <div style={{ fontSize: 13.5, color: 'var(--t-muted)' }}>Everything planned for today is done 🎉</div>
            )}
            {todayOrdered.map((t, i) => (
              <div key={t.id}
                onClick={() => { window.location.hash = `table/task/${t.id}`; }}
                title="Open the task"
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: '11px 16px', cursor: 'pointer' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--t-txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                <span style={{ fontSize: 11.5, color: 'var(--t-muted)', flexShrink: 0 }}>
                  {t.subtasks.filter(s => !s.done).length} step{t.subtasks.filter(s => !s.done).length !== 1 ? 's' : ''} left
                </span>
                <span
                  onClick={e => { e.stopPropagation(); window.location.hash = `play/${t.id}`; }}
                  title="Play this task (focus mode)"
                  style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--t-success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                  <span style={{ transform: 'translateX(1px)' }}>▶</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
      </div>
    </div>
  );
}
