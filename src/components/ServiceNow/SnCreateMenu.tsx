import { useEffect, useState } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { SnTemplate } from '../../types';
import { resolveSnFields, buildSnUrl, type SnResolvedField } from '../../servicenow';
import { itsmTicketUrl } from '../../itsm';

interface Props {
  onClose: () => void;
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', outline: 'none' };

function TypeBadge({ type }: { type: 'INC' | 'CHG' }) {
  const isInc = type === 'INC';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, letterSpacing: '0.05em',
      background: isInc ? 'var(--t-urgent-bg)' : 'var(--t-important-bg)',
      color: isInc ? 'var(--t-urgent)' : 'var(--t-important)',
    }}>{type}</span>
  );
}

// The #sncreate overlay: pick a ServiceNow template → the pre-filled create
// URL opens in a new tab. Templates whose merged field values contain "FILL"
// first show a fill-in step for those fields.
export function SnCreateMenu({ onClose }: Props) {
  const snConfig = useStore(s => s.snConfig);
  const itsmConfig = useStore(s => s.itsmConfig);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // FILL step: the picked template + its resolved fields awaiting user edits.
  const [fillTpl, setFillTpl] = useState<SnTemplate | null>(null);
  const [fillFields, setFillFields] = useState<SnResolvedField[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function open(tpl: SnTemplate, fields: SnResolvedField[]) {
    const url = buildSnUrl(snConfig, tpl.type, fields);
    if (!url) {
      setError(`No ${tpl.type} create URL configured — set it in Settings → ServiceNow Tickets.`);
      return;
    }
    window.open(url, '_blank');
    onClose();
  }

  function pick(tpl: SnTemplate) {
    setError(null);
    const fields = resolveSnFields(snConfig, tpl);
    // Pause before opening when there's something to see or do: FILL values
    // to replace, or instructions / a template number to follow in ServiceNow.
    if (fields.some(f => f.needsFill) || tpl.instructions.trim() || tpl.templateNumber.trim()) {
      setFillTpl(tpl);
      setFillFields(fields);
    } else {
      open(tpl, fields);
    }
  }

  const infoTpl = infoId ? snConfig.templates.find(t => t.id === infoId) : null;

  return (
    <div {...backdropCloseProps(onClose)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>Create ServiceNow ticket</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
        </div>

        {error && (
          <div style={{ margin: '10px 0', fontSize: 12.5, color: 'var(--t-urgent)', padding: '8px 12px', background: 'var(--t-urgent-bg)', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {fillTpl ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--t-muted)', margin: '2px 0 14px' }}>
              <b style={{ color: 'var(--t-txt2)' }}>{fillTpl.name || 'Template'}</b>
              {fillFields.some(f => f.needsFill) && <> — replace the <b>FILL</b> parts before opening.</>}
            </div>
            {(fillTpl.templateNumber.trim() || fillTpl.instructions.trim()) && (
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--t-important-bg)', border: '1px solid color-mix(in oklab, var(--t-important) 30%, var(--t-brd))', borderRadius: 8, fontSize: 12.5, color: 'var(--t-txt2)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {fillTpl.templateNumber.trim() && (
                  <div><b>Template #: {fillTpl.templateNumber}</b> — apply it in the ServiceNow form (the URL doesn't send it unless it's one of your fields).</div>
                )}
                {fillTpl.instructions.trim() && <div style={{ whiteSpace: 'pre-wrap' }}>{fillTpl.instructions}</div>}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {fillFields.map((f, i) => f.needsFill ? (
                <div key={f.key}>
                  <div style={lbl}>{f.label}</div>
                  <textarea
                    autoFocus={i === fillFields.findIndex(x => x.needsFill)}
                    value={f.value}
                    onChange={e => setFillFields(fs => fs.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x))}
                    rows={Math.min(6, Math.max(1, f.value.split('\n').length))}
                    style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              ) : null)}
            </div>
            {fillFields.some(f => !f.needsFill) && (
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--t-muted)' }}>
                Also sending: {fillFields.filter(f => !f.needsFill).map(f => f.key).join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => open(fillTpl, fillFields)}
                style={{ flex: 1, border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '9px 0', borderRadius: 8, cursor: 'pointer' }}>
                Open in ServiceNow ↗
              </button>
              <button onClick={() => { setFillTpl(null); setFillFields([]); }}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, cursor: 'pointer' }}>
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--t-muted)', margin: '2px 0 14px' }}>
              Pick a template — the pre-filled create form opens in a new tab. Paste the resulting ticket number into the card's ITSM field.
            </div>
            {snConfig.templates.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t-muted)', padding: '14px 0' }}>
                No templates yet — add them in <b>Settings → ServiceNow Tickets</b>.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {snConfig.templates.map(t => (
                  <div key={t.id} onClick={() => pick(t)}
                    style={{
                      width: 180, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                      background: infoId === t.id ? 'var(--t-acc-bg)' : 'var(--t-surf2)',
                      border: `1px solid ${infoId === t.id ? 'var(--t-acc)' : 'var(--t-brd)'}`,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <TypeBadge type={t.type} />
                      <span title="Template info"
                        onClick={e => { e.stopPropagation(); setInfoId(cur => cur === t.id ? null : t.id); }}
                        style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 13, lineHeight: 1 }}>ⓘ</span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t-txt)', lineHeight: 1.3 }}>
                      {t.name || 'Unnamed template'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {infoTpl && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 10, fontSize: 12.5, color: 'var(--t-txt2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {infoTpl.templateNumber && <div><b>Template #:</b> {infoTpl.templateNumber}</div>}
                {infoTpl.instructions && <div style={{ whiteSpace: 'pre-wrap' }}><b>Instructions:</b> {infoTpl.instructions}</div>}
                {infoTpl.confluenceLink && (
                  <div><b>Confluence:</b>{' '}
                    <a href={/^https?:\/\//i.test(infoTpl.confluenceLink) ? infoTpl.confluenceLink : `https://${infoTpl.confluenceLink}`} target="_blank" rel="noreferrer" style={{ color: 'var(--t-acc)' }}>
                      {infoTpl.confluenceLink} ↗
                    </a>
                  </div>
                )}
                {infoTpl.exampleTicket && (
                  <div><b>Example:</b>{' '}
                    {(() => {
                      const url = itsmTicketUrl(itsmConfig, infoTpl.exampleTicket);
                      return url
                        ? <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--t-acc)' }}>{infoTpl.exampleTicket} ↗</a>
                        : infoTpl.exampleTicket;
                    })()}
                  </div>
                )}
                {infoTpl.emailDL && (
                  <div><b>Email DL:</b>{' '}
                    <a href={`mailto:${infoTpl.emailDL}`} style={{ color: 'var(--t-acc)' }}>{infoTpl.emailDL}</a>
                  </div>
                )}
                {!infoTpl.templateNumber && !infoTpl.instructions && !infoTpl.confluenceLink && !infoTpl.exampleTicket && !infoTpl.emailDL && (
                  <div style={{ color: 'var(--t-muted)' }}>No info recorded for this template.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
