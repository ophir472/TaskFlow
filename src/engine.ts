import type { Item, Task } from './types';

export function scoreItem(item: Item): number {
  if (item.kind === 'reminder') return item.priorityBoost ? 100 : 0;
  if (item.kind === 'responsibility') return 0;
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

  const needsTag = active.filter(
    it => it.kind === 'task' && !it.urgent && !it.important && !it.quick && !it.noTag
  ) as Task[];

  let pool: Item[] = active;
  if (needsTag.length) pool = needsTag;

  return [...pool].sort(
    (a, b) => (scoreItem(b) - scoreItem(a)) || (a.bumpedAt - b.bumpedAt)
  );
}

export function nextId(prefix: string): string {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 6);
}

export function midnight(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}
