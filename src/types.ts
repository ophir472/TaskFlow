export type ItemKind = 'task' | 'reminder';
export type TaskStatus = 'in_progress' | 'backlog' | 'waiting' | 'done' | 'archived';

// ── Schedule types ──────────────────────────────────────────────

export interface OnceSchedule { type: 'once'; at: number }

export type RecurFreq = 'daily' | 'weekly' | 'monthly';
export interface DailyRule { freq: 'daily'; every: number }
export interface WeeklyRule { freq: 'weekly'; every: number; days: number[] }
export interface MonthlyDayRule { freq: 'monthly'; variant: 'dayOfMonth'; day: number }
export interface MonthlyOrdinalRule {
  freq: 'monthly'; variant: 'ordinal';
  ordinal: 1 | 2 | 3 | 4 | -1;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}
export type RecurRule = DailyRule | WeeklyRule | MonthlyDayRule | MonthlyOrdinalRule;
export interface RecurringSchedule { type: 'recurring'; rule: RecurRule }
export type ScheduleSpec = OnceSchedule | RecurringSchedule;

// ── Custom fields ───────────────────────────────────────────────

export interface CustomField {
  id: string;
  name: string;
  showInTable: boolean;
  showInCard: boolean;
}

// ── Item types ──────────────────────────────────────────────────

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  isNext: boolean;
  jira: string;
  generalLink: string;
  notes: string;
  blockers: string;
  // Free-text per-subtask time estimate (e.g. "2h", "half a day").
  estimate?: string;
  createdAt: number;
}

export interface JiraConfig {
  host: string;
  username: string;
  apiToken: string;
  projectKey: string;
  component: string;
  defaultAssigneeId: string;
}

export interface ItsmConfig {
  host: string;
}

export interface CommunicationField {
  id: string;
  label: string;
  value: string;
}

export interface Task {
  id: string;
  kind: 'task';
  title: string;
  description: string;
  notes: string;
  blockers: string;
  generalLink: string;
  jiraLink: string;
  requester: string;
  project: string;
  status: TaskStatus;
  urgent: boolean;
  important: boolean;
  quick: boolean;
  noTag: boolean;
  noJira?: boolean;
  forToday: boolean;
  manuallyMoved?: boolean;
  extraJiraLinks?: string[];
  jiraLabel?: string;
  jiraLinkLabel?: string;
  extraJiraLinkLabels?: string[];
  itsmLabel?: string;
  itsmTicketLabel?: string;
  extraItsmTicketLabels?: string[];
  generalLinkLabel?: string;
  extraGeneralLinks?: string[];
  extraGeneralLinkLabels?: string[];
  itsmTicket?: string;
  extraItsmTickets?: string[];
  toCheck: string;
  holdSchedule?: ScheduleSpec;
  // Status the task had immediately before it went on hold. Restored by the
  // auto-return tick when the hold expires so a task that was "in_progress"
  // resumes as "in_progress" (not just "backlog").
  preHoldStatus?: TaskStatus;
  priorityBoost: boolean;
  subtasks: Subtask[];
  // Free-text total estimate for the task (e.g. "30h", "2 sprints").
  estimate?: string;
  // Deprecated — kept so old snapshots deserialize cleanly. Not rendered.
  timeEstimateMinutes?: number;
  communications?: CommunicationField[];
  // Per-field resize memory. Key = field key (e.g. "notes", "blockers",
  // "description", "cf:<id>"). Value = height in pixels the user resized to.
  fieldSizes?: Record<string, number>;
  // Timestamp of the last time this task was walked through the Green Play review.
  // undefined means "never reviewed". Compared against createdAt/updatedAt to decide
  // whether the task is still in the review queue.
  reviewedAt?: number;
  // Set on tasks auto-created by a Responsibility. Points at Responsibility.id
  // so the task can display a "from: <name>" pill and the schedule can avoid
  // re-firing while an unfinished previous instance still exists.
  fromResponsibilityId?: string;
  bumpedAt: number;
  staleness: number;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  customValues?: Record<string, string>;
}

export interface Reminder {
  id: string;
  kind: 'reminder';
  title: string;
  schedule: ScheduleSpec;
  status: 'active' | 'archived';
  priorityBoost: boolean;
  // When to pop the reminder up on screen next. Advances when the user
  // snoozes or completes an occurrence.
  nextFireAt: number;
  bumpedAt: number;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

// A Responsibility is a recurring obligation (Lomda hours, Confluence, etc.)
// that auto-generates a Task when due. It's NOT an Item — it lives in its own
// store slice and only produces Tasks.
export interface Responsibility {
  id: string;
  name: string;
  description: string;
  // Reuses the existing recurrence types (daily/weekly/monthly). A one-off
  // "once" schedule is technically allowed but doesn't really fit — the UI
  // steers users toward a recurring rule.
  recurrence: ScheduleSpec;
  // Copied into every generated Task. `title` defaults to `name` if empty.
  taskTemplate: {
    title: string;
    description: string;
  };
  lastTriggeredAt?: number;
  nextDueAt: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type Item = Task | Reminder;

export interface ChangeRecord {
  ts: number;
  type: string;
  id: string;
  patch?: Partial<Item>;
}

// In-progress Green Play review session — persisted so closing the popup
// (or the browser) mid-walkthrough resumes right where it left off, with the
// original frozen list of cards and per-task reviewedAt baseline.
export interface ReviewSession {
  taskIds: string[];
  cardIdx: number;
  stepIdx: number;
  initialReviewedAt: Record<string, number>;
  startedAt: number;
}
