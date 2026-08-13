export type ItemKind = 'task' | 'reminder';
export type TaskStatus = 'in_progress' | 'backlog' | 'waiting' | 'done' | 'archived';

// ── Schedule types ──────────────────────────────────────────────

export interface OnceSchedule { type: 'once'; at: number }

export type RecurFreq = 'daily' | 'weekly' | 'monthly';
export interface DailyRule { freq: 'daily'; every: number }
export interface WeeklyRule { freq: 'weekly'; every: number; days: number[] }
// `every` on monthly rules: fire every N months (3 = quarterly). Optional for
// backward compatibility — absent means 1.
export interface MonthlyDayRule { freq: 'monthly'; variant: 'dayOfMonth'; day: number; every?: number }
export interface MonthlyOrdinalRule {
  freq: 'monthly'; variant: 'ordinal';
  ordinal: 1 | 2 | 3 | 4 | -1;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  every?: number;
}
export type RecurRule = DailyRule | WeeklyRule | MonthlyDayRule | MonthlyOrdinalRule;
export interface RecurringSchedule {
  type: 'recurring';
  rule: RecurRule;
  // Time of day occurrences fire at. Optional for backward compatibility:
  // absent keeps the legacy behavior (daily/weekly inherit the trigger's
  // clock time, monthly fires at 09:00).
  time?: { hour: number; minute: number };
}
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
  // Stable id — used as React key + as the identifier for update/remove
  // actions. Generated on creation, never reused.
  id: string;
  host: string;
  username: string;
  apiToken: string;
  projectKey: string;
  component: string;
  defaultAssigneeId: string;
  // Numeric project id (the `pid` in Jira create URLs). When set, API creates
  // use project:{id} instead of project:{key}.
  pid?: string;
  // Numeric issue type id (e.g. "3"). Absent → issuetype name "Task".
  issueTypeId?: string;
  // Numeric priority id (e.g. "3"). Absent → project default priority.
  priorityId?: string;
  // Summary template applied when creating a ticket from a task.
  // "<TASK NAME>" is replaced with the TaskFlow task title, e.g.
  // "blah 123456 <TASK NAME> more words". Empty → title used as-is. The
  // result is still editable per-ticket in the create prompt.
  summaryTemplate?: string;
  // Override: a fully self-contained Jira create URL (host, pid, issuetype,
  // priority, assignee, component all baked in). When set, "Create in Jira"
  // OPENS this URL in a new tab instead of calling the REST API — only the
  // dynamic parts (summary, description) are injected via {summary} /
  // {description} placeholders, or appended as query params if no
  // placeholders are present. Credentials above remain in use for comments,
  // transitions and other API features.
  createUrlTemplate?: string;
  // Exactly one entry has isDefault=true. The default is used for "Create Jira"
  // (in the card and in Green Play review) and as the fallback host when a
  // pasted ticket's project prefix doesn't match any configured entry.
  isDefault: boolean;
}

// A saved Jira kanban board — rendered as a button on the Kanban page.
export interface JiraBoard {
  id: string;
  label: string;
  url: string;
}

export interface ItsmConfig {
  host: string;
  // Override for opening tickets: the ticket number from the card is appended
  // directly after this URL (e.g. "https://itsm/nav?number=" + "INC0012345").
  // Empty → default https://HOST/incident.do?sysparm_query=number=TICKET.
  customUrl?: string;
  // REST credentials for status sync (Table API, Basic auth). Both empty →
  // sync is off and the card shows no status indicators.
  username?: string;
  apiToken?: string;
}

// ── ServiceNow ticket creation ──────────────────────────────────

export type SnTicketType = 'INC' | 'CHG';

// One ServiceNow field the organization uses — the list is dynamic and
// settings-controlled. `key` is the exact parameter name sent to ServiceNow;
// `label` is display-only in the template editors.
export interface SnField {
  id: string;
  key: string;
  label: string;
}

export interface SnTemplate {
  id: string;
  name: string;
  type: SnTicketType;
  templateNumber: string;
  instructions: string;
  confluenceLink: string;
  exampleTicket: string;
  emailDL: string;
  // SnField.id → value. Values containing "FILL" are prompted for in the
  // create menu before the ServiceNow URL opens.
  fieldValues: Record<string, string>;
}

export interface SnConfig {
  // Create-URL template per ticket type — fully org-controlled. {fields} is
  // replaced with all non-empty key=value pairs (values URL-encoded) joined
  // by fieldSeparator; {<field key>} injects a single value anywhere in the
  // URL/URI. With no tokens, pairs are appended as query params.
  incUrlTemplate: string;
  chgUrlTemplate: string;
  fieldSeparator: string;
  fields: SnField[];
  templates: SnTemplate[];
  // Per-type default ticket: a field a template leaves empty inherits its
  // type's default here. SnField.id → value.
  defaultFieldValues: Record<SnTicketType, Record<string, string>>;
}

// ── Docs (notebook > category > page, OneNote-style) ────────────

export type DocPageType = 'doc' | 'links';

export interface DocPage {
  id: string;
  title: string;
  // 'doc' renders markdown-lite (headings fold, checkboxes toggle);
  // 'links' renders "NAME: URL" lines as clickable squares.
  type: DocPageType;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocCategory {
  id: string;
  name: string;
  pages: DocPage[];
}

export interface DocNotebook {
  id: string;
  name: string;
  categories: DocCategory[];
}

// ── AI assignment ───────────────────────────────────────────────

export type AiApiFormat = 'openai' | 'anthropic';

// Fully org-controlled AI endpoint: the exact URL is POSTed to, the format
// only decides body shape + auth header style. The model's reply is shown
// once and written to the forensic log — never stored in app state.
export interface AiConfig {
  endpointUrl: string;
  format: AiApiFormat;
  model: string;
  apiKey: string;
  // Optional JSON object merged into the request headers (corporate gateways).
  extraHeaders: string;
  // Prompt template. <TITLE>, <DESCRIPTION>, <NOTES>, <BLOCKERS>, <SUBTASKS>,
  // <JIRA>, <ITSM>, <LINK>, <REQUESTER>, <PROJECT> are filled from the task.
  promptTemplate: string;
}

export interface CommunicationField {
  id: string;
  label: string;
  value: string;
}

// "Waiting for" table on a card: user-defined columns (2 by default), rows
// that can be struck through (done=true) when the wait is over.
export interface WaitingForRow {
  id: string;
  cells: string[];
  done: boolean;
}
export interface WaitingForTable {
  columns: string[];
  rows: WaitingForRow[];
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
  // Communication-assistant entry (fast mail/Teams triage). Mail tasks live
  // in the table/archive but are excluded from the card-feed queue, Kanban
  // and the review flow.
  type?: 'mail';
  whatIWantToSay?: string;
  mailToSend?: string;
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
  waitingFor?: WaitingForTable;
  // Timestamp of the last time this task was walked through the Green Play review.
  // undefined means "never reviewed". Compared against createdAt/updatedAt to decide
  // whether the task is still in the review queue.
  reviewedAt?: number;
  // ServiceNow sync for the primary ITSM ticket: last fetched status +
  // server-side update time, and when the user last opened the ticket (↗).
  // Set QUIETLY (no updatedAt bump / history) so background sync never flags
  // the task as changed for the review queue or version history.
  itsmStatus?: string;
  itsmUpdatedOn?: number;
  itsmViewedAt?: number;
  // When the notes field last changed. Store-derived (set by updateItem), so
  // features like the review's update-summary prefill never need to consult
  // the forensic logs — logs are logs, not a functional dependency.
  notesChangedAt?: number;
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
