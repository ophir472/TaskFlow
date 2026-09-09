// Bookmarks — pure helpers: URL normalisation, task-link mirroring, the
// search query, Chrome bookmarks HTML import/export.
import type { Bookmark, BookmarkFolder, Task } from './types';
// Same id scheme as engine.nextId — local so this module stays dependency-free
// (the node check scripts import it directly).
const nextId = (prefix: string) => prefix + Date.now() + Math.random().toString(36).slice(2, 6);

export const isUrl = (v: string) => /^https?:\/\/[^\s/]+\.[^\s/]{2,}/i.test(v.trim());
export const withScheme = (v: string) => (/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);

export function domainOf(url: string): string {
  try { return new URL(withScheme(url)).host.replace(/^www\./, ''); } catch { return ''; }
}

/** Same page, different spelling → same key (duplicate detection). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(withScheme(url));
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(k => u.searchParams.delete(k));
    let s = `${u.host.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
    const q = u.searchParams.toString();
    if (q) s += `?${q}`;
    return s;
  } catch { return url.trim().toLowerCase(); }
}

export function faviconUrl(template: string, url: string): string | null {
  const d = domainOf(url);
  if (!template.trim() || !d) return null;
  return template.replace('{domain}', d);
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'about', 'your', 'you', 'are', 'was', 'not', 'but', 'has', 'have', 'will', 'can', 'all', 'any', 'new', 'per', 'via', 'http', 'https', 'www', 'com', 'html', 'task', 'link']);

/** Search keywords from free text — lower-case words ≥3 chars, no stop words. */
export function keywords(...texts: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const t of texts) for (const w of (t ?? '').toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !out.includes(w)) out.push(w);
  }
  return out.slice(0, 8);
}

export const normTag = (t: string) => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');

// ── task links → bookmarks ──
export interface TaskLink { field: string; url: string; label: string }

export function taskLinks(t: Task): TaskLink[] {
  const out: TaskLink[] = [];
  if (isUrl(t.generalLink ?? '')) out.push({ field: 'generalLink', url: t.generalLink.trim(), label: t.generalLinkLabel ?? '' });
  (t.extraGeneralLinks ?? []).forEach((u, i) => { if (isUrl(u)) out.push({ field: `extra:${i}`, url: u.trim(), label: (t.extraGeneralLinkLabels ?? [])[i] ?? '' }); });
  (t.subtasks ?? []).forEach(su => { if (isUrl(su.generalLink ?? '')) out.push({ field: `sub:${su.id}`, url: su.generalLink.trim(), label: su.title }); });
  return out;
}

/** Mirror a task's links into the bookmarks list (one bookmark per task
 *  field, matched by source). Returns null when nothing changed. Bookmarks a
 *  user has edited by hand (auto=false) keep their title/tags/notes; only the
 *  URL follows the card. */
export function upsertTaskLinks(bookmarks: Bookmark[], t: Task, now = Date.now()): Bookmark[] | null {
  const links = taskLinks(t);
  if (links.length === 0 && !bookmarks.some(b => b.source?.taskId === t.id)) return null;
  let changed = false;
  const next = [...bookmarks];
  for (const l of links) {
    const idx = next.findIndex(b => b.source?.taskId === t.id && b.source.field === l.field);
    const title = (l.label || t.title || domainOf(l.url)).trim();
    const tags = ['task', ...keywords(t.title, l.label, t.project, t.requester)];
    if (idx === -1) {
      next.push({ id: nextId('bm'), url: l.url, title, notes: '', tags, folderId: null, favorite: false, createdAt: now, updatedAt: now, source: { taskId: t.id, field: l.field }, auto: true });
      changed = true;
    } else {
      const b = next[idx];
      const nb = b.auto ? { ...b, url: l.url, title, tags: Array.from(new Set([...tags, ...b.tags.filter(x => !tags.includes(x) && x !== 'task')])) } : { ...b, url: l.url };
      if (nb.url !== b.url || nb.title !== b.title || nb.tags.join() !== b.tags.join()) { next[idx] = { ...nb, updatedAt: now }; changed = true; }
    }
  }
  return changed ? next : null;
}

// ── query: free text · tag:x · folder:name · is:favorite|task|unsorted|dup ──
export interface BookmarkQuery { text: string; tags: string[]; folder: string; is: Set<string> }

export function parseBookmarkQuery(q: string): BookmarkQuery {
  const out: BookmarkQuery = { text: '', tags: [], folder: '', is: new Set() };
  const words: string[] = [];
  for (const m of q.matchAll(/(\w+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g)) {
    const f = m[1]?.toLowerCase(); const v = (m[2] ?? m[3] ?? '').trim();
    if (f === 'tag' || f === '#') out.tags.push(normTag(v));
    else if (f === 'folder') out.folder = v.toLowerCase();
    else if (f === 'is') out.is.add(v.toLowerCase());
    else if (m[0].startsWith('#') && m[0].length > 1) out.tags.push(normTag(m[0]));
    else words.push(m[4] ?? m[5] ?? '');
  }
  out.text = words.join(' ').trim().toLowerCase();
  return out;
}

export function matchesBookmark(b: Bookmark, q: BookmarkQuery, ctx: { folderName: (id: string | null) => string; taskTitle: (id: string) => string; dupKeys: Set<string> }): boolean {
  if (q.tags.length && !q.tags.every(t => b.tags.includes(t))) return false;
  if (q.folder && !ctx.folderName(b.folderId).toLowerCase().includes(q.folder)) return false;
  if (q.is.has('favorite') && !b.favorite) return false;
  if (q.is.has('task') && !b.source) return false;
  if (q.is.has('unsorted') && b.folderId !== null) return false;
  if (q.is.has('dup') && !ctx.dupKeys.has(normalizeUrl(b.url))) return false;
  if (q.text) {
    const hay = [b.title, b.url, b.notes, b.tags.join(' '), b.source ? ctx.taskTitle(b.source.taskId) : ''].join(' ').toLowerCase();
    if (!q.text.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

export function duplicateKeys(bookmarks: Bookmark[]): Set<string> {
  const seen = new Map<string, number>();
  bookmarks.forEach(b => { const k = normalizeUrl(b.url); seen.set(k, (seen.get(k) ?? 0) + 1); });
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

// ── Chrome / Netscape bookmarks HTML ──
export function parseChromeHtml(html: string, now = Date.now()): { folders: BookmarkFolder[]; bookmarks: Bookmark[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const folders: BookmarkFolder[] = []; const bookmarks: Bookmark[] = [];
  const walk = (dl: Element, parentId: string | null) => {
    for (const dt of Array.from(dl.children)) {
      if (dt.tagName !== 'DT') { if (dt.tagName === 'DL') walk(dt, parentId); continue; }
      const h3 = dt.querySelector(':scope > h3'); const a = dt.querySelector(':scope > a');
      if (h3) {
        const name = h3.textContent?.trim() || 'Folder';
        // Chrome's top-level "Bookmarks bar" / "Other bookmarks" wrappers become plain folders too.
        const f: BookmarkFolder = { id: nextId('bf'), name, parentId, createdAt: now };
        folders.push(f);
        const sub = dt.querySelector(':scope > dl');
        if (sub) walk(sub, f.id);
      } else if (a) {
        const href = a.getAttribute('href') ?? '';
        if (!isUrl(href)) continue;
        const added = Number(a.getAttribute('add_date'));
        const tags = (a.getAttribute('tags') ?? '').split(',').map(normTag).filter(Boolean);
        bookmarks.push({ id: nextId('bm'), url: href, title: a.textContent?.trim() || domainOf(href), notes: '', tags, folderId: parentId, favorite: false, createdAt: added ? added * 1000 : now, updatedAt: now });
      }
    }
  };
  const root = doc.querySelector('dl');
  if (root) walk(root, null);
  return { folders, bookmarks };
}

export function toChromeHtml(folders: BookmarkFolder[], bookmarks: Bookmark[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines: string[] = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
  const emit = (parentId: string | null, indent: string) => {
    bookmarks.filter(b => b.folderId === parentId).forEach(b => {
      lines.push(`${indent}<DT><A HREF="${esc(b.url)}" ADD_DATE="${Math.floor(b.createdAt / 1000)}"${b.tags.length ? ` TAGS="${esc(b.tags.join(','))}"` : ''}>${esc(b.title)}</A>`);
      if (b.notes.trim()) lines.push(`${indent}<DD>${esc(b.notes.trim())}`);
    });
    folders.filter(f => f.parentId === parentId).forEach(f => {
      lines.push(`${indent}<DT><H3 ADD_DATE="${Math.floor(f.createdAt / 1000)}">${esc(f.name)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      emit(f.id, indent + '    ');
      lines.push(`${indent}</DL><p>`);
    });
  };
  emit(null, '    ');
  lines.push('</DL><p>');
  return lines.join('\n');
}

/** Folder path "A › B › C" for display/search. */
export function folderPath(folders: BookmarkFolder[], id: string | null): string {
  const parts: string[] = [];
  let cur = id; let guard = 0;
  while (cur && guard++ < 20) { const f = folders.find(x => x.id === cur); if (!f) break; parts.unshift(f.name); cur = f.parentId; }
  return parts.join(' › ') || 'Unsorted';
}

export function descendantFolderIds(folders: BookmarkFolder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) { grew = false; folders.forEach(f => { if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; } }); }
  return out;
}
