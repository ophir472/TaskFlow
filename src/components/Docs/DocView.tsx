import { useState, Fragment } from 'react';
import { useStore } from '../../store';
import { parseDoc, tokenizeInline, leafKeysOf, type Block } from '../../docBlocks';
import type { Task } from '../../types';

// Renders a Docs page (see docBlocks.ts for the markup). Two check modes:
//  • text  — ticking a box rewrites the line ([ ] ⇄ [x]) via onToggleLine
//  • daily — the page is a template; ticks live in today's agenda checks
//            (`dailyChecked` = leaf keys ticked today) via onToggleKeys.
// Links: [[Page title]] opens the page, [[t…]] / [[JIRA-1]] open the task.
interface Props {
  content: string;
  dailyChecked?: Set<string>;
  onToggleLine?: (lines: number | number[]) => void;
  onToggleKeys?: (keys: string[], on: boolean) => void;
  onOpenPage?: (pageId: string) => void;
  onOpenTask?: (taskId: string) => void;
  highlightKey?: string | null;      // keyboard focus in the checklist popup
  compact?: boolean;
}

type Ref = { kind: 'page' | 'task'; id: string; label: string } | null;

export function useDocLinkResolver(): (target: string) => Ref {
  const notebooks = useStore(s => s.notebooks);
  const items = useStore(s => s.items);
  return (target: string) => {
    const q = target.trim().toLowerCase();
    if (!q) return null;
    for (const nb of notebooks) for (const c of nb.categories) for (const p of c.pages) {
      if (p.title.trim().toLowerCase() === q || p.id === target.trim()) return { kind: 'page', id: p.id, label: p.title };
    }
    for (const it of items) {
      if (it.id === target.trim()) return { kind: 'task', id: it.id, label: it.title };
      if (it.kind === 'task') {
        const jira = ((it as Task).jiraLink ?? '').trim().toLowerCase();
        if (jira && (jira === q || jira.endsWith('/' + q))) return { kind: 'task', id: it.id, label: `${(it as Task).jiraLink} · ${it.title}` };
      }
    }
    for (const it of items) if (it.title.trim().toLowerCase() === q) return { kind: 'task', id: it.id, label: it.title };
    return null;
  };
}

export function DocView({ content, dailyChecked, onToggleLine, onToggleKeys, onOpenPage, onOpenTask, highlightKey, compact }: Props) {
  const [folded, setFolded] = useState<Set<number>>(new Set());     // headings folded (by line)
  const [open, setOpen] = useState<Set<number>>(new Set());          // toggles opened (by line)
  const resolve = useDocLinkResolver();
  const blocks = parseDoc(content);
  const daily = !!dailyChecked;

  const inline = (text: string) => tokenizeInline(text).map((tk, i) => {
    switch (tk.t) {
      case 'b': return <b key={i}>{tk.v}</b>;
      case 'i': return <i key={i}>{tk.v}</i>;
      case 's': return <s key={i} style={{ color: 'var(--t-muted)' }}>{tk.v}</s>;
      case 'code': return <code key={i} style={{ background: 'var(--t-surf3)', padding: '1px 5px', borderRadius: 4, fontSize: '0.92em' }}>{tk.v}</code>;
      case 'url': return <a key={i} href={tk.href} target="_blank" rel="noreferrer" onClick={e => { e.preventDefault(); window.open(tk.href, '_blank'); }} style={{ color: 'var(--t-acc)' }}>{tk.v}</a>;
      case 'ref': {
        const r = resolve(tk.v);
        if (!r) return <span key={i} title="No page or task with this name" style={{ color: 'var(--t-muted)', borderBottom: '1px dashed var(--t-muted)' }}>{tk.v}</span>;
        return (
          <span key={i} onClick={e => { e.stopPropagation(); if (r.kind === 'page') onOpenPage?.(r.id); else onOpenTask?.(r.id); }}
            title={r.kind === 'page' ? `Open page “${r.label}”` : `Open task “${r.label}”`}
            style={{ color: 'var(--t-acc)', cursor: 'pointer', fontWeight: 600, background: 'var(--t-acc-bg)', padding: '0 5px', borderRadius: 4 }}>
            {r.kind === 'page' ? '≡ ' : '☰ '}{tk.v}
          </span>
        );
      }
      default: return <Fragment key={i}>{tk.v}</Fragment>;
    }
  });

  const isChecked = (b: Block & { t: 'check' }): boolean => {
    const kids = b.children.filter(c => c.t === 'check') as (Block & { t: 'check' })[];
    if (kids.length) return kids.every(isChecked);
    return daily ? dailyChecked!.has(b.key) : b.checked;
  };
  const toggle = (b: Block & { t: 'check' }) => {
    if (daily) onToggleKeys?.(leafKeysOf(b), !isChecked(b));
    else if (b.children.some(c => c.t === 'check')) {
      // text mode, parent: flip every leaf line
      const on = !isChecked(b);
      const lines: number[] = [];
      const walk = (x: Block) => { if (x.t === 'check' && !x.children.some(c => c.t === 'check') && x.checked !== on) lines.push(x.line); x.children.forEach(walk); };
      walk(b);
      if (lines.length) onToggleLine?.(lines);
    } else onToggleLine?.(b.line);
  };

  const pad = compact ? 12 : 14;
  const chev = (on: boolean): React.CSSProperties => ({ display: 'inline-block', width: 14, cursor: 'pointer', color: 'var(--t-muted)', fontSize: 11, transform: on ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s', userSelect: 'none' });

  const render = (bs: Block[]): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let hideLevel = 0; // >0 while inside a folded heading
    for (const b of bs) {
      if (hideLevel) {
        if (b.t === 'heading' && b.level <= hideLevel) hideLevel = 0; else continue;
      }
      switch (b.t) {
        case 'heading': {
          const sizes = [19, 16.5, 14.5];
          const isFolded = folded.has(b.line);
          if (isFolded) hideLevel = b.level;
          out.push(
            <div key={b.line} style={{ display: 'flex', alignItems: 'baseline', gap: 2, fontSize: sizes[b.level - 1], fontWeight: 700, margin: `${b.level === 1 ? 14 : 10}px 0 4px`, letterSpacing: '-0.01em' }}>
              <span style={chev(isFolded)} title={isFolded ? 'Expand' : 'Collapse'}
                onClick={() => setFolded(prev => { const n = new Set(prev); if (n.has(b.line)) n.delete(b.line); else n.add(b.line); return n; })}>▸</span>
              <span>{inline(b.text)}</span>
            </div>,
          );
          if (b.children.length) out.push(<div key={`c${b.line}`} style={{ paddingLeft: 16 }}>{render(b.children)}</div>);
          break;
        }
        case 'check': {
          const checked = isChecked(b);
          const hi = highlightKey && leafKeysOf(b).includes(highlightKey) && !b.children.some(c => c.t === 'check');
          out.push(
            <div key={b.line} style={{ paddingLeft: pad }}>
              <div onClick={() => toggle(b)}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, cursor: 'pointer', padding: '2px 6px', marginLeft: -6, borderRadius: 6, outline: hi ? '2px solid var(--t-acc)' : 'none', outlineOffset: -1, userSelect: 'none' }}>
                <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 4, border: `1.5px solid ${checked ? 'var(--t-success)' : 'var(--t-muted)'}`, background: checked ? 'var(--t-success)' : 'transparent', color: 'white', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(2px)', transition: 'background 0.1s' }}>{checked ? '✓' : ''}</span>
                <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--t-muted)' : 'var(--t-txt)' }}>{inline(b.text)}</span>
              </div>
              {b.children.length > 0 && <div style={{ paddingLeft: 10 }}>{render(b.children)}</div>}
            </div>,
          );
          break;
        }
        case 'bullet':
          out.push(<div key={b.line} style={{ paddingLeft: pad }}><div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--t-muted)' }}>•</span><span>{inline(b.text)}</span></div>{b.children.length > 0 && <div style={{ paddingLeft: 10 }}>{render(b.children)}</div>}</div>);
          break;
        case 'num':
          out.push(<div key={b.line} style={{ paddingLeft: pad }}><div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--t-muted)', minWidth: 16 }}>{b.n}.</span><span>{inline(b.text)}</span></div>{b.children.length > 0 && <div style={{ paddingLeft: 10 }}>{render(b.children)}</div>}</div>);
          break;
        case 'toggle': {
          const isOpen = open.has(b.line);
          out.push(
            <div key={b.line} style={{ paddingLeft: pad }}>
              <div onClick={() => setOpen(prev => { const n = new Set(prev); if (n.has(b.line)) n.delete(b.line); else n.add(b.line); return n; })}
                style={{ display: 'flex', alignItems: 'baseline', gap: 6, cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: 12, color: 'var(--t-muted)', fontSize: 11, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
                <span>{inline(b.text)}</span>
                {!isOpen && b.children.length > 0 && <span style={{ fontSize: 11, color: 'var(--t-muted)', fontWeight: 500 }}>{b.children.filter(c => c.t !== 'blank').length} lines</span>}
              </div>
              {isOpen && <div style={{ paddingLeft: 18, borderLeft: '2px solid var(--t-brd2)', marginLeft: 5, marginTop: 2 }}>{b.children.length ? render(b.children) : <span style={{ color: 'var(--t-muted)', fontSize: 12.5 }}>Empty toggle — indent lines under it.</span>}</div>}
            </div>,
          );
          break;
        }
        case 'quote':
          out.push(<div key={b.line} style={{ marginLeft: pad, paddingLeft: 12, borderLeft: '3px solid var(--t-brd)', color: 'var(--t-txt2)', fontStyle: 'italic' }}>{inline(b.text)}{b.children.length > 0 && render(b.children)}</div>);
          break;
        case 'callout':
          out.push(
            <div key={b.line} style={{ margin: `6px 0 6px ${pad}px`, display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--t-amber-bg)', border: '1px solid color-mix(in oklab, var(--t-amber) 35%, transparent)' }}>
              <span style={{ fontSize: 16, lineHeight: 1.3 }}>{b.icon}</span>
              <div style={{ flex: 1 }}>{inline(b.text)}{b.children.length > 0 && <div style={{ marginTop: 4 }}>{render(b.children)}</div>}</div>
            </div>,
          );
          break;
        case 'divider': out.push(<hr key={b.line} style={{ border: 'none', borderTop: '1px solid var(--t-brd)', margin: '10px 0' }} />); break;
        case 'code':
          out.push(
            <pre key={b.line} style={{ margin: `6px 0 6px ${pad}px`, padding: '10px 12px', borderRadius: 8, background: 'var(--t-surf3)', fontSize: 12.5, lineHeight: 1.5, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {b.lang && <div style={{ fontSize: 10, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{b.lang}</div>}
              {b.code}
            </pre>,
          );
          break;
        case 'table':
          out.push(
            <div key={b.line} style={{ margin: `6px 0 6px ${pad}px`, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => ri === 0 && b.header
                        ? <th key={ci} style={{ textAlign: 'left', padding: '6px 10px', border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', fontWeight: 700 }}>{inline(c)}</th>
                        : <td key={ci} style={{ padding: '6px 10px', border: '1px solid var(--t-brd)' }}>{inline(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
          );
          break;
        case 'blank': out.push(<div key={b.line} style={{ height: 8 }} />); break;
        default:
          out.push(<div key={b.line} style={{ paddingLeft: pad }}>{inline(b.text)}{b.children.length > 0 && <div style={{ paddingLeft: 10 }}>{render(b.children)}</div>}</div>);
      }
    }
    return out;
  };

  return (
    <div style={{ fontSize: compact ? 13.5 : 14, lineHeight: 1.65, color: 'var(--t-txt)' }}>
      {render(blocks)}
      {content.trim() === '' && <div style={{ color: 'var(--t-muted)', fontSize: 13, paddingLeft: pad }}>Nothing here yet — write on the left. Type <b>/</b> for blocks.</div>}
    </div>
  );
}
