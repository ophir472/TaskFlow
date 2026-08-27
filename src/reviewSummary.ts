import type { Item, Task } from './types';

// Build a done-report for a day range from STORE data only (never the logs —
// they're forensic). Sources: archived/done tasks (completion bumps
// updatedAt), created tasks, subtasks with doneAt/changedAt stamps, planned
// stamps, and archived mail entries.
export function buildReviewSummary(items: Item[], since: number, until: number): string {
  const inRange = (ts?: number) => !!ts && ts >= since && ts < until;
  const tasks = items.filter((it): it is Task => it.kind === 'task' && it.type !== 'mail');
  const mail = items.filter((it): it is Task => it.kind === 'task' && it.type === 'mail');

  const completed = tasks.filter(t => (t.archived || t.status === 'done') && inRange(t.updatedAt));
  const completedIds = new Set(completed.map(t => t.id));
  // "Progressed" is a plain yes/no: a step closed that day (doneAt), a step
  // changed that day, or — for pre-stamp data — any done step on a task
  // touched that day.
  const progressed = tasks.filter(t => !completedIds.has(t.id) &&
    (t.subtasks.some(s => (s.done && inRange(s.doneAt)) || inRange(s.changedAt)) ||
     (inRange(t.updatedAt) && t.subtasks.some(s => s.done))));
  const created = tasks.filter(t => inRange(t.createdAt));
  const planned = tasks.filter(t => inRange(t.plannedAt));
  const mailHandled = mail.filter(m => m.archived && inRange(m.updatedAt));

  const ticket = (t: Task) => t.jiraLink?.trim() ? ` (${t.jiraLink.trim()})` : t.itsmTicket?.trim() ? ` (${t.itsmTicket.trim()})` : '';
  const lines: string[] = [];
  const section = (title: string, rows: string[]) => {
    if (rows.length) lines.push(`${title} (${rows.length}):`, ...rows.map(r => `- ${r}`), '');
  };

  section('Completed', completed.map(t => `${t.title}${ticket(t)}`));
  section('Progressed', progressed.map(t => {
    const steps = t.subtasks.filter(s => (s.done && inRange(s.doneAt)) || inRange(s.changedAt)).map(s => s.title);
    return `${t.title}${ticket(t)} — ${steps.join('; ')}`;
  }));
  section('Created', created.map(t => `${t.title}${ticket(t)}`));
  section('Communications handled', mailHandled.map(m => m.title));
  if (planned.length) lines.push(`Planned: ${planned.length} task${planned.length !== 1 ? 's' : ''} (${planned.map(t => t.title).join(', ')})`, '');

  return lines.length ? lines.join('\n').trimEnd() : 'Nothing recorded for this day.';
}

export function dayRange(daysAgo: number): { since: number; until: number; label: string } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  const since = d.getTime();
  const until = since + 86_400_000;
  const label = d.toISOString().slice(0, 10);
  return { since, until, label };
}
