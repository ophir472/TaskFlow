// Small confirmation banner in the bottom-right corner — for actions that
// need no dialog because the app already has a way back (archive ⇄ restore,
// copy link). `action` is that way back / the follow-up, one click away.
interface Props {
  text: string | null;
  action?: { label: string; onClick: () => void } | null;
}

export function CornerBanner({ text, action }: Props) {
  if (!text) return null;
  return (
    <div role="status" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 9, background: 'var(--t-surf)', color: 'var(--t-txt)', border: '1px solid var(--t-brd)', boxShadow: '0 6px 20px rgba(0,0,0,0.18)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--t-success)', fontWeight: 800 }}>✓</span> {text}
      {action && (
        <button onClick={action.onClick}
          style={{ border: 'none', background: 'transparent', color: 'var(--t-acc)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
