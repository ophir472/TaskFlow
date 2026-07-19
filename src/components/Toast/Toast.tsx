interface Props { text: string | null; }

export function Toast({ text }: Props) {
  if (!text) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--t-txt)', color: 'var(--t-surf)', fontSize: 13.5, fontWeight: 500,
      padding: '11px 18px', borderRadius: 9, boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
      zIndex: 80, whiteSpace: 'nowrap',
    }}>
      {text}
    </div>
  );
}
