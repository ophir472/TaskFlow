export type ItemKind = 'task' | 'reminder' | 'responsibility';
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
  forToday: boolean;
  toCheck: string;
  holdSchedule?: ScheduleSpec;
  priorityBoost: boolean;
  subtasks: Subtask[];
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
  bumpedAt: number;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface Responsibility {
  id: string;
  kind: 'responsibility';
  title: string;
  schedule: ScheduleSpec;
  status: 'active' | 'archived';
  priorityBoost: boolean;
  bumpedAt: number;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export type Item = Task | Reminder | Responsibility;

export interface ChangeRecord {
  ts: number;
  type: string;
  id: string;
  patch?: Partial<Item>;
}
