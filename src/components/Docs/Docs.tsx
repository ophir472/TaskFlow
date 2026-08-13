import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { DocNotebook, DocCategory, DocPage } from '../../types';
import { useLogMount } from '../../useLogMount';

// ── helpers ─────────────────────────────────────────────────────

function pageIdFromHash(): string | null {
  const parts = window.location.hash.slice(1).split('/');
  return parts[0] === 'docs' && parts[1] ? parts[1] : null;
}

function findPage(notebooks: DocNotebook[], pageId: string): { nb: DocNotebook; cat: DocCategory; page: DocPage } | null {
  for (const nb of notebooks) {
    for (const cat of nb.categories) {
      const page = cat.pages.find(p => p.id === pageId);
      if (page) return { nb, cat, page };
    }
  }
  return null;
}

// Minimal inline formatting: **bold**, `code`, bare URLs become links.
function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<b key={k++}>{tok.slice(2, -2)}</b>);
    else if (tok.startsWith('`')) out.push(<code key={k++} style={{ background: 'var(--t-surf3)', padding: '1px 5px', borderRadius: 4, fontSize: '0.92em' }}>{tok.slice(1, -1)}</code>);
    else out.push(<a key={k++} href={tok} target="_blank" rel="noreferrer" style={{ color: 'var(--t-acc)' }}>{tok}</a>);
    lastIdx = m.index + tok.length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

// ── doc preview (markdown-lite, headings fold, checkboxes toggle) ──

function DocPreview({ content, onToggleLine }: { content: string; onToggleLine: (lineIdx: number) => void }) {
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const lines = content.split('\n');

  // Folding a heading hides everything until the next heading of the same or
  // higher level.
  const hidden = new Set<number>();
  folded.forEach(idx => {
    const m = /^(#{1,3})\s/.exec(lines[idx] ?? '');
    if (!m) return;
    const level = m[1].length;
    for (let j = idx + 1; j < lines.length; j++) {
      const hm = /^(#{1,3})\s/.exec(lines[j]);
      if (hm && hm[1].length <= level) break;
      hidden.add(j);
    }
  });

  const chev = (on: boolean): React.CSSProperties => ({ display: 'inline-block', width: 14, cursor: 'pointer', color: 'var(--t-muted)', fontSize: 11, transform: on ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s', userSelect: 'none' });

  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--t-txt)' }}>
      {lines.map((line, i) => {
        if (hidden.has(i)) return null;
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h) {
          const level = h[1].length;
          const sizes = [19, 16.5, 14.5];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 2, fontSize: sizes[level - 1], fontWeight: 700, margin: `${level === 1 ? 14 : 10}px 0 4px`, letterSpacing: '-0.01em' }}>
              <span style={chev(folded.has(i))} title={folded.has(i) ? 'Expand' : 'Collapse'}
                onClick={() => setFolded(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>▸</span>
              <span>{renderInline(h[2])}</span>
            </div>
          );
        }
        const cb = /^(\s*)- \[([ x])\]\s?(.*)$/.exec(line);
        if (cb) {
          const checked = cb[2] === 'x';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7, paddingLeft: 14 + cb[1].length * 8 }}>
              <span onClick={() => onToggleLine(i)} style={{ cursor: 'pointer', color: checked ? 'oklch(0.5 0.13 150)' : 'var(--t-muted)', fontSize: 14, userSelect: 'none' }}>
                {checked ? '☑' : '☐'}
              </span>
              <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--t-muted)' : 'var(--t-txt)' }}>{renderInline(cb[3])}</span>
            </div>
          );
        }
        const bullet = /^(\s*)-\s+(.*)$/.exec(line);
        if (bullet) {
          return <div key={i} style={{ display: 'flex', gap: 7, paddingLeft: 14 + bullet[1].length * 8 }}><span style={{ color: 'var(--t-muted)' }}>•</span><span>{renderInline(bullet[2])}</span></div>;
        }
        const num = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
        if (num) {
          return <div key={i} style={{ display: 'flex', gap: 7, paddingLeft: 14 + num[1].length * 8 }}><span style={{ color: 'var(--t-muted)', minWidth: 16 }}>{num[2]}.</span><span>{renderInline(num[3])}</span></div>;
        }
        if (/^---+\s*$/.test(line)) return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--t-brd)', margin: '10px 0' }} />;
        if (line.trim() === '') return <div key={i} style={{ height: 10 }} />;
        return <div key={i} style={{ paddingLeft: 14 }}>{renderInline(line)}</div>;
      })}
      {content.trim() === '' && <div style={{ color: 'var(--t-muted)', fontSize: 13, paddingLeft: 14 }}>Nothing here yet — write on the left.</div>}
    </div>
  );
}

// ── links board preview ("NAME: URL" lines → clickable squares) ──

function LinksPreview({ content }: { content: string }) {
  const entries = content.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const ci = l.indexOf(':');
      if (ci <= 0) return null;
      const name = l.slice(0, ci).trim();
      let url = l.slice(ci + 1).trim();
      if (!name || !url) return null;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      return { name, url };
    })
    .filter((e): e is { name: string; url: string } => e !== null);

  if (entries.length === 0) {
    return <div style={{ color: 'var(--t-muted)', fontSize: 13 }}>No links yet — one per line on the left: <b>Name: address</b></div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {entries.map((e, i) => {
        let domain = '';
        try { domain = new URL(e.url).host.replace(/^www\./, ''); } catch { /* ignore */ }
        return (
          <div key={i} onClick={() => window.open(e.url, '_blank')} title={e.url}
            style={{ width: 118, height: 86, boxSizing: 'border-box', padding: '12px 10px', borderRadius: 10, cursor: 'pointer', background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6, textAlign: 'center', transition: 'border-color 0.12s, background 0.12s' }}
            onMouseEnter={ev => { ev.currentTarget.style.borderColor = 'var(--t-acc)'; ev.currentTarget.style.background = 'var(--t-acc-bg)'; }}
            onMouseLeave={ev => { ev.currentTarget.style.borderColor = 'var(--t-brd)'; ev.currentTarget.style.background = 'var(--t-surf2)'; }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-txt)', lineHeight: 1.25, wordBreak: 'break-word' }}>{e.name}</div>
            {domain && <div style={{ fontSize: 10.5, color: 'var(--t-muted)', wordBreak: 'break-all' }}>{domain} ↗</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── column building blocks ──────────────────────────────────────

function ColumnAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [v, setV] = useState('');
  const submit = () => { if (v.trim()) { onAdd(v.trim()); setV(''); } };
  return (
    <input value={v} onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') submit(); }}
      placeholder={placeholder}
      style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '6px 9px', borderRadius: 6, border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-txt)', outline: 'none', marginTop: 6 }} />
  );
}

function RowName({ name, onRename }: { name: string; onRename: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim() && draft !== name) onRename(draft.trim()); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
        onClick={e => e.stopPropagation()}
        style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '2px 5px', borderRadius: 4, border: '1px solid var(--t-acc)', background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none' }} />
    );
  }
  return (
    <span onDoubleClick={e => { e.stopPropagation(); setDraft(name); setEditing(true); }}
      title="Double-click to rename"
      style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {name}
    </span>
  );
}

// ── main view ───────────────────────────────────────────────────

export function Docs() {
  useLogMount('Docs');
  const notebooks = useStore(s => s.notebooks);
  const addNotebook = useStore(s => s.addNotebook);
  const renameNotebook = useStore(s => s.renameNotebook);
  const removeNotebook = useStore(s => s.removeNotebook);
  const addDocCategory = useStore(s => s.addDocCategory);
  const renameDocCategory = useStore(s => s.renameDocCategory);
  const removeDocCategory = useStore(s => s.removeDocCategory);
  const addDocPage = useStore(s => s.addDocPage);
  const renameDocPage = useStore(s => s.renameDocPage);
  const removeDocPage = useStore(s => s.removeDocPage);
  const setDocPageContent = useStore(s => s.setDocPageContent);

  const [nbId, setNbId] = useState<string | null>(null);
  const [catId, setCatId] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(() => pageIdFromHash());
  const [mode, setMode] = useState<'edit' | 'split' | 'view'>('split');

  // Page selection lives in the URL (#docs/<pageId>) — back/forward and
  // refresh keep the spot.
  useEffect(() => {
    const onHash = () => setPageId(pageIdFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Selecting a page via URL also selects its notebook + category.
  useEffect(() => {
    if (!pageId) return;
    const loc = findPage(notebooks, pageId);
    if (loc) { setNbId(loc.nb.id); setCatId(loc.cat.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const nb = notebooks.find(n => n.id === nbId) ?? notebooks[0] ?? null;
  const cat = nb?.categories.find(c => c.id === catId) ?? nb?.categories[0] ?? null;
  const page = cat?.pages.find(p => p.id === pageId) ?? null;

  function openPage(id: string) {
    if (pageIdFromHash() !== id) window.location.hash = `docs/${id}`;
  }

  // Content draft: local per keystroke, debounced into the store (500ms) so
  // typing doesn't serialize the whole store per key. Preview renders the
  // draft, so it's always live.
  const [draft, setDraft] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef<{ pageId: string; content: string } | null>(null);
  useEffect(() => {
    setDraft(page?.content ?? '');
    dirtyRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id]);
  useEffect(() => () => {
    // Flush pending edits on unmount / page switch.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirtyRef.current) setDocPageContent(dirtyRef.current.pageId, dirtyRef.current.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id]);
  // Abrupt tab close / switch must not lose the debounced draft: flush it
  // synchronously (zustand → localStorage is sync) on beforeunload + hide.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirtyRef.current) { setDocPageContent(dirtyRef.current.pageId, dirtyRef.current.content); dirtyRef.current = null; }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeDraft(v: string) {
    if (!page) return;
    setDraft(v);
    dirtyRef.current = { pageId: page.id, content: v };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (dirtyRef.current) { setDocPageContent(dirtyRef.current.pageId, dirtyRef.current.content); dirtyRef.current = null; }
    }, 500);
  }
  function toggleLine(lineIdx: number) {
    if (!page) return;
    const lines = draft.split('\n');
    const line = lines[lineIdx] ?? '';
    lines[lineIdx] = line.includes('[ ]') ? line.replace('[ ]', '[x]') : line.replace('[x]', '[ ]');
    const next = lines.join('\n');
    setDraft(next);
    dirtyRef.current = null;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDocPageContent(page.id, next);
  }

  const colHdr: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 2px 6px' };
  const rowSt = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 9px', borderRadius: 7, cursor: 'pointer',
    background: active ? 'var(--t-acc-bg)' : 'transparent',
    color: active ? 'var(--t-acc-dk)' : 'var(--t-txt2)',
    fontWeight: active ? 600 : 500,
  });
  const xSt: React.CSSProperties = { cursor: 'pointer', color: 'var(--t-muted)', fontSize: 13, lineHeight: 1, flexShrink: 0, opacity: 0.7 };
  const modeBtn = (active: boolean): React.CSSProperties => ({
    border: 'none', background: active ? 'var(--t-surf)' : 'transparent', color: active ? 'var(--t-txt)' : 'var(--t-muted)',
    fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
  });

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '0 36px 24px', gap: 0 }}>
      {/* ── Notebooks + categories column ── */}
      <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, paddingRight: 14, borderRight: '1px solid var(--t-brd)' }}>
        <div style={colHdr}>Notebooks</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {notebooks.map(n => (
            <div key={n.id} style={rowSt(nb?.id === n.id)}
              onClick={() => { setNbId(n.id); setCatId(null); }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>▤</span>
              <RowName name={n.name} onRename={v => renameNotebook(n.id, v)} />
              <span style={xSt} title="Delete notebook"
                onClick={e => { e.stopPropagation(); if (confirm(`Delete notebook "${n.name}" and everything in it?`)) removeNotebook(n.id); }}>×</span>
            </div>
          ))}
        </div>
        <ColumnAdd placeholder="+ Notebook" onAdd={addNotebook} />

        {nb && (
          <>
            <div style={{ ...colHdr, marginTop: 18 }}>Categories</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
              {nb.categories.map(c => (
                <div key={c.id} style={rowSt(cat?.id === c.id)}
                  onClick={() => setCatId(c.id)}>
                  <RowName name={c.name} onRename={v => renameDocCategory(nb.id, c.id, v)} />
                  <span style={{ fontSize: 11, color: 'var(--t-muted)', flexShrink: 0 }}>{c.pages.length}</span>
                  <span style={xSt} title="Delete category"
                    onClick={e => { e.stopPropagation(); if (confirm(`Delete category "${c.name}" and its ${c.pages.length} page(s)?`)) removeDocCategory(nb.id, c.id); }}>×</span>
                </div>
              ))}
            </div>
            <ColumnAdd placeholder="+ Category" onAdd={name => addDocCategory(nb.id, name)} />
          </>
        )}
      </div>

      {/* ── Pages column ── */}
      {nb && cat && (
        <div style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 14px', borderRight: '1px solid var(--t-brd)' }}>
          <div style={colHdr}>{cat.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
            {cat.pages.map(p => (
              <div key={p.id} style={rowSt(page?.id === p.id)} onClick={() => openPage(p.id)}>
                <span style={{ fontSize: 11, flexShrink: 0 }}>{p.type === 'links' ? '⊞' : '≡'}</span>
                <RowName name={p.title} onRename={v => renameDocPage(p.id, v)} />
                <span style={xSt} title="Delete page"
                  onClick={e => { e.stopPropagation(); if (confirm(`Delete page "${p.title}"?`)) removeDocPage(p.id); }}>×</span>
              </div>
            ))}
          </div>
          <ColumnAdd placeholder="+ Page" onAdd={title => openPage(addDocPage(nb.id, cat.id, title, 'doc'))} />
          <ColumnAdd placeholder="+ Links board" onAdd={title => openPage(addDocPage(nb.id, cat.id, title, 'links'))} />
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, paddingLeft: 18 }}>
        {!page ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--t-muted)', fontSize: 13.5, lineHeight: 1.7 }}>
            {notebooks.length === 0
              ? <>Create a <b>notebook</b> on the left to get started.<br />Then a category, then pages — like OneNote.</>
              : !cat
                ? <>Add a <b>category</b> to {nb ? <b>{nb.name}</b> : 'the notebook'}.</>
                : <>Select or create a <b>page</b>.<br /><span style={{ fontSize: 12 }}>Pages hold notes (headings fold, checkboxes tick). A <b>links board</b> turns "Name: address" lines into clickable squares.</span></>}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <input
                value={page.title}
                onChange={e => renameDocPage(page.id, e.target.value)}
                style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', border: 'none', outline: 'none', background: 'transparent', color: 'var(--t-txt)', padding: 0 }} />
              {page.type === 'links' && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'var(--t-acc-bg)', color: 'var(--t-acc-dk)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                  Links board
                </span>
              )}
              <div style={{ display: 'flex', gap: 2, background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', borderRadius: 8, padding: 2, flexShrink: 0 }}>
                <button style={modeBtn(mode === 'edit')} onClick={() => setMode('edit')} title="Editor only">✎</button>
                <button style={modeBtn(mode === 'split')} onClick={() => setMode('split')} title="Editor + preview">⿲</button>
                <button style={modeBtn(mode === 'view')} onClick={() => setMode('view')} title="Preview only">👁</button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
              {mode !== 'view' && (
                <textarea
                  value={draft}
                  onChange={e => changeDraft(e.target.value)}
                  placeholder={page.type === 'links'
                    ? 'One link per line:\nGoogle: google.com\nTeam wiki: https://confluence/…\n# lines starting with # are ignored'
                    : '# Heading (foldable)\n## Sub-heading\n- bullet\n- [ ] checkbox\n**bold**, `code`, https://links…\n---'}
                  style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.6, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', outline: 'none' }} />
              )}
              {mode !== 'edit' && (
                <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--t-brd)', background: 'var(--t-surf)' }}>
                  {page.type === 'links'
                    ? <LinksPreview content={draft} />
                    : <DocPreview content={draft} onToggleLine={toggleLine} />}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
