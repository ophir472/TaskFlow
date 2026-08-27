import { useState } from 'react';
import { useStore } from '../../store';
import { TILE_DEFS, BUILTIN_STEPS } from '../../agenda';
import { DASHBOARD_VERSIONS } from '../Home/Home';
import type { AgendaStep } from '../../types';
import { nextId } from '../../engine';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 4 };
const hint: React.CSSProperties = { fontSize: 12.5, color: 'var(--t-muted)', marginBottom: 14 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 13 };

function moveWithin<T>(list: T[], from: number, to: number): T[] {
  const n = [...list];
  const [x] = n.splice(from, 1);
  n.splice(to, 0, x);
  return n;
}

// Settings → Dashboard: everything about the homepage is data, not code —
// which tiles show (and their order), the agenda pipeline steps, the
// gamification master toggle, and which dashboard version renders.
export function DashboardSection() {
  const config = useStore(s => s.dashboardConfig);
  const setDashboardConfig = useStore(s => s.setDashboardConfig);
  const [dragTile, setDragTile] = useState<number | null>(null);
  const [dragStep, setDragStep] = useState<number | null>(null);
  const [newStep, setNewStep] = useState('');

  const enabled = config.tiles;
  const disabledTiles = TILE_DEFS.filter(t => !enabled.includes(t.id));
  const missingBuiltins = Object.keys(BUILTIN_STEPS).filter(k => !config.agendaSteps.some(s => s.builtin === k));

  function addCustomStep() {
    const label = newStep.trim();
    if (!label) return;
    setDashboardConfig({ agendaSteps: [...config.agendaSteps, { id: nextId('ag'), label }] });
    setNewStep('');
  }

  return (
    <>
      {/* ── General ── */}
      <div style={card}>
        <div style={title}>Dashboard</div>
        <div style={hint}>The homepage (⌂, key 1). Version and gamification are independent — versions can coexist.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <span style={{ fontWeight: 600 }}>Version</span>
            <select value={config.version} onChange={e => setDashboardConfig({ version: e.target.value })}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)' }}>
              {Object.entries(DASHBOARD_VERSIONS).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.gamification} onChange={e => setDashboardConfig({ gamification: e.target.checked })} />
            <span style={{ fontWeight: 600 }}>Gamification</span>
            <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>(master toggle — stats/XP visuals land in a later version)</span>
          </label>
        </div>
      </div>

      {/* ── Stat tiles ── */}
      <div style={card}>
        <div style={title}>Stat tiles</div>
        <div style={hint}>Which tiles the dashboard shows, in this order — drag to reorder, uncheck to hide.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {enabled.map((id, i) => {
            const def = TILE_DEFS.find(t => t.id === id);
            if (!def) return null;
            return (
              <div key={id} draggable
                onDragStart={() => setDragTile(i)}
                onDragOver={e => { if (dragTile !== null) e.preventDefault(); }}
                onDrop={() => { if (dragTile !== null && dragTile !== i) setDashboardConfig({ tiles: moveWithin(enabled, dragTile, i) }); setDragTile(null); }}
                onDragEnd={() => setDragTile(null)}
                style={{ ...row, opacity: dragTile === i ? 0.45 : 1, cursor: 'grab' }}>
                <span style={{ color: 'var(--t-muted)', fontSize: 12 }}>⠿</span>
                <input type="checkbox" checked readOnly onClick={() => setDashboardConfig({ tiles: enabled.filter(x => x !== id) })} style={{ cursor: 'pointer' }} />
                <span style={{ fontSize: 14 }}>{def.icon}</span>
                <span style={{ fontWeight: 600 }}>{def.label}</span>
              </div>
            );
          })}
          {disabledTiles.map(def => (
            <div key={def.id} style={{ ...row, opacity: 0.6 }}>
              <span style={{ width: 12 }} />
              <input type="checkbox" checked={false} readOnly onClick={() => setDashboardConfig({ tiles: [...enabled, def.id] })} style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: 14 }}>{def.icon}</span>
              <span style={{ fontWeight: 600, color: 'var(--t-muted)' }}>{def.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agenda steps ── */}
      <div style={card}>
        <div style={title}>Daily agenda steps</div>
        <div style={hint}>The pipeline the dashboard walks each day. Drag to reorder, × removes, add your own steps (they become manual check-offs, e.g. "lunch").</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {config.agendaSteps.map((step, i) => (
            <div key={step.id} draggable
              onDragStart={() => setDragStep(i)}
              onDragOver={e => { if (dragStep !== null) e.preventDefault(); }}
              onDrop={() => { if (dragStep !== null && dragStep !== i) setDashboardConfig({ agendaSteps: moveWithin(config.agendaSteps, dragStep, i) }); setDragStep(null); }}
              onDragEnd={() => setDragStep(null)}
              style={{ ...row, opacity: dragStep === i ? 0.45 : 1, cursor: 'grab' }}>
              <span style={{ color: 'var(--t-muted)', fontSize: 12 }}>⠿</span>
              <span style={{ fontSize: 14 }}>{step.builtin ? BUILTIN_STEPS[step.builtin].icon : '•'}</span>
              {step.builtin ? (
                <span style={{ fontWeight: 600, flex: 1 }}>{step.label}</span>
              ) : (
                <input value={step.label}
                  onChange={e => setDashboardConfig({ agendaSteps: config.agendaSteps.map(s => s.id === step.id ? { ...s, label: e.target.value } : s) })}
                  style={{ flex: 1, fontSize: 13, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', color: 'var(--t-txt)' }} />
              )}
              <span style={{ fontSize: 10.5, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{step.builtin ? 'auto' : 'manual'}</span>
              <span onClick={() => setDashboardConfig({ agendaSteps: config.agendaSteps.filter(s => s.id !== step.id) })}
                title="Remove step" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 15, lineHeight: 1 }}>×</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={newStep} onChange={e => setNewStep(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCustomStep(); }}
            placeholder="Add a custom step (e.g. lunch)…"
            style={{ fontSize: 13, padding: '7px 11px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', width: 240 }} />
          <button onClick={addCustomStep} disabled={!newStep.trim()}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', opacity: newStep.trim() ? 1 : 0.5 }}>
            + Add
          </button>
          {missingBuiltins.map(k => (
            <button key={k}
              onClick={() => setDashboardConfig({ agendaSteps: [...config.agendaSteps, { id: k, builtin: k as AgendaStep['builtin'], label: BUILTIN_STEPS[k].label }] })}
              style={{ border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, fontWeight: 600, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' }}>
              + {BUILTIN_STEPS[k].icon} {BUILTIN_STEPS[k].label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
