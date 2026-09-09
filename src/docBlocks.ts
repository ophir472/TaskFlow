// Docs page markup — Notion-style blocks stored as plain text (backup/diff
// friendly, no migration). One line = one block, indentation nests:
//
//   # / ## / ###        headings (foldable)
//   - [ ] / - [x]       to-do (nested to-dos: parent is done when all its children are)
//   - text              bullet          1. text   numbered
//   ▸ text              toggle — the indented lines below it fold
//   > text              quote           !! text   callout (leading emoji = icon, default 💡)
//   ---                 divider         ```lang … ```   code block
//   | a | b |           table (an optional |---|---| second line makes the first row a header)
//
// Inline: **bold** *italic* ~~strike~~ `code` [text](url) bare URLs and
// [[Page title]] / [[t<taskId>]] / [[JIRA-123]] links resolved by the renderer.

export type Flat =
  | { t: 'heading'; level: 1 | 2 | 3; text: string; line: number; depth: number }
  | { t: 'check'; text: string; checked: boolean; line: number; depth: number; key: string }
  | { t: 'bullet'; text: string; line: number; depth: number }
  | { t: 'num'; n: string; text: string; line: number; depth: number }
  | { t: 'toggle'; text: string; line: number; depth: number }
  | { t: 'quote'; text: string; line: number; depth: number }
  | { t: 'callout'; icon: string; text: string; line: number; depth: number }
  | { t: 'divider'; line: number; depth: number }
  | { t: 'code'; lang: string; code: string; line: number; depth: number }
  | { t: 'table'; rows: string[][]; header: boolean; line: number; depth: number }
  | { t: 'para'; text: string; line: number; depth: number }
  | { t: 'blank'; line: number; depth: number };

export type Block = Flat & { children: Block[] };

const EMOJI_RE = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

const normKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Flat pass: one entry per line (code fences / tables swallow several). */
export function parseFlat(content: string): Flat[] {
  const lines = content.split('\n');
  const out: Flat[] = [];
  const seenKeys = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indentStr = /^[\t ]*/.exec(raw)![0];
    const depth = Math.floor(indentStr.replace(/\t/g, '  ').length / 2);
    const line = raw.slice(indentStr.length);
    // fenced code
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const start = i; const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      out.push({ t: 'code', lang: fence[1], code: buf.join('\n'), line: start, depth });
      continue;
    }
    // table
    if (/^\|.*\|\s*$/.test(line)) {
      const start = i; const rows: string[][] = []; let header = false;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
        if (rows.length === 1 && cells.every(c => /^:?-{2,}:?$/.test(c))) { header = true; i++; continue; }
        rows.push(cells); i++;
      }
      i--;
      out.push({ t: 'table', rows, header, line: start, depth });
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { out.push({ t: 'heading', level: m[1].length as 1 | 2 | 3, text: m[2], line: i, depth }); continue; }
    if ((m = /^[-*]\s+\[([ xX])\]\s?(.*)$/.exec(line))) {
      const base = normKey(m[2]) || `(empty:${i})`;
      const n = (seenKeys.get(base) ?? 0) + 1; seenKeys.set(base, n);
      out.push({ t: 'check', text: m[2], checked: m[1] !== ' ', line: i, depth, key: n > 1 ? `${base}#${n}` : base });
      continue;
    }
    if ((m = /^▸\s*(.*)$/.exec(line))) { out.push({ t: 'toggle', text: m[1], line: i, depth }); continue; }
    if ((m = /^[-*]\s+(.*)$/.exec(line))) { out.push({ t: 'bullet', text: m[1], line: i, depth }); continue; }
    if ((m = /^(\d+)[.)]\s+(.*)$/.exec(line))) { out.push({ t: 'num', n: m[1], text: m[2], line: i, depth }); continue; }
    if ((m = /^!!\s?(.*)$/.exec(line))) {
      const em = EMOJI_RE.exec(m[1]);
      out.push({ t: 'callout', icon: em ? em[1] : '💡', text: em ? m[1].slice(em[0].length) : m[1], line: i, depth });
      continue;
    }
    if ((m = /^>\s?(.*)$/.exec(line))) { out.push({ t: 'quote', text: m[1], line: i, depth }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push({ t: 'divider', line: i, depth }); continue; }
    if (line.trim() === '') { out.push({ t: 'blank', line: i, depth: 0 }); continue; }
    out.push({ t: 'para', text: line, line: i, depth });
  }
  return out;
}

/** Tree pass: a block owns every following block that is indented deeper
 *  (blank lines don't break nesting). */
export function parseDoc(content: string): Block[] {
  const flat = parseFlat(content);
  let i = 0;
  function build(minDepth: number): Block[] {
    const res: Block[] = [];
    while (i < flat.length) {
      const f = flat[i];
      if (f.t !== 'blank' && f.depth < minDepth) break;
      i++;
      if (f.t === 'blank') { res.push({ ...f, children: [] }); continue; }
      const node: Block = { ...f, children: [] };
      // a deeper run that follows belongs to this block
      const nextNonBlank = flat.slice(i).find(x => x.t !== 'blank');
      if (nextNonBlank && nextNonBlank.depth > f.depth) node.children = build(f.depth + 1);
      res.push(node);
    }
    return res;
  }
  return build(0);
}

/** Leaf to-dos = the boxes that count. A to-do with to-do children is done
 *  when they all are (never a leaf itself). */
export function leafCheckKeys(content: string): string[] {
  const keys: string[] = [];
  const walk = (bs: Block[]) => bs.forEach(b => {
    if (b.t === 'check') {
      const kids = b.children.filter(c => c.t === 'check');
      if (kids.length === 0) keys.push(b.key); else walk(b.children);
    } else walk(b.children);
  });
  walk(parseDoc(content));
  return keys;
}

/** All leaf keys under a block (the block itself if it is a leaf to-do). */
export function leafKeysOf(b: Block): string[] {
  if (b.t === 'check') {
    const kids = b.children.filter(c => c.t === 'check');
    if (kids.length === 0) return [b.key];
  }
  return b.children.flatMap(leafKeysOf);
}

export const hasCheckboxes = (content: string) => /^[\t ]*[-*]\s+\[[ xX]\]/m.test(content);

// ── inline tokens ──
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; v: string } | { t: 'i'; v: string } | { t: 's'; v: string } | { t: 'code'; v: string }
  | { t: 'url'; v: string; href: string }
  | { t: 'ref'; v: string };     // [[…]] — resolved by the renderer

const INLINE_RE = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\((?:https?:\/\/|#)[^)\s]+\)|(?<![\w*])\*[^*\n]+\*(?!\w)|(?<!\w)_[^_\n]+_(?!\w)|https?:\/\/[^\s)]+)/g;

export function tokenizeInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0; let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ t: 'b', v: tok.slice(2, -2) });
    else if (tok.startsWith('~~')) out.push({ t: 's', v: tok.slice(2, -2) });
    else if (tok.startsWith('`')) out.push({ t: 'code', v: tok.slice(1, -1) });
    else if (tok.startsWith('[[')) out.push({ t: 'ref', v: tok.slice(2, -2).trim() });
    else if (tok.startsWith('[')) { const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!; out.push({ t: 'url', v: mm[1], href: mm[2] }); }
    else if (tok.startsWith('*') || tok.startsWith('_')) out.push({ t: 'i', v: tok.slice(1, -1) });
    else out.push({ t: 'url', v: tok, href: tok });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

/** The daily-check id for a to-do on an agenda checklist page. */
export const dailyCheckId = (pageId: string, key: string) => `doc:${pageId}:${key}`;
