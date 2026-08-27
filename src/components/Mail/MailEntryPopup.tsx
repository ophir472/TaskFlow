import { useEffect } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { MailEntryFields } from './MailEntryFields';
import { backdropCloseProps } from '../../backdrop';

// Overlay popup for a mail entry — the same shared MailEntryFields form the
// assistant / Play / Sprint use, on top of whatever page is open. Used by the
// Settings sprint queue AND the Table (a mail row is a mail entry, not a
// task card).
export function MailEntryPopup({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const entry = useStore(s => s.items.find(i => i.id === entryId));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Focused fields keep their Esc (unfocus-first pattern).
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  if (!entry || entry.kind !== 'task') return null;
  return (
    <div {...backdropCloseProps(onClose)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)', maxHeight: '72vh', overflowY: 'auto', background: 'var(--t-surf)', borderRadius: 14, border: '1px solid var(--t-brd)', boxShadow: '0 24px 70px rgba(0,0,0,0.4)', padding: 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-txt)' }}>✉ Mail entry</div>
          <span onClick={onClose} title="Close" style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--t-muted)', fontSize: 18, lineHeight: 1 }}>×</span>
        </div>
        <MailEntryFields entry={entry as Task} />
      </div>
    </div>
  );
}
