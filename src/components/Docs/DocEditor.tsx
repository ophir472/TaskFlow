import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';

// Notion-style editing on a plain textarea (the page stays text):
//  • "/" at the start of a line → block menu (↑↓ Enter Esc, type to filter)
//  • "[[" → link picker over pages and tasks (same keys)
//  • Enter continues a list / to-do / number; Enter on an empty item ends it
//  • Tab / Shift+Tab indent / outdent the current line(s)
//  • ⌘B ⌘I ⌘E ⌘⇧X wrap the selection (bold / italic / code / strike)
//  • ⌘Enter ticks the to-do on the current line
interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

const SLASH_ITEMS: { label: string; hint: string; icon: string; insert: string | 'link'; caret?: number }[] = [
  { label: 'To-do', hint: 'Checkbox — nest with Tab; a parent ticks when its children do', icon: '☐', insert: '- [ ] ' },
  { label: 'Heading 1', hint: 'Big section title, folds', icon: 'H1', insert: '# ' },
  { label: 'Heading 2', hint: 'Sub-section, folds', icon: 'H2', insert: '## ' },
  { label: 'Heading 3', hint: 'Small heading, folds', icon: 'H3', insert: '### ' },
  { label: 'Bullet list', hint: 'Plain bullet', icon: '•', insert: '- ' },
  { label: 'Numbered list', hint: 'Enter continues the numbering', icon: '1.', insert: '1. ' },
  { label: 'Toggle', hint: 'Collapsible — indent the lines under it', icon: '▸', insert: '▸ ' },
  { label: 'Callout', hint: 'Highlighted box; first emoji becomes the icon', icon: '💡', insert: '!! 💡 ' },
  { label: 'Quote', hint: 'Indented quote', icon: '❝', insert: '> ' },
  { label: 'Divider', hint: 'Horizontal rule', icon: '—', insert: '---\n' },
  { label: 'Code block', hint: 'Monospace block', icon: '</>', insert: '```\n\n```', caret: 4 },
  { label: 'Table', hint: 'Pipe table; the |---| row makes a header', icon: '▦', insert: '| Column | Column |\n| --- | --- |\n|  |  |', caret: 2 },
  { label: 'Link to page / task', hint: '[[Page title]] or [[JIRA-1]] — opens it from the page', icon: '⧉', insert: 'link' },
];

export function DocEditor({ value, onChange, placeholder, style }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const notebooks = useStore(s => s.notebooks);
  const items = useStore(s => s.items);
  const [menu, setMenu] = useState<{ kind: 'slash' | 'link'; start: number; q: string; top: number } | null>(null);
  const [hi, setHi] = useState(0);

  const lineHeightPx = 21.6; // 13.5px * 1.6 — used to place the menu under the caret's line
  const menuTop = (pos: number) => {
    const ta = ref.current; if (!ta) return 0;
    const lineIdx = value.slice(0, pos).split('\n').length - 1;
    return Math.max(0, 12 + (lineIdx + 1) * lineHeightPx - ta.scrollTop);
  };

  // Detect triggers from what sits before the caret.
  function detect(next: string, caret: number) {
    const before = next.slice(0, caret);
    const slash = /(^|\n)[ \t]*\/([^\s/]*)$/.exec(before);
    if (slash) { setMenu({ kind: 'slash', start: caret - slash[2].length - 1, q: slash[2], top: menuTop(caret) }); setHi(0); return; }
    const link = /\[\[([^\]\n]*)$/.exec(before);
    if (link) { setMenu({ kind: 'link', start: caret - link[1].length - 2, q: link[1], top: menuTop(caret) }); setHi(0); return; }
    setMenu(null);
  }

  function setValue(next: string, caret: number) {
    onChange(next);
    requestAnimationFrame(() => { const ta = ref.current; if (ta) { ta.focus(); ta.setSelectionRange(caret, caret); } });
  }

  const linkOptions = (() => {
    if (menu?.kind !== 'link') return [];
    const q = menu.q.trim().toLowerCase();
    const pages: { label: string; sub: string; ins: string }[] = [];
    notebooks.forEach(nb => nb.categories.forEach(c => c.pages.forEach(p => pages.push({ label: p.title, sub: `${nb.name} › ${c.name}`, ins: p.title }))));
    const tasks = items.filter(it => it.kind === 'task' && !it.archived).map(it => {
      const t = it as Task;
      return { label: t.title, sub: [t.jiraLink, t.requester, t.project].filter(Boolean).join(' · ') || 'task', ins: (t.jiraLink ?? '').trim() || t.id };
    });
    const all = [...pages.map(p => ({ ...p, icon: '≡' })), ...tasks.map(t => ({ ...t, icon: '☰' }))];
    return (q ? all.filter(o => `${o.label} ${o.sub}`.toLowerCase().includes(q)) : all).slice(0, 12);
  })();
  const slashOptions = menu?.kind === 'slash'
    ? SLASH_ITEMS.filter(o => !menu.q || o.label.toLowerCase().includes(menu.q.toLowerCase()))
    : [];
  const optionCount = menu?.kind === 'slash' ? slashOptions.length : linkOptions.length;
  useEffect(() => { if (hi >= optionCount) setHi(0); }, [optionCount, hi]);

  function applySlash(o: typeof SLASH_ITEMS[number]) {
    if (!menu) return;
    const ta = ref.current!;
    const caret = ta.selectionStart;
    if (o.insert === 'link') {
      const next = value.slice(0, menu.start) + '[[' + value.slice(caret);
      onChange(next);
      const pos = menu.start + 2;
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos); });
      setMenu({ kind: 'link', start: menu.start, q: '', top: menu.top }); setHi(0);
      return;
    }
    const next = value.slice(0, menu.start) + o.insert + value.slice(caret);
    setValue(next, menu.start + (o.caret ?? o.insert.length));
    setMenu(null);
  }
  function applyLink(o: { ins: string }) {
    if (!menu) return;
    const ta = ref.current!;
    const caret = ta.selectionStart;
    const after = value.slice(caret).startsWith(']]') ? value.slice(caret + 2) : value.slice(caret);
    const tok = `[[${o.ins}]]`;
    setValue(value.slice(0, menu.start) + tok + after, menu.start + tok.length);
    setMenu(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    if (menu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % Math.max(optionCount, 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h - 1 + Math.max(optionCount, 1)) % Math.max(optionCount, 1)); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(null); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (menu.kind === 'slash' && slashOptions[hi]) { e.preventDefault(); applySlash(slashOptions[hi]); return; }
        if (menu.kind === 'link' && linkOptions[hi]) { e.preventDefault(); applyLink(linkOptions[hi]); return; }
      }
    }
    const start = ta.selectionStart, end = ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = value.indexOf('\n', start);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const line = value.slice(lineStart, lineEnd);
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === 'Enter' && !mod && !e.shiftKey && start === end) {
      const m = /^([ \t]*)(- \[[ xX]\] |[-*] |(\d+)[.)] |▸ |> )(.*)$/.exec(line);
      if (m) {
        e.preventDefault();
        if (m[4].trim() === '' && start >= lineEnd) {
          // empty item → end the list (drop the prefix)
          setValue(value.slice(0, lineStart) + m[1] + value.slice(lineEnd), lineStart + m[1].length);
          return;
        }
        let prefix = m[2];
        if (m[3]) prefix = `${Number(m[3]) + 1}. `;
        if (prefix.startsWith('- [')) prefix = '- [ ] ';
        if (prefix === '▸ ') prefix = '  ';               // body of a toggle
        const ins = '\n' + m[1] + prefix;
        setValue(value.slice(0, start) + ins + value.slice(end), start + ins.length);
        return;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const selStartLine = value.lastIndexOf('\n', start - 1) + 1;
      const selEndIdx = value.indexOf('\n', Math.max(end - 1, start));
      const selEnd = selEndIdx === -1 ? value.length : selEndIdx;
      const chunk = value.slice(selStartLine, selEnd);
      const lines = chunk.split('\n');
      const next = e.shiftKey ? lines.map(l => l.replace(/^(  |\t)/, '')) : lines.map(l => '  ' + l);
      const delta0 = e.shiftKey ? -(lines[0].match(/^(  |\t)/) ? (lines[0].startsWith('\t') ? 1 : 2) : 0) : 2;
      const joined = next.join('\n');
      const nv = value.slice(0, selStartLine) + joined + value.slice(selEnd);
      onChange(nv);
      const ns = Math.max(selStartLine, start + delta0);
      const ne = start === end ? ns : selStartLine + joined.length;
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ns, ne); });
      return;
    }
    if (mod && e.key === 'Enter') {
      const m = /^([ \t]*[-*] \[)([ xX])(\] .*)$/.exec(line);
      if (m) { e.preventDefault(); const nl = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3]; setValue(value.slice(0, lineStart) + nl + value.slice(lineEnd), start); }
      return;
    }
    const wrap = (l: string, r = l) => {
      e.preventDefault();
      const sel = value.slice(start, end);
      const nv = value.slice(0, start) + l + sel + r + value.slice(end);
      onChange(nv);
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + l.length, end + l.length); });
    };
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') return wrap('**');
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') return wrap('*');
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'e') return wrap('`');
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') return wrap('~~');
  }

  const rowSt = (on: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', cursor: 'pointer', background: on ? 'var(--t-surf2)' : 'transparent' });

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
      <textarea
        ref={ref}
        value={value}
        onChange={e => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={onKeyDown}
        onClick={() => setMenu(null)}
        onBlur={() => setTimeout(() => setMenu(null), 120)}
        placeholder={placeholder}
        spellCheck={false}
        style={style} />
      {menu && optionCount > 0 && (
        <div onMouseDown={e => e.preventDefault()}
          style={{ position: 'absolute', left: 16, top: menu.top, zIndex: 40, width: 360, maxHeight: 320, overflowY: 'auto', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '4px 0' }}>
          <div style={{ padding: '4px 12px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {menu.kind === 'slash' ? 'Blocks' : 'Link to a page or task'}
          </div>
          {menu.kind === 'slash' ? slashOptions.map((o, i) => (
            <div key={o.label} onClick={() => applySlash(o)} onMouseEnter={() => setHi(i)} style={rowSt(hi === i)}>
              <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--t-surf3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--t-txt2)', flexShrink: 0 }}>{o.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-txt)' }}>{o.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--t-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.hint}</div>
              </div>
            </div>
          )) : linkOptions.map((o, i) => (
            <div key={o.icon + o.ins + i} onClick={() => applyLink(o)} onMouseEnter={() => setHi(i)} style={rowSt(hi === i)}>
              <span style={{ width: 22, color: 'var(--t-muted)', fontSize: 13, textAlign: 'center' }}>{o.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--t-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sub}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '6px 12px 2px', fontSize: 11, color: 'var(--t-muted)', display: 'flex', gap: 10 }}>
            <span><kbd style={{ fontFamily: 'inherit' }}>↑↓</kbd> move</span><span><kbd style={{ fontFamily: 'inherit' }}>↵</kbd> insert</span><span><kbd style={{ fontFamily: 'inherit' }}>esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
