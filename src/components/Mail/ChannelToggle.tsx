import type { Task } from '../../types';

// Communication channel of a mail entry: Outlook (email) or Teams (chat).
// One entity — the same toggle/icon everywhere an entry shows (assistant
// capture + preview, Play's m-popup, Sprint, the card's To-send table, Table).
export type Channel = 'outlook' | 'teams';
export const CHANNELS: { key: Channel; icon: string; label: string; hint: string }[] = [
  { key: 'outlook', icon: '✉', label: 'Outlook', hint: 'An email to send' },
  { key: 'teams', icon: '💬', label: 'Teams', hint: 'A Teams chat / channel message' },
];
export const channelOf = (t: Pick<Task, 'channel'> | undefined | null): Channel => t?.channel ?? 'outlook';
export const channelDef = (c: Channel) => CHANNELS.find(x => x.key === c) ?? CHANNELS[0];
export const sendLabel = (c: Channel) => (c === 'teams' ? 'Teams message to send' : 'Mail to send');
export const nextChannel = (c: Channel): Channel => (c === 'outlook' ? 'teams' : 'outlook');

export function ChannelIcon({ channel, size = 12, onClick, title }: { channel: Channel; size?: number; onClick?: () => void; title?: string }) {
  const d = channelDef(channel);
  return (
    <span onClick={onClick ? e => { e.stopPropagation(); onClick(); } : undefined} title={title ?? d.label}
      style={{ fontSize: size, lineHeight: 1, flexShrink: 0, cursor: onClick ? 'pointer' : undefined, color: channel === 'teams' ? 'oklch(0.5 0.14 285)' : 'var(--t-muted)' }}>
      {d.icon}
    </span>
  );
}

export function ChannelToggle({ value, onChange, dark, compact }: { value: Channel; onChange: (c: Channel) => void; dark?: boolean; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Channel" style={{ display: 'inline-flex', alignItems: 'stretch', height: compact ? 28 : 32, border: `1px solid ${dark ? 'rgba(255,255,255,0.25)' : 'var(--t-brd)'}`, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
      {CHANNELS.map((c, i) => {
        const on = value === c.key;
        return (
          <button key={c.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.key)} title={c.hint}
            style={{ border: 'none', borderLeft: i ? `1px solid ${dark ? 'rgba(255,255,255,0.25)' : 'var(--t-brd)'}` : 'none', padding: compact ? '0 9px' : '0 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              background: on ? (dark ? 'rgba(255,255,255,0.18)' : 'var(--t-acc-bg)') : (dark ? 'transparent' : 'var(--t-surf)'),
              color: on ? (dark ? 'white' : 'var(--t-acc-dk)') : (dark ? 'rgba(255,255,255,0.7)' : 'var(--t-muted)') }}>
            <span>{c.icon}</span>{c.label}
          </button>
        );
      })}
    </div>
  );
}
