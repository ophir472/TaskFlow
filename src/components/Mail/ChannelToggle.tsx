import type { Task } from '../../types';

// Communication channel of a mail entry: Outlook (email) or Teams (chat).
// One entity — the same toggle/icon everywhere an entry shows (assistant
// capture + preview, Play's m-popup, Sprint, the card's To-send table, Table).
export type Channel = 'outlook' | 'teams';

// Brand marks (inline SVG, brand colours — no network): Outlook's blue "O"
// tile with the envelope flap, Teams' purple "T" tile with the two figures.
export const OUTLOOK_BLUE = '#0F6CBD';
export const TEAMS_PURPLE = '#5B5FC7';
export function OutlookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      <rect x="9" y="6" width="19" height="20" rx="2" fill="#28A8EA" />
      <path d="M9 13h19v13H9z" fill="#0364B8" />
      <path d="M9 13l9.5 6.5L28 13v13H9z" fill="#0078D4" />
      <path d="M9 13l9.5 6.5L28 13" fill="none" stroke="#fff" strokeWidth="1.2" />
      <rect x="3" y="9" width="14" height="14" rx="1.5" fill={OUTLOOK_BLUE} />
      <ellipse cx="10" cy="16" rx="4" ry="4.6" fill="none" stroke="#fff" strokeWidth="2.2" />
    </svg>
  );
}
export function TeamsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      <circle cx="24.5" cy="9" r="3" fill="#7B83EB" />
      <path d="M20 14h8.5a1.5 1.5 0 0 1 1.5 1.5V22a5 5 0 0 1-5 5h-1a5 5 0 0 1-4-2z" fill="#7B83EB" />
      <circle cx="17" cy="8" r="4" fill="#5059C9" />
      <path d="M10 13.5h13a1.5 1.5 0 0 1 1.5 1.5v8a7.5 7.5 0 0 1-15 0v-8A1.5 1.5 0 0 1 10 13.5z" fill="#5059C9" />
      <rect x="3" y="9" width="15" height="15" rx="1.5" fill={TEAMS_PURPLE} />
      <path d="M6.5 13.2h8v2.1h-2.9V21h-2.2v-5.7H6.5z" fill="#fff" />
    </svg>
  );
}
export const BrandIcon = ({ channel, size }: { channel: Channel; size?: number }) => channel === 'teams' ? <TeamsIcon size={size} /> : <OutlookIcon size={size} />;
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
      style={{ lineHeight: 0, flexShrink: 0, cursor: onClick ? 'pointer' : undefined, display: 'inline-flex' }}>
      <BrandIcon channel={channel} size={size + 4} />
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
            <BrandIcon channel={c.key} size={15} />{c.label}
          </button>
        );
      })}
    </div>
  );
}
