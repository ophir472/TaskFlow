import { useState } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { fillPromptTemplate, callAi } from '../../ai';

interface Props {
  task: Task;
  onClose: () => void;
}

// "Assign to AI" from the table: shows the filled prompt template for a final
// edit, sends it to the configured endpoint, displays the reply ONCE. The
// full reply is written to the forensic log — nothing is saved on the task.
export function AiAssignModal({ task, onClose }: Props) {
  const aiConfig = useStore(s => s.aiConfig);
  const configured = !!aiConfig.endpointUrl.trim() && !!aiConfig.model.trim();
  const [prompt, setPrompt] = useState(() => fillPromptTemplate(aiConfig.promptTemplate, task));
  const [phase, setPhase] = useState<'edit' | 'sending' | 'done' | 'err'>('edit');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function send() {
    setPhase('sending');
    setError('');
    try {
      const text = await callAi(aiConfig, prompt, task.id, task.title);
      setResult(text);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('err');
    }
  }

  const endpointHost = (() => {
    try { return new URL(aiConfig.endpointUrl).host; } catch { return aiConfig.endpointUrl; }
  })();

  return (
    <div {...backdropCloseProps(() => { if (phase !== 'sending') onClose(); })}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 680, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ✦ Assign to AI — {task.title}
          </div>
          {phase !== 'sending' && <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1, flexShrink: 0, marginLeft: 12 }}>×</span>}
        </div>

        {!configured ? (
          <div style={{ fontSize: 13, color: 'var(--t-muted)', padding: '18px 0 6px' }}>
            No AI endpoint configured — set the endpoint URL and model in <b>Settings → Integrations → AI Assignment</b>.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--t-muted)', marginBottom: 12 }}>
              {aiConfig.model} · {aiConfig.format === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'} · {endpointHost}
            </div>

            {phase === 'edit' && (
              <>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={14}
                  style={{ width: '100%', fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <button onClick={send}
                    style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '9px 18px', borderRadius: 8, cursor: 'pointer' }}>
                    Send ✦
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>
                    The reply is shown once and written to the log file — nothing is saved on the task.
                  </span>
                </div>
              </>
            )}

            {phase === 'sending' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '26px 0', fontSize: 13.5, color: 'var(--t-txt2)' }}>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 16, color: 'var(--t-acc)' }}>⟳</span>
                Sending to {aiConfig.model}…
              </div>
            )}

            {phase === 'done' && (
              <>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)' }}>
                  {result}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <button onClick={() => { navigator.clipboard.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                    style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <button onClick={onClose}
                    style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
                    Close
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>
                    Written to today's log file. Closing discards it from the app.
                  </span>
                </div>
              </>
            )}

            {phase === 'err' && (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--t-urgent)', padding: '10px 12px', background: 'var(--t-urgent-bg)', borderRadius: 8 }}>
                  {error}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setPhase('edit')}
                    style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
                    Back to prompt
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
