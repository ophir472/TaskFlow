import type { JiraConfig } from '../../types';

// Acceptance criteria + story points in the Create-in-Jira prompt — shared by
// the card/popup prompt (TicketSections) and the review's Create Jira step.
// Scrum team and epic are host defaults (Settings), shown read-only here so
// it's clear what the ticket will get.
interface Props {
  config: JiraConfig;
  acceptance: string;
  onAcceptance: (v: string) => void;
  points: string;
  onPoints: (v: string) => void;
  onEscape?: () => void;
  size?: 'sm' | 'md';
}

export function JiraCreateExtras({ config, acceptance, onAcceptance, points, onPoints, onEscape, size = 'sm' }: Props) {
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: size === 'md' ? 6 : 4 };
  const inp: React.CSSProperties = { width: '100%', fontSize: 13, padding: size === 'md' ? '8px 10px' : '7px 9px', borderRadius: size === 'md' ? 8 : 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
  const off = (id?: string) => !id?.trim();
  const note = (id?: string) => off(id) ? <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t-amber)' }}> — not sent: set its field id in Settings → Integrations</span> : null;
  const esc = (e: React.KeyboardEvent) => { if (e.key === 'Escape') onEscape?.(); };
  const chips = [
    config.defaultScrumTeam?.trim() ? { k: 'Scrum team', v: config.defaultScrumTeam.trim(), off: off(config.scrumTeamFieldId) } : null,
    config.defaultEpic?.trim() ? { k: 'Epic', v: config.defaultEpic.trim(), off: off(config.epicFieldId) } : null,
  ].filter((c): c is { k: string; v: string; off: boolean } => !!c);
  return (
    <div style={{ marginTop: 8, marginBottom: size === 'md' ? 12 : 0 }}>
      <div style={lbl}>Acceptance criteria{note(config.acceptanceCriteriaFieldId)}</div>
      <textarea value={acceptance} onChange={e => onAcceptance(e.target.value)} onKeyDown={esc} rows={2}
        placeholder="Defaults to the task title" style={{ ...inp, resize: 'vertical', marginBottom: 8 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ width: 110 }}>
          <div style={lbl}>Story points</div>
          <input type="number" min={0} step={0.5} value={points} onChange={e => onPoints(e.target.value)} onKeyDown={esc} style={inp} />
        </div>
        {off(config.storyPointsFieldId) && <div style={{ fontSize: 11, color: 'var(--t-amber)', paddingBottom: 9 }}>not sent: set its field id in Settings</div>}
        {chips.map(c => (
          <span key={c.k} title={c.off ? 'Not sent — set the field id in Settings → Integrations' : 'Host default (Settings → Integrations)'}
            style={{ fontSize: 11.5, padding: '5px 9px', borderRadius: 999, marginBottom: 3, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: c.off ? 'var(--t-amber)' : 'var(--t-txt2)', whiteSpace: 'nowrap' }}>
            <b>{c.k}:</b> {c.v}
          </span>
        ))}
      </div>
    </div>
  );
}
