// Bookmarks helpers checks (2026-09-10): URL normalisation, keywords, task
// link mirroring, the search query, Chrome HTML export. Run: npm run check:bookmarks
import { normalizeUrl, keywords, looksLikeLink, upsertTaskLinks, parseBookmarkQuery, matchesBookmark, duplicateKeys, toChromeHtml, folderPath, descendantFolderIds, isUrl } from '../src/bookmarks.ts';
const eq = (name: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name, ok ? '' : `\n   got ${JSON.stringify(a)}\n   want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

eq('isUrl', [isUrl('https://a.io/x'), isUrl('http://ex'), isUrl('notaurl'), isUrl('https://exa')], [true, false, false, false]);
eq('normalizeUrl strips www/utm/hash/trailing slash', normalizeUrl('https://www.Example.com/a/b/?utm_source=x&id=2#frag'), 'example.com/a/b?id=2');
eq('looksLikeLink accepts scheme-less / intranet links', ['wiki.corp/x', 'confluence/display/ABC', 'itsm:8080/nav', 'localhost:5173', 'www.a.io', 'just words', 'hello', 'Design doc'].map(looksLikeLink), [true, true, true, true, true, false, false, false]);
eq('keywords', keywords('Fix the VPN login for Dana', 'Runbook'), ['fix', 'vpn', 'login', 'dana', 'runbook']);

const task: any = { id: 't1', kind: 'task', title: 'Migrate billing DB', generalLink: 'wiki.corp/billing', generalLinkLabel: 'Design doc', extraGeneralLinks: ['jira/browse/BIL-12', 'not a url'], extraGeneralLinkLabels: ['', ''], project: 'Billing', requester: 'Dana', subtasks: [{ id: 's1', title: 'Dump schema', generalLink: 'https://gist.github.com/1' }] };
const b1 = upsertTaskLinks([], task, 1000)!;
eq('mirrors 3 links (bad url skipped)', b1.map(b => b.source!.field), ['generalLink', 'extra:0', 'sub:s1']);
eq('scheme-less links stored with https://', b1.map(b => b.url), ['https://wiki.corp/billing', 'https://jira/browse/BIL-12', 'https://gist.github.com/1']);
eq('title = label / task title / subtask title', b1.map(b => b.title), ['Design doc', 'Migrate billing DB', 'Dump schema']);
eq('tags: task + keywords', b1[0].tags, ['task', 'migrate', 'billing', 'design', 'doc', 'dana']);
eq('no change → null', upsertTaskLinks(b1, task, 2000), null);
const edited = b1.map(b => b.source!.field === 'generalLink' ? { ...b, title: 'My title', tags: ['mine'], auto: false } : b);
const b2 = upsertTaskLinks(edited, { ...task, generalLink: 'https://wiki.corp/billing-v2' }, 3000)!;
eq('hand-edited bookmark keeps title/tags, follows url', [b2[0].title, b2[0].tags, b2[0].url], ['My title', ['mine'], 'https://wiki.corp/billing-v2']);

const q = parseBookmarkQuery('billing tag:task #design is:dup folder:"Work stuff" is:favorite');
eq('query parse', [q.text, q.tags, q.folder, [...q.is]], ['billing', ['task', 'design'], 'work stuff', ['dup', 'favorite']]);
const folders = [{ id: 'f1', name: 'Work', parentId: null, createdAt: 1 }, { id: 'f2', name: 'Stuff', parentId: 'f1', createdAt: 1 }];
eq('folderPath', folderPath(folders, 'f2'), 'Work › Stuff');
eq('descendants', [...descendantFolderIds(folders, 'f1')], ['f1', 'f2']);
const bm = (o: any) => ({ id: 'x', url: 'https://a.io', title: 'T', notes: '', tags: [], folderId: null, favorite: false, createdAt: 1, updatedAt: 1, ...o });
const ctx = { folderName: (id: string | null) => folderPath(folders, id), taskTitle: (id: string) => (id === 't1' ? 'Migrate billing DB' : ''), dupKeys: duplicateKeys([bm({ url: 'https://a.io/p' }), bm({ id: 'y', url: 'http://www.a.io/p/' })]) };
eq('free text matches the source task title', matchesBookmark(bm({ source: { taskId: 't1', field: 'generalLink' } }), parseBookmarkQuery('billing'), ctx), true);
eq('tag filter is AND', matchesBookmark(bm({ tags: ['a'] }), parseBookmarkQuery('tag:a tag:b'), ctx), false);
eq('folder: matches the path', matchesBookmark(bm({ folderId: 'f2' }), parseBookmarkQuery('folder:work'), ctx), true);
eq('is:dup uses normalized urls', [matchesBookmark(bm({ url: 'https://a.io/p' }), parseBookmarkQuery('is:dup'), ctx), matchesBookmark(bm({ url: 'https://b.io' }), parseBookmarkQuery('is:dup'), ctx)], [true, false]);
const html = toChromeHtml(folders, [bm({ folderId: 'f2', title: 'A <b>', tags: ['x', 'y'] }), bm({ id: 'r', title: 'Root' })]);
eq('chrome html has nested folders + escaped title + tags', [html.includes('<H3 ADD_DATE="0">Work</H3>'), html.includes('A &lt;b&gt;'), html.includes('TAGS="x,y"'), html.indexOf('Root') < html.indexOf('Work')], [true, true, true, true]);
