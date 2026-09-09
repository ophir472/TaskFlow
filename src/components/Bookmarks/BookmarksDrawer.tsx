import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { useLogMount } from '../../useLogMount';
import { BookmarkEditor } from './BookmarkEditor';
import { TaskModal } from '../TaskModal/TaskModal';
import { CornerBanner } from '../Common/CornerBanner';
import { parseBookmarkQuery, matchesBookmark, duplicateKeys, normalizeUrl, domainOf, faviconUrl, folderPath, descendantFolderIds, parseChromeHtml, toChromeHtml, looksLikeLink, withScheme, normTag } from '../../bookmarks';
import type { Bookmark } from '../../types';

// The bookmarks drawer — a line along the bottom of every screen with a bump
// in the middle; click (or `b`) and it slides up over the current view
// (#bookmarks, #bookmarks/<folderId|fav|unsorted|task>?q=…). Chrome's model
// (nested folders, drag to organise) plus Raindrop's tags, notes, favorites,
// Unsorted inbox, duplicate check, list/grid/cards, import/export.
//
// Keys (drawer open, not typing): / search · ↑↓ move · ↵ open · e edit ·
// f favorite · ⌫ delete (undo in the banner) · esc close.

const SCOPES = ['fav', 'unsorted', 'task'] as const;
type Scope = string | null | typeof SCOPES[number]; // null = all, id = folder

export function readBookmarksHash(): { open: boolean; scope: Scope; q: string } {
  const h = window.location.hash.slice(1);
  if (!/^bookmarks(\/|\?|$)/.test(h)) return { open: false, scope: null, q: '' };
  const [path, qs] = h.split('?');
  const seg = path.split('/')[1] ?? '';
  const q = new URLSearchParams(qs ?? '').get('q') ?? '';
  return { open: true, scope: seg ? seg : null, q };
}

export function BookmarksHandle({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div onClick={() => { if (open) onClose(); else window.location.hash = 'bookmarks'; }}
      title={open ? 'Close bookmarks (Esc)' : 'Bookmarks (b)'}
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 16, zIndex: 601, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', pointerEvents: 'auto' }}>
      {/* the line */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'var(--t-brd)' }} />
      {/* the bump */}
      <div style={{ position: 'relative', width: 96, height: 14, borderRadius: '14px 14px 0 0', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 34, height: 4, borderRadius: 999, background: 'var(--t-muted)', opacity: 0.6 }} />
      </div>
    </div>
  );
}

async function fetchTitle(url: string): Promise<string> {
  try {
    const u = new URL(url);
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`/api-proxy/${u.protocol.replace(':', '')}/${u.host}${u.pathname}${u.search}`, { signal: ctrl.signal, headers: { 'x-taskflow-proxy': '1' } });
    clearTimeout(t);
    const html = (await res.text()).slice(0, 200000);
    const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  } catch { return ''; }
}

function Favicon({ url, template, size = 18 }: { url: string; template: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = faviconUrl(template, url);
  const d = domainOf(url);
  if (!src || broken) {
    const hue = [...d].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
    return <span style={{ width: size, height: size, borderRadius: 5, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.55, fontWeight: 800, color: 'white', background: `oklch(0.6 0.12 ${hue})` }}>{(d[0] ?? '?').toUpperCase()}</span>;
  }
  return <img src={src} width={size} height={size} onError={() => setBroken(true)} alt="" style={{ borderRadius: 4, flexShrink: 0 }} />;
}

interface Props { open: boolean; onClose: () => void }

export function BookmarksDrawer({ open, onClose }: Props) {
  useLogMount('BookmarksDrawer');
  const bookmarks = useStore(s => s.bookmarks);
  const folders = useStore(s => s.bookmarkFolders);
  const config = useStore(s => s.bookmarkConfig);
  const items = useStore(s => s.items);
  const addBookmark = useStore(s => s.addBookmark);
  const updateBookmark = useStore(s => s.updateBookmark);
  const removeBookmarks = useStore(s => s.removeBookmarks);
  const restoreBookmarks = useStore(s => s.restoreBookmarks);
  const moveBookmarks = useStore(s => s.moveBookmarks);
  const addBookmarkFolder = useStore(s => s.addBookmarkFolder);
  const updateBookmarkFolder = useStore(s => s.updateBookmarkFolder);
  const removeBookmarkFolder = useStore(s => s.removeBookmarkFolder);
  const importBookmarks = useStore(s => s.importBookmarks);
  const setBookmarkConfig = useStore(s => s.setBookmarkConfig);

  // scope + query live in the URL (#bookmarks/<scope>?q=…)
  const [scope, setScope] = useState<Scope>(() => readBookmarksHash().scope);
  const [query, setQuery] = useState(() => readBookmarksHash().q);
  useEffect(() => {
    const onHash = () => { const h = readBookmarksHash(); if (!h.open) return; setScope(h.scope); setQuery(cur => cur.trim() === h.q.trim() ? cur : h.q); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!open) return;
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    const next = `#bookmarks${scope ? `/${scope}` : ''}${qs}`;
    if (window.location.hash !== next && /^#bookmarks(\/|\?|$)/.test(window.location.hash)) history.replaceState(null, '', next);
  }, [scope, query, open]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hi, setHi] = useState(0);
  const [editing, setEditing] = useState<{ b: Bookmark | null; initial?: Partial<Bookmark> } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ text: string; action?: { label: string; onClick: () => void } } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const showNotice = (text: string, action?: { label: string; onClick: () => void }) => {
    setNotice({ text, action }); window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), action ? 6000 : 2200);
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dragFolder, setDragFolder] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | 'unsorted' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [moveMenu, setMoveMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const taskTitle = (id: string) => items.find(it => it.id === id)?.title ?? '';
  const dupKeys = useMemo(() => duplicateKeys(bookmarks), [bookmarks]);
  const parsed = useMemo(() => parseBookmarkQuery(query), [query]);
  const folderIds = useMemo(() => (scope && !SCOPES.includes(scope as never) ? descendantFolderIds(folders, scope) : null), [scope, folders]);

  const rows = useMemo(() => {
    const ctx = { folderName: (id: string | null) => folderPath(folders, id), taskTitle, dupKeys };
    const list = bookmarks.filter(b => {
      if (scope === 'fav' && !b.favorite) return false;
      if (scope === 'unsorted' && b.folderId !== null) return false;
      if (scope === 'task' && !b.source) return false;
      if (folderIds && (!b.folderId || !folderIds.has(b.folderId))) return false;
      return matchesBookmark(b, parsed, ctx);
    });
    const cmp = config.sort === 'title' ? (a: Bookmark, b: Bookmark) => a.title.localeCompare(b.title)
      : config.sort === 'domain' ? (a: Bookmark, b: Bookmark) => domainOf(a.url).localeCompare(domainOf(b.url)) || a.title.localeCompare(b.title)
      : (a: Bookmark, b: Bookmark) => b.createdAt - a.createdAt;
    return [...list].sort((a, b) => (Number(b.favorite) - Number(a.favorite)) || cmp(a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, folders, scope, folderIds, parsed, config.sort, dupKeys, items]);

  const tagCloud = useMemo(() => {
    const n = new Map<string, number>();
    rows.forEach(b => b.tags.forEach(t => n.set(t, (n.get(t) ?? 0) + 1)));
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [rows]);
  const countIn = (id: string | null) => { const ids = id ? descendantFolderIds(folders, id) : null; return bookmarks.filter(b => ids ? (b.folderId && ids.has(b.folderId)) : b.folderId === null).length; };

  useEffect(() => { setHi(0); setSelected(new Set()); }, [scope, query]);
  useEffect(() => { if (hi >= rows.length) setHi(Math.max(0, rows.length - 1)); }, [rows.length, hi]);

  // ── actions ──
  const openUrl = (b: Bookmark) => window.open(b.url, '_blank');
  const del = (ids: string[]) => {
    const gone = bookmarks.filter(b => ids.includes(b.id));
    if (!gone.length) return;
    removeBookmarks(ids); setSelected(new Set());
    showNotice(`${gone.length} bookmark${gone.length > 1 ? 's' : ''} deleted`, { label: 'Undo', onClick: () => { restoreBookmarks(gone); setNotice(null); } });
  };
  const toggleTag = (t: string) => setQuery(q => {
    const tok = `tag:${t}`;
    const has = new RegExp(`(^|\\s)${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(q);
    return has ? q.replace(new RegExp(`(^|\\s)${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`), ' ').replace(/\s{2,}/g, ' ').trim() : `${q} ${tok}`.trim();
  });
  async function quickAdd() {
    if (!looksLikeLink(addUrl)) return;
    const url = withScheme(addUrl);
    setAdding(true);
    const title = await fetchTitle(url);
    setAdding(false);
    const dup = bookmarks.find(b => normalizeUrl(b.url) === normalizeUrl(url));
    const folderId = scope && !SCOPES.includes(scope as never) ? scope : null;
    addBookmark({ url, title: title || domainOf(url), folderId, favorite: scope === 'fav' });
    setAddUrl('');
    showNotice(dup ? `Added — note: “${dup.title}” already has this URL` : `Added to ${folderPath(folders, folderId)}`);
  }
  function onImportFile(f: File) {
    f.text().then(html => {
      const { folders: fs, bookmarks: bs } = parseChromeHtml(html);
      if (!bs.length && !fs.length) { showNotice('Nothing recognised in that file'); return; }
      const into = scope && !SCOPES.includes(scope as never) ? scope : null;
      importBookmarks(fs, bs, into);
      showNotice(`Imported ${bs.length} bookmarks in ${fs.length} folders`);
    });
  }
  function exportHtml() {
    const blob = new Blob([toChromeHtml(folders, bookmarks)], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `taskflow-bookmarks-${new Date().toISOString().slice(0, 10)}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ── keys ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (editing || taskId) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (typing) { (el as HTMLElement).blur(); if (el === searchRef.current && query) setQuery(''); return; }
        if (selected.size) { setSelected(new Set()); return; }
        onClose(); return;
      }
      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const b = rows[hi];
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(rows.length - 1, h + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
      else if (e.key === 'Enter' && b) { e.preventDefault(); openUrl(b); }
      else if (e.key === 'e' && b) { e.preventDefault(); setEditing({ b }); }
      else if (e.key === 'f' && b) { e.preventDefault(); updateBookmark(b.id, { favorite: !b.favorite }); }
      else if (e.key === ' ' && b) { e.preventDefault(); setSelected(prev => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && (selected.size || b)) { e.preventDefault(); del(selected.size ? [...selected] : [b!.id]); }
      else if (e.key === 'n') { e.preventDefault(); setEditing({ b: null, initial: { folderId: scope && !SCOPES.includes(scope as never) ? scope : null } }); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows, hi, selected, editing, taskId, query, scope]);

  // ── folder tree ──
  const tree = (parentId: string | null, depth: number): React.ReactNode[] => folders.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name)).map(f => {
    const kids = folders.some(x => x.parentId === f.id);
    const isOpen = !collapsed.has(f.id);
    const active = scope === f.id;
    return (
      <div key={f.id}>
        <div draggable onDragStart={e => { e.stopPropagation(); setDragFolder(f.id); }}
          onDragOver={e => { if (dragIds || (dragFolder && dragFolder !== f.id && !descendantFolderIds(folders, dragFolder).has(f.id))) { e.preventDefault(); setDropTarget(f.id); } }}
          onDragLeave={() => setDropTarget(t => t === f.id ? null : t)}
          onDrop={e => { e.preventDefault(); if (dragIds) moveBookmarks(dragIds, f.id); else if (dragFolder) updateBookmarkFolder(dragFolder, { parentId: f.id }); setDragIds(null); setDragFolder(null); setDropTarget(null); }}
          onDragEnd={() => { setDragFolder(null); setDropTarget(null); }}
          onClick={() => setScope(f.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', paddingLeft: 8 + depth * 14, borderRadius: 7, cursor: 'pointer', fontSize: 13, background: dropTarget === f.id ? 'var(--t-acc-bg)' : active ? 'var(--t-acc-bg)' : 'transparent', color: active ? 'var(--t-acc-dk)' : 'var(--t-txt2)', fontWeight: active ? 600 : 500, outline: dropTarget === f.id ? '1.5px dashed var(--t-acc)' : 'none' }}>
          <span onClick={e => { e.stopPropagation(); setCollapsed(prev => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
            style={{ width: 12, fontSize: 10, color: 'var(--t-muted)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s', visibility: kids ? 'visible' : 'hidden' }}>▸</span>
          <span style={{ fontSize: 12 }}>▣</span>
          {renaming === f.id ? (
            <input autoFocus defaultValue={f.name} onClick={e => e.stopPropagation()}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== f.name) updateBookmarkFolder(f.id, { name: v }); setRenaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
              style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '1px 5px', borderRadius: 4, border: '1px solid var(--t-acc)', background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none' }} />
          ) : <span onDoubleClick={e => { e.stopPropagation(); setRenaming(f.id); }} title="Double-click to rename · drag onto another folder to nest" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>}
          <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>{countIn(f.id)}</span>
          <span onClick={e => { e.stopPropagation(); if (confirm(`Remove folder “${f.name}”? Its bookmarks and sub-folders move up one level — nothing is deleted.`)) { removeBookmarkFolder(f.id); if (scope === f.id) setScope(f.parentId); } }}
            title="Remove folder (bookmarks move up)" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 13, opacity: 0.7 }}>×</span>
        </div>
        {kids && isOpen && tree(f.id, depth + 1)}
      </div>
    );
  });

  const scopeRow = (key: Scope, icon: string, label: string, count: number, droppable?: boolean) => {
    const active = scope === key;
    const dropKey = key === 'unsorted' ? 'unsorted' : null;
    return (
      <div onClick={() => setScope(key)}
        onDragOver={e => { if (droppable && dragIds) { e.preventDefault(); setDropTarget(dropKey); } }}
        onDragLeave={() => { if (droppable) setDropTarget(t => t === dropKey ? null : t); }}
        onDrop={e => { if (droppable && dragIds) { e.preventDefault(); moveBookmarks(dragIds, null); setDragIds(null); setDropTarget(null); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, background: active || (droppable && dropTarget === dropKey) ? 'var(--t-acc-bg)' : 'transparent', color: active ? 'var(--t-acc-dk)' : 'var(--t-txt2)', fontWeight: active ? 600 : 500 }}>
        <span style={{ width: 16, textAlign: 'center' }}>{icon}</span><span style={{ flex: 1 }}>{label}</span><span style={{ fontSize: 11, color: 'var(--t-muted)' }}>{count}</span>
      </div>
    );
  };

  const currentFolderId = scope && !SCOPES.includes(scope as never) ? scope : null;
  const chip = (t: string, on: boolean) => (
    <span key={t} onClick={e => { e.stopPropagation(); toggleTag(t); }} title={on ? 'Remove from the search' : `Filter by #${t}`}
      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? 'var(--t-acc)' : t === 'task' ? 'var(--t-amber-bg)' : 'var(--t-surf2)', color: on ? 'white' : t === 'task' ? 'var(--t-amber)' : 'var(--t-txt2)', border: `1px solid ${on ? 'var(--t-acc)' : 'var(--t-brd)'}` }}>#{t}</span>
  );

  const rowActions = (b: Bookmark) => (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
      {b.source && <span onClick={e => { e.stopPropagation(); setTaskId(b.source!.taskId); }} title={`From task: ${taskTitle(b.source.taskId) || '(deleted)'}`} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 5, background: 'var(--t-amber-bg)', color: 'var(--t-amber)', cursor: 'pointer', fontWeight: 700 }}>☰ task</span>}
      {dupKeys.has(normalizeUrl(b.url)) && <span title="Another bookmark has this URL (is:dup lists them)" style={{ fontSize: 11, color: 'var(--t-urgent)', fontWeight: 700 }}>⚠ dup</span>}
      <span onClick={e => { e.stopPropagation(); updateBookmark(b.id, { favorite: !b.favorite }); }} title={b.favorite ? 'Unfavorite (f)' : 'Favorite (f)'} style={{ cursor: 'pointer', fontSize: 15, color: b.favorite ? 'var(--t-amber)' : 'var(--t-muted)', opacity: b.favorite ? 1 : 0.5 }}>{b.favorite ? '★' : '☆'}</span>
      <span onClick={e => { e.stopPropagation(); setEditing({ b }); }} title="Edit (e)" style={{ cursor: 'pointer', fontSize: 13, color: 'var(--t-muted)' }}>✎</span>
      <span onClick={e => { e.stopPropagation(); del([b.id]); }} title="Delete (⌫) — undo from the banner" style={{ cursor: 'pointer', fontSize: 14, color: 'var(--t-muted)' }}>×</span>
    </span>
  );
  const dragProps = (b: Bookmark) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; setDragIds(selected.has(b.id) ? [...selected] : [b.id]); },
    onDragEnd: () => { setDragIds(null); setDropTarget(null); },
  });
  const checkbox = (b: Bookmark) => (
    <input type="checkbox" checked={selected.has(b.id)} onClick={e => e.stopPropagation()} onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} style={{ cursor: 'pointer', flexShrink: 0 }} />
  );

  return (
    <>
      <BookmarksHandle open={open} onClose={onClose} />
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: '92vh', zIndex: 600, transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)', background: 'var(--t-bg)', borderTop: '1px solid var(--t-brd)', boxShadow: open ? '0 -12px 40px rgba(0,0,0,0.18)' : 'none', display: 'flex', flexDirection: 'column', pointerEvents: open ? 'auto' : 'none' }}
        aria-hidden={!open}>
        {/* grab line at the top edge */}
        <div onClick={onClose} title="Close (Esc)" style={{ height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ width: 44, height: 5, borderRadius: 999, background: 'var(--t-muted)', opacity: 0.5 }} />
        </div>
        {open && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: '0 24px 22px', gap: 18 }}>
            {/* ── left: scopes + folder tree ── */}
            <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--t-brd)', paddingRight: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
                <span style={{ fontSize: 18 }}>🔖</span><span style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>Bookmarks</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-muted)' }}>{bookmarks.length}</span>
              </div>
              {scopeRow(null, '☰', 'All bookmarks', bookmarks.length)}
              {scopeRow('fav', '★', 'Favorites', bookmarks.filter(b => b.favorite).length)}
              {scopeRow('unsorted', '⊡', 'Unsorted', countIn(null), true)}
              {scopeRow('task', '⧉', 'From tasks', bookmarks.filter(b => b.source).length)}
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 4px 8px' }}>Folders</div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {folders.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-muted)', padding: '4px 8px' }}>No folders yet — drag bookmarks onto one to file them.</div>}
                {tree(null, 0)}
              </div>
              <input value={newFolder} onChange={e => setNewFolder(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newFolder.trim()) { const id = addBookmarkFolder(newFolder.trim(), currentFolderId); setNewFolder(''); setScope(id); } if (e.key === 'Escape') { e.stopPropagation(); setNewFolder(''); (e.target as HTMLInputElement).blur(); } }}
                placeholder={currentFolderId ? `+ Sub-folder of ${folderPath(folders, currentFolderId).split(' › ').pop()}` : '+ New folder'}
                style={{ marginTop: 8, fontSize: 12.5, padding: '6px 9px', borderRadius: 7, border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-txt)', outline: 'none' }} />
            </div>

            {/* ── right: toolbar + list ── */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', paddingBottom: 10 }}>
                <div style={{ position: 'relative', flex: '0 1 340px', minWidth: 160, display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: 9, fontSize: 13, color: 'var(--t-muted)', pointerEvents: 'none' }}>⌕</span>
                  <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Search — title, url, notes, tag:x, folder:x, is:favorite / task / unsorted / dup"
                    style={{ width: '100%', height: 32, fontSize: 13, padding: '0 26px', borderRadius: 8, border: '1px solid ' + (query ? 'var(--t-acc)' : 'var(--t-brd)'), background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none', boxSizing: 'border-box' }} />
                  <kbd style={{ position: 'absolute', right: 7, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1, padding: '3px 7px', borderRadius: 5, border: '1px solid var(--t-brd)', borderBottomWidth: 2, background: 'var(--t-surf2)', color: 'var(--t-muted)', pointerEvents: 'none' }}>/</kbd>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={addUrl} onChange={e => setAddUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') quickAdd(); if (e.key === 'Escape') { e.stopPropagation(); setAddUrl(''); (e.target as HTMLInputElement).blur(); } }}
                    placeholder="Paste a URL and press Enter"
                    style={{ width: 230, height: 32, fontSize: 13, padding: '0 10px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none', boxSizing: 'border-box' }} />
                  <button onClick={quickAdd} disabled={!looksLikeLink(addUrl) || adding} title="Add to the current folder (title fetched from the page when reachable)"
                    style={{ height: 32, border: 'none', background: looksLikeLink(addUrl) ? 'var(--t-acc)' : 'var(--t-surf3)', color: looksLikeLink(addUrl) ? 'white' : 'var(--t-muted)', fontSize: 12.5, fontWeight: 700, padding: '0 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>{adding ? '…' : '+ Add'}</button>
                  <button onClick={() => setEditing({ b: null, initial: { folderId: currentFolderId } })} title="New bookmark with all fields (n)"
                    style={{ height: 32, width: 34, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 14, borderRadius: 8, cursor: 'pointer' }}>✎</button>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'stretch', height: 32, border: '1px solid var(--t-brd)', borderRadius: 8, overflow: 'hidden' }}>
                    {([['list', '☰', 'List'], ['grid', '▦', 'Grid'], ['cards', '▤', 'Cards']] as const).map(([v, icon, tip], i) => (
                      <button key={v} onClick={() => setBookmarkConfig({ view: v })} title={tip}
                        style={{ border: 'none', borderLeft: i ? '1px solid var(--t-brd)' : 'none', background: config.view === v ? 'var(--t-acc-bg)' : 'var(--t-surf)', color: config.view === v ? 'var(--t-acc-dk)' : 'var(--t-muted)', fontSize: 13, fontWeight: 700, padding: '0 11px', cursor: 'pointer' }}>{icon}</button>
                    ))}
                  </div>
                  <select value={config.sort} onChange={e => setBookmarkConfig({ sort: e.target.value as 'added' | 'title' | 'domain' })} title="Sort"
                    style={{ height: 32, fontSize: 12.5, padding: '0 8px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)' }}>
                    <option value="added">Newest first</option><option value="title">Title A–Z</option><option value="domain">By site</option>
                  </select>
                  <button onClick={() => fileRef.current?.click()} title="Import a Chrome / Firefox bookmarks HTML export into the current folder"
                    style={{ height: 32, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '0 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>⇪ Import</button>
                  <input ref={fileRef} type="file" accept=".html,.htm" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ''; }} />
                  <button onClick={exportHtml} title="Export everything as a Chrome-compatible bookmarks HTML file"
                    style={{ height: 32, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '0 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>⇩ Export</button>
                </div>
              </div>

              {/* tag cloud + selection bar */}
              {(tagCloud.length > 0 || selected.size > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingBottom: 10 }}>
                  {selected.size > 0 ? (
                    <>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-txt2)' }}>{selected.size} selected</span>
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setMoveMenu(m => !m)} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}>Move to ▾</button>
                        {moveMenu && (
                          <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 5, minWidth: 200, maxHeight: 260, overflowY: 'auto', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 9, boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '4px 0' }}>
                            {[{ id: null as string | null, label: 'Unsorted' }, ...folders.map(f => ({ id: f.id as string | null, label: folderPath(folders, f.id) }))].map(o => (
                              <div key={o.id ?? 'unsorted'} onClick={() => { moveBookmarks([...selected], o.id); setMoveMenu(false); setSelected(new Set()); }} style={{ padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--t-txt2)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{o.label}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => { const t = prompt('Tag to add to the selected bookmarks:'); const tag = t ? normTag(t) : ''; if (tag) [...selected].forEach(id => { const b = bookmarks.find(x => x.id === id); if (b && !b.tags.includes(tag)) updateBookmark(id, { tags: [...b.tags, tag] }); }); }}
                        style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}>+ Tag</button>
                      <button onClick={() => { const on = ![...selected].every(id => bookmarks.find(b => b.id === id)?.favorite); [...selected].forEach(id => updateBookmark(id, { favorite: on })); }}
                        style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-amber)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}>★ Favorite</button>
                      <button onClick={() => del([...selected])} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-urgent)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}>× Delete</button>
                      <button onClick={() => setSelected(new Set())} style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, cursor: 'pointer' }}>Clear</button>
                    </>
                  ) : tagCloud.map(([t]) => chip(t, parsed.tags.includes(t)))}
                </div>
              )}

              {/* header line: where am I */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t-muted)', paddingBottom: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--t-txt2)' }}>{scope === 'fav' ? '★ Favorites' : scope === 'unsorted' ? '⊡ Unsorted' : scope === 'task' ? '⧉ From tasks' : scope ? folderPath(folders, scope) : 'All bookmarks'}</span>
                <span>· {rows.length} shown</span>
                {rows.length > 0 && <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={rows.every(b => selected.has(b.id))} onChange={e => setSelected(e.target.checked ? new Set(rows.map(b => b.id)) : new Set())} /> select all</label>}
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {rows.length === 0 && (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--t-muted)', fontSize: 13.5, lineHeight: 1.7 }}>
                    {bookmarks.length === 0 ? <>No bookmarks yet.<br />Paste a URL above, press <b>n</b> for the full form, or <b>⇪ Import</b> your Chrome bookmarks.</> : <>Nothing matches.{query && <> <span onClick={() => setQuery('')} style={{ color: 'var(--t-acc)', cursor: 'pointer' }}>Clear the search</span></>}</>}
                  </div>
                )}
                {config.view === 'list' && rows.map((b, i) => (
                  <div key={b.id} {...dragProps(b)} onClick={() => openUrl(b)} onMouseEnter={() => setHi(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: hi === i ? 'var(--t-surf2)' : 'transparent', outline: hi === i ? '1.5px solid var(--t-acc)' : 'none', outlineOffset: -1, opacity: dragIds?.includes(b.id) ? 0.4 : 1 }}>
                    {checkbox(b)}
                    <Favicon url={b.url} template={config.faviconTemplate} />
                    <span style={{ flex: '1 1 40%', minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--t-txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.url}>{b.title}</span>
                    <span style={{ flex: '0 1 22%', minWidth: 0, fontSize: 12, color: 'var(--t-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{domainOf(b.url)}</span>
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', flex: '0 1 30%', minWidth: 0 }}>{b.tags.slice(0, 5).map(t => chip(t, parsed.tags.includes(t)))}</span>
                    {!scope || SCOPES.includes(scope as never) ? <span style={{ fontSize: 11, color: 'var(--t-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{b.folderId ? folderPath(folders, b.folderId) : ''}</span> : null}
                    {rowActions(b)}
                  </div>
                ))}
                {config.view === 'grid' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    {rows.map((b, i) => (
                      <div key={b.id} {...dragProps(b)} onClick={() => openUrl(b)} onMouseEnter={() => setHi(i)} title={`${b.title}\n${b.url}`}
                        style={{ position: 'relative', height: 110, boxSizing: 'border-box', padding: '14px 10px 10px', borderRadius: 12, cursor: 'pointer', background: 'var(--t-surf)', border: `1px solid ${hi === i ? 'var(--t-acc)' : 'var(--t-brd)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', opacity: dragIds?.includes(b.id) ? 0.4 : 1 }}>
                        <span style={{ position: 'absolute', left: 8, top: 8 }}>{checkbox(b)}</span>
                        {b.favorite && <span style={{ position: 'absolute', right: 8, top: 6, color: 'var(--t-amber)' }}>★</span>}
                        <Favicon url={b.url} template={config.faviconTemplate} size={30} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-txt)', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{b.title}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--t-muted)', marginTop: 'auto' }}>{domainOf(b.url)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {config.view === 'cards' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                    {rows.map((b, i) => (
                      <div key={b.id} {...dragProps(b)} onClick={() => openUrl(b)} onMouseEnter={() => setHi(i)}
                        style={{ boxSizing: 'border-box', padding: 14, borderRadius: 14, cursor: 'pointer', background: 'var(--t-surf)', border: `1px solid ${hi === i ? 'var(--t-acc)' : 'var(--t-brd)'}`, display: 'flex', flexDirection: 'column', gap: 8, opacity: dragIds?.includes(b.id) ? 0.4 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {checkbox(b)}
                          <Favicon url={b.url} template={config.faviconTemplate} size={20} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--t-txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
                          {rowActions(b)}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--t-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.url}</div>
                        {b.notes.trim() && <div style={{ fontSize: 12.5, color: 'var(--t-txt2)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{b.notes}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 'auto' }}>
                          {b.tags.map(t => chip(t, parsed.tags.includes(t)))}
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-muted)' }}>{b.folderId ? folderPath(folders, b.folderId) : 'Unsorted'} · {new Date(b.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ paddingTop: 8, fontSize: 11, color: 'var(--t-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span><kbd style={{ fontFamily: 'inherit' }}>/</kbd> search</span><span><kbd style={{ fontFamily: 'inherit' }}>↑↓</kbd> move</span><span><kbd style={{ fontFamily: 'inherit' }}>↵</kbd> open</span><span><kbd style={{ fontFamily: 'inherit' }}>e</kbd> edit</span><span><kbd style={{ fontFamily: 'inherit' }}>f</kbd> favorite</span><span><kbd style={{ fontFamily: 'inherit' }}>space</kbd> select</span><span><kbd style={{ fontFamily: 'inherit' }}>⌫</kbd> delete</span><span><kbd style={{ fontFamily: 'inherit' }}>n</kbd> new</span><span><kbd style={{ fontFamily: 'inherit' }}>esc</kbd> close</span><span style={{ marginLeft: 'auto' }}>drag bookmarks onto folders · drag a folder onto another to nest</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {editing && <BookmarkEditor bookmark={editing.b} initial={editing.initial} onClose={() => setEditing(null)} />}
      {taskId && <TaskModal taskId={taskId} onClose={() => setTaskId(null)} urlDriven={false} />}
      <CornerBanner text={notice?.text ?? null} action={notice?.action} />
    </>
  );
}

