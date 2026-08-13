import { useState } from 'react';
import { useStore } from '../../store';
import type { AiApiFormat } from '../../types';
import { DEFAULT_AI_PROMPT } from '../../ai';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const fi: React.CSSProperties = { fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box' };
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--t-muted)', marginTop: 4, lineHeight: 1.45 };

// Commit-on-blur so typing doesn't spam the store / version history.
function Draft({ value, onCommit, placeholder, style, type, multiline }: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  type?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cur = draft ?? value;
  const commit = () => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); };
  if (multiline) {
    return (
      <textarea value={cur} onChange={e => setDraft(e.target.value)} onBlur={commit}
        placeholder={placeholder} rows={Math.min(12, Math.max(4, cur.split('\n').length))}
        style={{ ...fi, resize: 'vertical', fontFamily: 'inherit', ...style }} />
    );
  }
  return (
    <input value={cur} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      type={type} placeholder={placeholder} style={{ ...fi, ...style }} />
  );
}

export function AiSection() {
  const aiConfig = useStore(s => s.aiConfig);
  const setAiConfig = useStore(s => s.setAiConfig);

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 4 }}>AI Assignment</div>
      <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 14 }}>
        Select a row in the table → <b>✦ Assign to AI</b> sends the task to this endpoint. The reply is shown once and written to the log file — nothing is stored on the task, and no button appears on cards. Works with any HTTP gateway your organization exposes (paste the full URL); the format only decides body shape and auth header.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={fl}>Endpoint URL (full, POSTed as-is)</div>
          <Draft value={aiConfig.endpointUrl} onCommit={v => setAiConfig({ endpointUrl: v })}
            placeholder="https://ai-gateway.myorg.com/v1/chat/completions" />
        </div>
        <div>
          <div style={fl}>Format</div>
          <select value={aiConfig.format} onChange={e => setAiConfig({ format: e.target.value as AiApiFormat })}
            style={{ ...fi, cursor: 'pointer' }}>
            <option value="openai">OpenAI-compatible (Bearer token)</option>
            <option value="anthropic">Anthropic (x-api-key)</option>
          </select>
        </div>
        <div>
          <div style={fl}>Model</div>
          <Draft value={aiConfig.model} onCommit={v => setAiConfig({ model: v })}
            placeholder="claude-opus-4-7 / gpt-4o / gateway model id" />
        </div>
        <div>
          <div style={fl}>API Key / Token</div>
          <Draft value={aiConfig.apiKey} onCommit={v => setAiConfig({ apiKey: v })}
            type="password" placeholder="Paste the token your gateway accepts" />
        </div>
        <div>
          <div style={fl}>Extra Headers (JSON, optional)</div>
          <Draft value={aiConfig.extraHeaders} onCommit={v => setAiConfig({ extraHeaders: v })}
            placeholder='{"X-Org-Route": "claude"}' />
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={fl}>Prompt Template</div>
          {aiConfig.promptTemplate !== DEFAULT_AI_PROMPT && (
            <span onClick={() => setAiConfig({ promptTemplate: DEFAULT_AI_PROMPT })}
              style={{ fontSize: 11, color: 'var(--t-acc)', cursor: 'pointer' }}>Reset to default</span>
          )}
        </div>
        <Draft multiline value={aiConfig.promptTemplate} onCommit={v => setAiConfig({ promptTemplate: v })} />
        <div style={hint}>
          Tokens filled from the task: <b>&lt;TITLE&gt;</b> <b>&lt;DESCRIPTION&gt;</b> <b>&lt;NOTES&gt;</b> <b>&lt;BLOCKERS&gt;</b> <b>&lt;SUBTASKS&gt;</b> <b>&lt;JIRA&gt;</b> <b>&lt;ITSM&gt;</b> <b>&lt;LINK&gt;</b> <b>&lt;REQUESTER&gt;</b> <b>&lt;PROJECT&gt;</b>. You can still edit the filled prompt before each send.
        </div>
      </div>
    </div>
  );
}
