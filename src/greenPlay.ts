import type { Task, Item } from './types';

// A task is flagged for review when its own createdAt or updatedAt is newer than
// its personal reviewedAt marker. Every card carries its own timestamp, so
// closing mid-review leaves un-walked cards flagged for next time, and a card
// that finished all its steps stays out of the queue until it's modified again.
// Archived (completed) tasks are included on purpose.
export function isFlagged(t: Task): boolean {
  const reviewedAt = t.reviewedAt ?? 0;
  return t.createdAt > reviewedAt || t.updatedAt > reviewedAt;
}

// When the task joined the queue: its creation (never reviewed) or the edit
// that re-flagged it. Queue order = join order, so new arrivals join LAST.
export function flaggedAt(t: Task): number {
  const reviewedAt = t.reviewedAt ?? 0;
  return t.createdAt > reviewedAt ? t.createdAt : t.updatedAt;
}

export function flaggedTasks(items: Item[]): Task[] {
  return (items.filter(it => it.kind === 'task' && (it as Task).type !== 'mail' && isFlagged(it as Task)) as Task[])
    .sort((a, b) => flaggedAt(a) - flaggedAt(b));
}

export type StepKind =
  | 'createJira'
  | 'breakdown'
  | 'estimate'
  | 'updateJira'
  | 'closeJira'
  | 'email'
  | 'teams'
  | 'updateItsm'
  | 'closeItsm'
  | 'communicateItsm';

export interface Step {
  kind: StepKind;
  label: string;
  description: string;
  /** DOM data-review-target attribute to point the arrow at. */
  target: 'jira' | 'itsm' | 'subtasks' | 'estimate' | 'communication';
}

// Build the walkthrough steps for a task. Every admin step is shown for every
// card — filling in the Jira field (or adding subtasks, or setting an estimate)
// does not silently mark that step complete. The user must Space through each
// item themselves. The only structural filters are:
//   - `noJira`: user explicitly opted out of Jira for this task
//   - ITSM steps: only when the task actually has an ITSM ticket set
export function stepsFor(t: Task): Step[] {
  const out: Step[] = [];
  if (!t.noJira) {
    out.push({ kind: 'createJira', label: 'Create Jira', description: 'Add a Jira ticket for this task (or mark "no Jira needed").', target: 'jira' });
  }
  out.push({ kind: 'breakdown', label: 'Break into subtasks', description: 'Split the work into concrete subtasks — and sanity-check the existing ones.', target: 'subtasks' });
  out.push({ kind: 'estimate', label: 'Estimate time', description: 'Fill per-subtask estimates and the total (e.g. "2h", "30h").', target: 'estimate' });
  if (!t.noJira) {
    out.push({ kind: 'updateJira', label: 'Update Jira', description: 'Keep the Jira ticket in sync with the work you did.', target: 'jira' });
    out.push({ kind: 'closeJira', label: 'Close Jira', description: 'Close the linked Jira ticket if the task is done.', target: 'jira' });
  }
  out.push({ kind: 'email', label: 'Update via email', description: 'Log or send an email update. Add a note under the Email field if useful.', target: 'communication' });
  out.push({ kind: 'teams', label: 'Update via Teams', description: 'Log or send a Teams update. Add a note under the Teams field if useful.', target: 'communication' });
  if (t.itsmTicket) {
    out.push({ kind: 'updateItsm', label: 'Update ServiceNow', description: 'Keep the ITSM ticket in sync.', target: 'itsm' });
    out.push({ kind: 'closeItsm', label: 'Close ServiceNow', description: 'Close the ITSM ticket if the task is done.', target: 'itsm' });
    out.push({ kind: 'communicateItsm', label: 'Communicate ServiceNow update', description: 'Notify stakeholders about the ITSM ticket change.', target: 'communication' });
  }
  return out;
}
