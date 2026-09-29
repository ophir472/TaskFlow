// The Jira ticket follows the card's status — behind the scenes. TaskFlow's
// statuses and their UI are untouched; this only watches the store and, when
// a card with a Jira ticket changes status, walks the ticket along the host's
// flow (New > To do > In progress > Done) to the mapped status. The result is
// written back QUIETLY (jiraStatus — shown only next to the ticket).
//
// A store subscription (not a call inside each action) so every path is
// covered: card, popup, table, kanban drag, complete, archive/restore, review.
import { useStore } from './store';
import type { Task } from './types';
import { getJiraConfigForKey } from './jiraHosts';
import { jiraStatusFor, sameStatus } from './jiraFields';
import { moveJiraIssueTo } from './jira';

const pending = new Map<string, { taskId: string; target: string }>();   // by ticket key — latest target wins
const running = new Set<string>();
let unreachableUntil = 0;   // after a network failure, stay quiet for a while (home computer / VPN off)

async function drain(key: string) {
  if (running.has(key)) return;
  running.add(key);
  try {
    while (pending.has(key)) {
      const job = pending.get(key)!; pending.delete(key);
      const st = useStore.getState();
      const cfg = getJiraConfigForKey(st.jiraConfigs, key);
      if (!cfg || cfg.syncStatus === false || !cfg.apiToken?.trim()) continue;
      if (Date.now() < unreachableUntil) { st.setJiraSyncInfo(job.taskId, { error: `Jira unreachable — "${job.target}" not applied` }); continue; }
      try {
        const reached = await moveJiraIssueTo(cfg, key, job.target);
        useStore.getState().setJiraSyncInfo(job.taskId, { status: reached });
      } catch (err) {
        if (err instanceof Error && err.name === 'ApiUnreachableError') unreachableUntil = Date.now() + 5 * 60_000;
        useStore.getState().setJiraSyncInfo(job.taskId, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally { running.delete(key); }
}

let started = false;
export function startJiraStatusSync(): () => void {
  if (started) return () => {};
  started = true;
  const unsub = useStore.subscribe((state, prev) => {
    if (state.items === prev.items) return;
    const before = new Map(prev.items.map(it => [it.id, it]));
    for (const it of state.items) {
      if (it.kind !== 'task') continue;
      const t = it as Task;
      const key = (t.jiraLink ?? '').trim();
      if (!key || t.type === 'mail' || t.title.startsWith('[Tour] ')) continue;   // tour sample data never touches Jira
      const old = before.get(t.id) as Task | undefined;
      // Only a real status change on an existing card — not a create, a
      // restore, or the moment the ticket key is typed in.
      if (!old || old.kind !== 'task' || old.status === t.status) continue;
      const cfg = getJiraConfigForKey(state.jiraConfigs, key);
      if (!cfg || cfg.syncStatus === false) continue;
      const target = jiraStatusFor(cfg, t.status);
      if (!target || sameStatus(target, t.jiraStatus)) continue;
      pending.set(key, { taskId: t.id, target });
      void drain(key);
    }
  });
  return () => { unsub(); started = false; };
}
