import { nextId } from './engine';
import type { Task } from './types';

// The ONE place a communication-assistant entry is constructed — used by the
// assistant's capture box, the card's "To send" table, and Play's m shortcut.
export function buildMailEntry(title: string, linkedTaskId?: string): Task {
  const now = Date.now();
  return {
    id: nextId('t'), kind: 'task', type: 'mail',
    ...(linkedTaskId ? { linkedTaskId } : {}),
    title, description: '', notes: '', blockers: '', generalLink: '', jiraLink: '',
    requester: '', project: '', status: 'backlog',
    urgent: false, important: false, quick: false, noTag: true, noJira: true,
    forToday: false, toCheck: '', priorityBoost: false, subtasks: [],
    bumpedAt: now, staleness: 0, createdAt: now, updatedAt: now, archived: false,
  };
}
