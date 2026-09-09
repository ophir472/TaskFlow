import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { backdropCloseProps } from '../../backdrop';
import { folderPath, normTag, looksLikeLink, withScheme } from '../../bookmarks';
import type { Bookmark } from '../../types';

// Edit one bookmark (or create: pass `draft` without id). Blur-commit fields
// via a local draft; Save writes once. Esc closes, ⌘Enter saves.
interface Props {
  bookmark: Bookmark | null;                       // null = new
  initial?: Partial<Bookmark>;
  onClose: () => void;
}

export function BookmarkEditor({ bookmark, initial, onClose }: Props) {
  const folders = useStore(s => s.bookmarkFolders);
  const allTags = useStore(s => s.bookmarks).flatMap(b => b.tags);
  const addBookmark = useStore(s => s.addBookmark);
  const updateBookmark = useStore(s => s.updateBookmark);
  const [title, setTitle] = useState(bookmark?.title ?? initial?.title ?? '');
  const [url, setUrl] = useState(bookmark?.url ?? initial?.url ?? '');
  const [notes, setNotes] = useState(bookmark?.notes ?? initial?.notes ?? '');
  const [tags, setTags] = useState((bookmark?.tags ?? initial?.tags ?? []).join(', '));
  const [folderId, setFolderId] = useState<string | null>(bookmark?.folderId ?? initial?.folderId ?? null);
  const [favorite, setFavorite] = useState(bookmark?.favorite ?? initial?.favorite ?? false);
  const tagSuggestions = Array.from(new Set(allTags)).filter(t => !tags.split(',').map(normTag).includes(t)).slice(0, 12);

  const valid = looksLikeLink(url);
  function save() {
    if (!valid) return;
    const patch = { title: title.trim() || url.trim(), url: withScheme(url), notes, tags: tags.split(',').map(normTag).filter(Boolean), folderId, favorite };
    if (bookmark) updateBookmark(bookmark.id, patch); else addBookmark(patch);
    onClose();
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, url, notes, tags, folderId, favorite]);

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  return (
    <div {...backdropCloseProps(onClose)} style={{ position: 'fixed', inset: 0, zIndex: 660, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(560px, 94vw)', background: 'var(--t-surf)', borderRadius: 16, border: '1px solid var(--t-brd)', boxShadow: '0 24px 70px rgba(0,0,0,0.4)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', flex: 1 }}>{bookmark ? 'Edit bookmark' : 'New bookmark'}</div>
          <button onClick={() => setFavorite(f => !f)} title={favorite ? 'Unfavorite' : 'Favorite'}
            style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: favorite ? 'var(--t-amber)' : 'var(--t-muted)' }}>{favorite ? '★' : '☆'}</button>
          <span onClick={onClose} title="Close (Esc)" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
        </div>
        <div><label style={lbl}>URL</label><input autoFocus={!bookmark} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… or wiki.corp/page or confluence/display/X" style={{ ...inp, borderColor: url && !valid ? 'var(--t-urgent)' : 'var(--t-brd)' }} /></div>
        <div><label style={lbl}>Title</label><input autoFocus={!!bookmark} value={title} onChange={e => setTitle(e.target.value)} placeholder="Page title" style={inp} /></div>
        <div>
          <label style={lbl}>Tags <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>— comma separated</span></label>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="work, reference" style={inp} />
          {tagSuggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {tagSuggestions.map(t => (
                <span key={t} onClick={() => setTags(prev => [...prev.split(',').map(x => x.trim()).filter(Boolean), t].join(', '))}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', color: 'var(--t-txt2)', cursor: 'pointer' }}>#{t}</span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={lbl}>Folder</label>
          <select value={folderId ?? ''} onChange={e => setFolderId(e.target.value || null)} style={inp}>
            <option value="">Unsorted</option>
            {folders.map(f => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Why this link matters, what to look for…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></div>
        {bookmark?.source && <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>Mirrored from a task link — the URL follows the card; title/tags/notes are yours once edited.</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--t-muted)', marginRight: 'auto' }}>⌘↵ save · esc cancel</span>
          <button onClick={onClose} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={!valid} style={{ border: 'none', background: valid ? 'var(--t-acc)' : 'var(--t-surf3)', color: valid ? 'white' : 'var(--t-muted)', fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 8, cursor: valid ? 'pointer' : 'default' }}>{bookmark ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}
