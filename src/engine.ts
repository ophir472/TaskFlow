import type { Item, Task } from './types';

export function scoreItem(item: Item): number {
  if (item.kind === 'reminder') return item.priorityBoost ? 100 : 0;
  const t = item as Task;
  let s = (t.urgent ? 6 : 0) + (t.important ? 3 : 0) + (t.quick ? 1 : 0) + (t.staleness ?? 0);
  if (t.priorityBoost) s += 100;
  return s;
}

export function buildQueue(items: Item[]): Item[] {
  const active = items.filter(it => {
    if (it.archived) return false;
    if (it.kind === 'task') {
      return it.status !== 'done' && it.status !== 'archived' &&
        (it.status !== 'waiting' || it.priorityBoost);
    }
    return it.status === 'active';
  });

  // When any tasks are marked for today, show only those
  const todayTasks = active.filter(it => it.kind === 'task' && (it as Task).forToday);
  const pool: Item[] = todayTasks.length > 0 ? todayTasks : active;

  const needsTag = pool.filter(
    it => it.kind === 'task' && !it.urgent && !it.important && !it.quick && !it.noTag
  ) as Task[];

  const ranked: Item[] = needsTag.length ? needsTag : pool;

  return [...ranked].sort(
    (a, b) => (scoreItem(b) - scoreItem(a)) || (a.bumpedAt - b.bumpedAt)
  );
}

export function nextId(prefix: string): string {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 6);
}

// Deep-clone a task into a new Item with a new id, "copy" suffix in the title,
// fresh timestamps, and freshly-generated subtask ids. Manual-order,
// today-flag, and priority-boost flags are cleared so the duplicate lands
// at its natural score position.
export function duplicateTask(original: Task): Task {
  const now = Date.now();
  return {
    ...original,
    id: nextId('t'),
    title: `${original.title} copy`,
    subtasks: (original.subtasks ?? []).map(sub => ({
      ...sub,
      id: 's' + Date.now() + Math.random().toString(36).slice(2, 5),
      createdAt: now,
    })),
    manuallyMoved: false,
    forToday: false,
    priorityBoost: false,
    status: 'backlog',
    archived: false,
    bumpedAt: 0,
    staleness: 0,
    createdAt: now,
    updatedAt: now,
    // clear jira ticket key so the copy isn't linked to same ticket, but keep
    // the label so users don't lose their custom section name
    jiraLink: '',
    extraJiraLinks: [],
    itsmTicket: '',
    extraItsmTickets: [],
  };
}

export function midnight(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}
