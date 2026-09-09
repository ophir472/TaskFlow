import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { backdropCloseProps } from '../../backdrop';
import { DocView } from './DocView';
import { TaskModal } from '../TaskModal/TaskModal';
import { leafCheckKeys, dailyCheckId } from '../../docBlocks';
import { todayKey } from '../../agenda';
import { useLogMount } from '../../useLogMount';

// A Docs checklist page as a daily-agenda step, ticked in place (#checklist/<pageId>).
// The page is the template; today's ticks are agenda checks (reset at midnight).
// ↑↓ move · Space/Enter tick · Esc close.
interface Props { pageId: string; onClose: () => void }

export function ChecklistPopup({ pageId, onClose }: Props) {
  useLogMount('ChecklistPopup');
  const notebooks = useStore(s => s.notebooks);
  const agendaChecks = useStore(s => s.agendaChecks);
  const setAgendaChecks = useStore(s => s.setAgendaChecks);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [hi, setHi] = useState(0);

  const page = useMemo(() => {
    for (const nb of notebooks) for (const c of nb.categories) for (const p of c.pages) if (p.id === pageId) return p;
    return null;
  }, [notebooks, pageId]);
  const keys = useMemo(() => page ? leafCheckKeys(page.content) : [], [page]);
  const todayIds = useMemo(() => new Set(agendaChecks.date === todayKey() ? agendaChecks.ids : []), [agendaChecks]);
  const checked = useMemo(() => new Set(keys.filter(k => todayIds.has(dailyCheckId(pageId, k)))), [keys, todayIds, pageId]);
  const done = keys.length > 0 && checked.size === keys.length;

  const toggleKeys = (ks: string[], on: boolean) => setAgendaChecks(ks.map(k => dailyCheckId(pageId, k)), on);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (taskId) return; // the task popup has its own keys
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => keys.length ? (h + 1) % keys.length : 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => keys.length ? (h - 1 + keys.length) % keys.length : 0); }
      else if ((e.key === ' ' || e.key === 'Enter') && keys[hi]) { e.preventDefault(); toggleKeys([keys[hi]], !checked.has(keys[hi])); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, hi, checked, taskId]);

  return (
    <div {...backdropCloseProps(onClose)}
      style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(640px, 94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--t-surf)', borderRadius: 16, border: '1px solid var(--t-brd)', boxShadow: '0 24px 70px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--t-brd)' }}>
          <span style={{ fontSize: 18 }}>☑</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{page?.title ?? 'Checklist page not found'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>Daily checklist · ticks reset at midnight · {checked.size}/{keys.length} today</div>
          </div>
          {keys.length > 0 && (
            <div style={{ width: 90, height: 6, borderRadius: 999, background: 'var(--t-surf3)', overflow: 'hidden', flexShrink: 0 }} title={`${checked.size} of ${keys.length}`}>
              <div style={{ width: `${(checked.size / keys.length) * 100}%`, height: '100%', background: done ? 'var(--t-success)' : 'var(--t-acc)', transition: 'width 0.15s' }} />
            </div>
          )}
          {page && (
            <button onClick={() => { window.location.hash = `docs/${page.id}`; }} title="Open the page in Docs (edit the template)"
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ≡ Open page
            </button>
          )}
          <span onClick={onClose} title="Close (Esc)" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
        </div>
        <div style={{ padding: '12px 18px 16px', overflowY: 'auto' }}>
          {!page ? (
            <div style={{ color: 'var(--t-muted)', fontSize: 13 }}>This page was deleted. Remove the step in Settings → Dashboard.</div>
          ) : keys.length === 0 ? (
            <div style={{ color: 'var(--t-muted)', fontSize: 13 }}>No to-dos on this page yet. Add <code>- [ ]</code> lines (or type <b>/</b> → To-do) on the page.</div>
          ) : (
            <DocView content={page.content} dailyChecked={checked} onToggleKeys={toggleKeys} highlightKey={keys[hi] ?? null}
              onOpenPage={id => { window.location.hash = `docs/${id}`; }} onOpenTask={setTaskId} compact />
          )}
          {done && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: 'var(--t-success)' }}>✓ All done for today</div>}
        </div>
        <div style={{ padding: '8px 18px 12px', fontSize: 11, color: 'var(--t-muted)', display: 'flex', gap: 12, borderTop: '1px solid var(--t-brd2)' }}>
          <span><kbd style={{ fontFamily: 'inherit' }}>↑↓</kbd> move</span><span><kbd style={{ fontFamily: 'inherit' }}>space</kbd> tick</span><span><kbd style={{ fontFamily: 'inherit' }}>esc</kbd> close</span>
        </div>
      </div>
      {taskId && <TaskModal taskId={taskId} onClose={() => setTaskId(null)} urlDriven={false} />}
    </div>
  );
}
