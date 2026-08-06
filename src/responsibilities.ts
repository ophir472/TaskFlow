import type { Responsibility, Task, Item, ScheduleSpec } from './types';
import { nextOccurrence, formatSchedule } from './scheduleEngine';
import { nextId } from './engine';

/**
 * Compute the next-due timestamp after `from` given a recurrence rule.
 * Reuses scheduleEngine.nextOccurrence — a "once" schedule returns its own
 * `at`, so Responsibilities are typically configured with a recurring rule.
 */
export function computeNextDueAt(rule: ScheduleSpec, from: number): number {
  return nextOccurrence(rule, from);
}

export function isDue(resp: Responsibility, now: number = Date.now()): boolean {
  if (!resp.active) return false;
  return resp.nextDueAt <= now;
}

/**
 * True when a task auto-generated from this Responsibility is still open —
 * i.e. exists in the items list and isn't done or archived. Prevents the
 * scheduler from creating a duplicate task while the previous one still
 * hasn't been handled.
 */
export function hasOpenGeneratedTask(resp: Responsibility, items: Item[]): boolean {
  return items.some(it =>
    it.kind === 'task' &&
    (it as Task).fromResponsibilityId === resp.id &&
    !it.archived &&
    (it as Task).status !== 'done' &&
    (it as Task).status !== 'archived'
  );
}

/**
 * Build the Task that this Responsibility would create right now. Kept
 * separate from the scheduler so the store can call it directly.
 */
export function buildGeneratedTask(resp: Responsibility): Task {
  const now = Date.now();
  return {
    id: nextId('t'),
    kind: 'task',
    title: (resp.taskTemplate.title || resp.name).trim(),
    description: resp.taskTemplate.description || '',
    notes: '',
    blockers: '',
    generalLink: '',
    jiraLink: '',
    requester: '',
    project: '',
    status: 'backlog',
    urgent: false,
    important: false,
    quick: false,
    noTag: false,
    forToday: false,
    toCheck: '',
    priorityBoost: false,
    subtasks: [],
    fromResponsibilityId: resp.id,
    bumpedAt: 0,
    staleness: 0,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

export interface TriggerResult {
  generatedTask?: Task;
  updatedResponsibility: Responsibility;
  skipped?: 'not-due' | 'inactive' | 'previous-open';
}

/**
 * Decide what to do with a Responsibility this tick:
 *   - Not due yet → skipped: not-due
 *   - Paused → skipped: inactive
 *   - Previous auto-task still open → skipped: previous-open (leave nextDueAt
 *     alone so as soon as that task closes and the next tick runs, we'll fire).
 *   - Otherwise → build a Task, advance lastTriggeredAt + nextDueAt.
 */
export function triggerIfDue(
  resp: Responsibility,
  items: Item[],
  now: number = Date.now(),
): TriggerResult {
  if (!resp.active) return { updatedResponsibility: resp, skipped: 'inactive' };
  if (resp.nextDueAt > now) return { updatedResponsibility: resp, skipped: 'not-due' };
  if (hasOpenGeneratedTask(resp, items)) return { updatedResponsibility: resp, skipped: 'previous-open' };

  const generatedTask = buildGeneratedTask(resp);
  const updatedResponsibility: Responsibility = {
    ...resp,
    lastTriggeredAt: now,
    nextDueAt: computeNextDueAt(resp.recurrence, now),
    updatedAt: now,
  };
  return { generatedTask, updatedResponsibility };
}

/**
 * Human-readable summary of a Responsibility's recurrence + next-due state,
 * used in the Settings table and the dedicated page.
 */
export function summarizeResponsibility(resp: Responsibility): string {
  const rule = formatSchedule(resp.recurrence);
  const due = new Date(resp.nextDueAt);
  const now = new Date();
  const sameDay = due.toDateString() === now.toDateString();
  const dueLabel = sameDay ? `today ${due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : due.toLocaleDateString();
  return `${rule} · next ${dueLabel}`;
}
