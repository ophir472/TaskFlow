import { useEffect, useState } from 'react';
import { useStore } from '../../store';

interface Props {
  url: string;
  ticketKey: string;
  onClose: () => void;
}

/**
 * Opens Jira links per the global setting (Settings → Jira Integration):
 * 'popup' shows the in-app JiraPreviewModal, 'tab' opens a browser tab.
 * Usage: const { openJira, jiraModal } = useJiraOpener(); render {jiraModal}.
 */
export function useJiraOpener() {
  const mode = useStore(s => s.jiraOpenMode);
  const [preview, setPreview] = useState<{ url: string; key: string } | null>(null);
  function openJira(url: string, key: string) {
    if (mode === 'tab') window.open(url, '_blank');
    else setPreview({ url, key });
  }
  const jiraModal = preview
    ? <JiraPreviewModal url={preview.url} ticketKey={preview.key} onClose={() => setPreview(null)} />
    : null;
  return { openJira, jiraModal };
}

// In-app preview of a Jira ticket in an iframe, with an escape hatch to a
// real browser tab. Note: some Jira instances (notably Atlassian Cloud) send
// frame-ancestors/X-Frame-Options headers that block embedding — the footer
// points users to the new-tab button when the frame stays blank.
export function JiraPreviewModal({ url, ticketKey, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase + stopPropagation so a parent modal's own Escape
        // handler (e.g. TaskModal fully closing) doesn't fire underneath.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      onClick={e => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1200px, 96vw)', height: 'min(860px, 92vh)',
          background: 'var(--t-surf)', borderRadius: 14,
          boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--t-brd)', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)' }}>{ticketKey}</span>
          <span style={{ fontSize: 12, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{url}</span>
          <button
            onClick={() => window.open(url, '_blank')}
            style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ↗ Open in new tab
          </button>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: 'var(--t-muted)', lineHeight: 1, padding: '2px 6px' }}>×</span>
        </div>

        {/* Embedded ticket */}
        <iframe src={url} title={ticketKey} style={{ flex: 1, border: 'none', width: '100%', background: 'white' }} />

        {/* Footer hint */}
        <div style={{ padding: '7px 18px', borderTop: '1px solid var(--t-brd)', background: 'var(--t-surf2)', fontSize: 11.5, color: 'var(--t-muted)', flexShrink: 0 }}>
          Preview stays blank? This Jira instance blocks embedding — use "Open in new tab".
        </div>
      </div>
    </div>
  );
}
