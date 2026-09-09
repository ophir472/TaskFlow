import type { Item, Task, AgendaStep, SprintTypeToggles, ReviewSession, CustomSystem, DocNotebook } from './types';
import { leafCheckKeys, dailyCheckId } from './docBlocks';
import { buildSprintPool } from './components/Sprint/SprintMode';
import { flaggedTasks } from './greenPlay';

// ── Shared selectors for the Dashboard, its stat tiles, the agenda pipeline
// and Walkthrough mode. Pure store data — logs are never consulted. ──

export interface DashCounts {
  review: number;
  mail: number;
  sprint: number;
  quickhelp: number;
  open: number;
  nojira: number;
  unplannedToday: number;
  hubTickets: number;      // open (not-dismissed) ITSM + custom-system tickets
  todayTasks: Task[];       // active (not yet completed) today-tasks
  todayTotal: number;       // including already-completed ones
  todayRemaining: number;
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function dashCounts(
  items: Item[],
  sprintToggles: SprintTypeToggles,
  sprintOrder: string[],
  reviewSession: ReviewSession | null,
  customSystems: CustomSystem[] = [],
): DashCounts {
  const flagged = flaggedTasks(items);
  let review = flagged.length;
  if (reviewSession) {
    // Mirror the sidebar badge: un-walked session remainder + newly flagged.
    const remaining = reviewSession.taskIds.slice(reviewSession.cardIdx);
    const remainingIds = new Set(remaining);
    review = remaining.length + flagged.filter(t => !remainingIds.has(t.id)).length;
  }
  const activeTasks = items.filter((it): it is Task =>
    it.kind === 'task' && !it.archived && it.status !== 'done' && it.status !== 'archived');
  const today = startOfToday();
  // Completing archives the task but keeps forToday until the daily reset —
  // count archived ones toward the total so "today done" is detectable.
  const todayAll = items.filter((it): it is Task => it.kind === 'task' && it.type !== 'mail' && (it as Task).forToday);
  const todayTasks = todayAll.filter(t => !t.archived && t.status !== 'done' && t.status !== 'archived');
  const workTasks = activeTasks.filter(t => t.type !== 'mail');
  const hubTickets = workTasks.reduce((n, t) => {
    const marked = new Set(t.irrelevantTickets ?? []);
    const itsm = [t.itsmTicket, ...(t.extraItsmTickets ?? [])]
      .filter((tk): tk is string => !!tk?.trim() && !marked.has(`itsm:${tk.trim()}`)).length;
    const cs = customSystems.filter(sys => sys.showInHub !== false)
      .filter(sys => {
        const tk = (t.customTickets?.[sys.id] ?? '').trim();
        return tk && !marked.has(`cs:${sys.id}:${tk}`);
      }).length;
    return n + itsm + cs;
  }, 0);
  return {
    review,
    mail: activeTasks.filter(t => t.type === 'mail').length,
    sprint: buildSprintPool(items, sprintToggles, sprintOrder).length,
    quickhelp: activeTasks.filter(t => t.type === 'quick').length,
    open: activeTasks.filter(t => t.type !== 'mail').length,
    nojira: activeTasks.filter(t => (t.type === 'planned' || t.type === 'urgent') && !t.jiraLink?.trim()).length,
    unplannedToday: todayTasks.filter(t => (t.plannedAt ?? 0) < today).length,
    hubTickets,
    todayTasks,
    todayTotal: todayAll.length,
    todayRemaining: todayTasks.length,
  };
}

// ── Stat tiles — a data-driven registry; Settings picks which are shown ──

export interface TileDef {
  id: string;
  label: string;
  icon: string;
  color: string;      // accent for count + hover play
  hash: string;       // where clicking (or ▶) jumps
  preset?: string;    // Table filter applied on arrival (e.g. 'nojira')
  count: (c: DashCounts) => number;
}

export const TILE_DEFS: TileDef[] = [
  { id: 'review', label: 'To review', icon: '☑', color: 'oklch(0.5 0.14 150)', hash: 'review', count: c => c.review },
  { id: 'mail', label: 'Communications', icon: '✉', color: 'var(--t-amber)', hash: 'mail', count: c => c.mail },
  { id: 'sprint', label: 'Sprint items', icon: '▶', color: 'var(--t-quick)', hash: 'sprint', count: c => c.sprint },
  { id: 'quickhelp', label: 'Quick help', icon: '⚡', color: 'var(--t-quick)', hash: 'quickhelp', count: c => c.quickhelp },
  { id: 'open', label: 'Open tasks', icon: '☰', color: 'var(--t-acc)', hash: 'table', count: c => c.open },
  { id: 'nojira', label: 'No Jira yet', icon: '⧉', color: 'var(--t-urgent)', hash: 'table', preset: 'nojira', count: c => c.nojira },
  { id: 'unplannedToday', label: 'Unplanned today', icon: '◷', color: 'var(--t-amber)', hash: 'plan', count: c => c.unplannedToday },
  { id: 'hub', label: 'Open tickets', icon: '▣', color: 'var(--t-acc)', hash: 'hub', count: c => c.hubTickets },
];

// ── Agenda pipeline — built-in step metadata + completion detection ──

export const BUILTIN_STEPS: Record<string, { label: string; icon: string; hash: string; hint: string }> = {
  review: { label: 'Review', icon: '☑', hash: 'review', hint: 'Walk every new/changed task — done when the review queue is empty' },
  sweep: { label: 'Sweep', icon: '⟳', hash: 'mail/sweep', hint: 'Skim Outlook + Teams, jot subject + key point per item (no replying) — Done ends the sweep' },
  plan: { label: 'Plan', icon: '◷', hash: 'plan', hint: "Write each today-task's steps — done when nothing today is unplanned" },
  mail: { label: 'Communication', icon: '✉', hash: 'mail', hint: 'Answer what you owe — done when no mail entries are pending' },
  sprint: { label: 'Sprint', icon: '▶', hash: 'sprint', hint: 'Blitz the quick stuff — done when the sprint pool is empty' },
  today: { label: "Today's tasks", icon: '★', hash: 'feed', hint: "Work the plan — done when every today-task is completed" },
};

export function defaultAgendaSteps(): AgendaStep[] {
  return ['review', 'sweep', 'plan', 'mail', 'sprint', 'today'].map(k => ({ id: k, builtin: k as AgendaStep['builtin'], label: BUILTIN_STEPS[k].label }));
}

/** Page-content lookup for checklist steps (pass to stepDone). */
export function docPageContentLookup(notebooks: DocNotebook[]): (pageId: string) => string | null {
  const map = new Map<string, string>();
  notebooks.forEach(nb => nb.categories.forEach(c => c.pages.forEach(p => map.set(p.id, p.content))));
  return id => map.get(id) ?? null;
}

/** Checklist step progress: [ticked today, total leaf to-dos]. */
export function checklistProgress(pageId: string, content: string, todayChecks: Set<string>): [number, number] {
  const keys = leafCheckKeys(content);
  return [keys.filter(k => todayChecks.has(dailyCheckId(pageId, k))).length, keys.length];
}

/** Whether a step is complete. Built-ins derive from live counts; custom
 *  steps are manual checks (per-day, reset at midnight); checklist steps are
 *  done when every leaf to-do on their Docs page is ticked today. */
export function stepDone(step: AgendaStep, c: DashCounts, todayChecks: Set<string>, pageContent?: (pageId: string) => string | null): boolean {
  if (step.docPageId) {
    const content = pageContent?.(step.docPageId);
    if (content == null) return false;
    const [done, total] = checklistProgress(step.docPageId, content, todayChecks);
    return total > 0 && done === total;
  }
  switch (step.builtin) {
    case 'review': return c.review === 0;
    case 'sweep': return todayChecks.has('sweep');   // the sweep's Done button (per day)
    case 'plan': return c.todayTotal > 0 && c.unplannedToday === 0;
    case 'mail': return c.mail === 0;
    case 'sprint': return c.sprint === 0;
    case 'today': return c.todayTotal > 0 && c.todayRemaining === 0;
    default: return todayChecks.has(step.id);
  }
}

export const todayKey = () => new Date().toISOString().slice(0, 10);
