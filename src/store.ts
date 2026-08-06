import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Item, Task, Subtask, ChangeRecord, ScheduleSpec, CustomField, JiraConfig, ItsmConfig, CommunicationField, ReviewSession, Responsibility } from './types';
import { triggerIfDue, computeNextDueAt } from './responsibilities';
import { nextOccurrence } from './scheduleEngine';
import { midnight } from './engine';

// Fire-and-forget log helper. Dynamic import avoids circular dep at module init.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slog(event: string, data?: any): void {
  import('./snapshots').then(m => m.log(event, data)).catch(() => {});
}

const PROMOTION_GOAL = 3;

// Cached at module init. A tab is either preview or real for its entire lifetime.
// See snapshots.ts IS_PREVIEW_MODE for why we cache (browsing inside the preview
// changes the URL, which would flip this flag mid-session).
const IS_PREVIEW_MODE = typeof window !== 'undefined' && window.location.hash.startsWith('#preview/');

export type View = 'feed' | 'kanban' | 'table' | 'archive' | 'settings';

interface AppState {
  items: Item[];
  requesters: string[];
  projects: string[];
  customFields: CustomField[];
  promotionsToday: number;
  dailyResetAt: number;
  view: View;
  sidebarCollapsed: boolean;
  history: ChangeRecord[];
  promotionGoal: number;
  displayId: string | null;
  triggerTagForId: string | null;
  themeId: string;
  customAccent: string | null;
  customBg: string | null;
  jiraConfig: JiraConfig | null;
  itsmConfig: ItsmConfig | null;
  taskOrder: string[];
  tableVisibleCols: string[] | null;
  archiveVisibleCols: string[] | null;
  tableColWidths: Record<string, number>;
  archiveColWidths: Record<string, number>;
  reviewSession: ReviewSession | null;
  responsibilities: Responsibility[];
  // Reminders whose nextFireAt has passed and the popup is queued for them.
  // Transient — not persisted, rebuilt from items on every app open by the
  // checkRemindersDue tick.
  pendingReminderIds: string[];

  setDisplayId: (id: string | null) => void;
  setTriggerTagForId: (id: string | null) => void;
  setTheme: (themeId: string, customAccent?: string | null, customBg?: string | null) => void;
  updateItem: (id: string, patch: Partial<Item>) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  updateSubtask: (parentId: string, subId: string, patch: Partial<Subtask>) => void;
  addSubtask: (parentId: string, title: string) => void;
  deleteSubtask: (parentId: string, subId: string) => void;
  toggleTag: (id: string, key: 'urgent' | 'important' | 'quick' | 'noTag') => void;
  toggleSubtaskDone: (parentId: string, subId: string) => void;
  toggleSubtaskNext: (parentId: string, subId: string) => void;
  continueItem: (id: string) => void;
  holdItem: (id: string, toCheck: string, schedule?: ScheduleSpec) => void;
  rescheduleReminder: (id: string, schedule: ScheduleSpec) => void;
  completeItem: (id: string) => 'archived' | 'rescheduled' | null;
  createItem: (item: Item) => void;
  archiveItem: (id: string) => void;
  deleteItem: (id: string) => void;
  unarchiveItem: (id: string) => void;
  addRequester: (name: string) => void;
  removeRequester: (name: string) => void;
  addProject: (name: string) => void;
  removeProject: (name: string) => void;
  addCustomField: (field: CustomField) => void;
  removeCustomField: (id: string) => void;
  updateCustomField: (id: string, patch: Partial<CustomField>) => void;
  updateItemCustomValue: (itemId: string, fieldId: string, value: string) => void;
  setView: (v: View) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setJiraConfig: (config: JiraConfig | null) => void;
  setItsmConfig: (config: ItsmConfig | null) => void;
  setTaskOrder: (order: string[]) => void;
  resetManualOrder: () => void;
  setTableVisibleCols: (cols: string[]) => void;
  setArchiveVisibleCols: (cols: string[]) => void;
  setTableColWidths: (widths: Record<string, number>) => void;
  setArchiveColWidths: (widths: Record<string, number>) => void;
  addCommunicationField: (taskId: string, label: string) => void;
  updateCommunicationField: (taskId: string, fieldId: string, patch: Partial<CommunicationField>) => void;
  deleteCommunicationField: (taskId: string, fieldId: string) => void;
  setFieldSize: (taskId: string, fieldKey: string, height: number) => void;
  markTaskReviewed: (id: string) => void;
  beginReview: (taskIds: string[], initialReviewedAt: Record<string, number>) => void;
  syncReviewSessionWithFlags: (flaggedIds: string[], initialReviewedAt: Record<string, number>) => void;
  updateReviewProgress: (cardIdx: number, stepIdx: number) => void;
  endReview: () => void;
  addResponsibility: (input: { name: string; description: string; recurrence: ScheduleSpec; taskTemplate?: { title?: string; description?: string } }) => void;
  updateResponsibility: (id: string, patch: Partial<Responsibility>) => void;
  removeResponsibility: (id: string) => void;
  toggleResponsibilityActive: (id: string) => void;
  checkResponsibilitiesDue: () => void;
  checkRemindersDue: () => void;
  snoozeReminderTo: (id: string, at: number) => void;
  completeReminderOccurrence: (id: string) => void;
  returnFromHold: (id: string) => void;
  checkHoldsDue: () => void;
  setForToday: (id: string, value: boolean) => void;
  checkDailyReset: () => void;
}

function pushHistory(history: ChangeRecord[], record: ChangeRecord): ChangeRecord[] {
  return [...history, record].slice(-100);
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      items: [],
      requesters: [],
      projects: [],
      customFields: [],
      promotionsToday: 0,
      dailyResetAt: midnight(),
      view: 'feed',
      sidebarCollapsed: false,
      history: [],
      promotionGoal: PROMOTION_GOAL,
      displayId: null,
      triggerTagForId: null,
      themeId: 'sand',
      customAccent: null,
      customBg: null,
      jiraConfig: null,
      itsmConfig: null,
      taskOrder: [],
      tableVisibleCols: null,
      archiveVisibleCols: null,
      tableColWidths: {},
      archiveColWidths: {},
      reviewSession: null,
      responsibilities: [],
      pendingReminderIds: [],

      setDisplayId: (id) => set({ displayId: id }),
      setTriggerTagForId: (id) => set({ triggerTagForId: id }),
      setTheme: (themeId, customAccent = null, customBg = null) => {
        slog('theme:set', { themeId, customAccent, customBg });
        set({ themeId, customAccent, customBg });
      },

      updateItem: (id, patch) => {
        slog('item:update', { id, fields: Object.keys(patch), patch });
        set(s => ({
          items: s.items.map(it => it.id === id ? { ...it, ...patch, updatedAt: Date.now() } as Item : it),
          history: pushHistory(s.history, { ts: Date.now(), type: 'update', id, patch: patch as Partial<Item> })
        }));
      },

      updateTask: (id, patch) => {
        slog('task:update', { id, fields: Object.keys(patch), patch });
        set(s => ({
          items: s.items.map(it => it.id === id && it.kind === 'task' ? { ...it, ...patch, updatedAt: Date.now() } : it),
          history: pushHistory(s.history, { ts: Date.now(), type: 'updateTask', id })
        }));
      },

      updateSubtask: (parentId, subId, patch) => {
        slog('subtask:update', { parentId, subId, fields: Object.keys(patch), patch });
        set(s => ({
          items: s.items.map(it =>
            it.id === parentId && it.kind === 'task'
              ? { ...it, subtasks: it.subtasks.map(su => su.id === subId ? { ...su, ...patch } : su), updatedAt: Date.now() }
              : it
          ),
          history: pushHistory(s.history, { ts: Date.now(), type: 'updateSubtask', id: subId })
        }));
      },

      toggleTag: (id, key) => {
        const it = get().items.find(x => x.id === id);
        const before = it?.kind === 'task' ? { urgent: it.urgent, important: it.important, quick: it.quick, noTag: it.noTag } : undefined;
        slog('tag:toggle', { id, key, before });
        set(s => ({
          items: s.items.map(it => {
            if (it.id !== id || it.kind !== 'task') return it;
            if (key === 'noTag') return { ...it, noTag: !it.noTag, urgent: false, important: false, quick: false, updatedAt: Date.now() };
            return { ...it, [key]: !(it as Task)[key], noTag: false, updatedAt: Date.now() };
          }),
          history: pushHistory(s.history, { ts: Date.now(), type: 'toggleTag', id })
        }));
      },

      toggleSubtaskDone: (parentId, subId) => {
        slog('subtask:toggle-done', { parentId, subId });
        set(s => {
          let promoted = false;
          const items = s.items.map(it => {
            if (it.id !== parentId || it.kind !== 'task') return it;
            const subtasks = it.subtasks.map(su => {
              if (su.id !== subId) return su;
              promoted = !su.done;
              return { ...su, done: !su.done };
            });
            return { ...it, subtasks, updatedAt: Date.now() };
          });
          return {
            items,
            promotionsToday: promoted ? s.promotionsToday + 1 : s.promotionsToday,
            history: pushHistory(s.history, { ts: Date.now(), type: 'subtaskDone', id: subId })
          };
        });
      },

      toggleSubtaskNext: (parentId, subId) => {
        slog('subtask:toggle-next', { parentId, subId });
        set(s => ({
          items: s.items.map(it =>
            it.id === parentId && it.kind === 'task'
              ? { ...it, subtasks: it.subtasks.map(su => ({ ...su, isNext: su.id === subId ? !su.isNext : false })) }
              : it
          )
        }));
      },

      addSubtask: (parentId, title) => {
        const id = 's' + Date.now() + Math.random().toString(36).slice(2, 5);
        import('./snapshots').then(m => m.log('subtask:create', { parentId, subId: id, title }));
        set(s => ({
          items: s.items.map(it =>
            it.id === parentId && it.kind === 'task'
              ? { ...it, subtasks: [...it.subtasks, { id, title, done: false, isNext: false, jira: '', generalLink: '', notes: '', blockers: '', createdAt: Date.now() }], updatedAt: Date.now() }
              : it
          ),
          history: pushHistory(s.history, { ts: Date.now(), type: 'addSubtask', id: parentId })
        }));
      },

      deleteSubtask: (parentId, subId) => {
        const parent = get().items.find(it => it.id === parentId);
        const sub = parent?.kind === 'task' ? parent.subtasks.find(s => s.id === subId) : undefined;
        import('./snapshots').then(m => m.log('subtask:delete', { parentId, subId, title: sub?.title, snapshot: sub }));
        set(s => ({
        items: s.items.map(it =>
          it.id === parentId && it.kind === 'task'
            ? { ...it, subtasks: it.subtasks.filter(su => su.id !== subId), updatedAt: Date.now() }
            : it
        ),
        history: pushHistory(s.history, { ts: Date.now(), type: 'deleteSubtask', id: subId })
      }));
      },

      continueItem: (id) => {
        slog('item:continue', { id });
        // Only bumpedAt — updatedAt would re-flag the task in Green Play review
        // as if it had been edited, even when the user just moved past it.
        set(s => ({
          items: s.items.map(it => it.id === id ? { ...it, bumpedAt: Date.now() } as Item : it),
          history: pushHistory(s.history, { ts: Date.now(), type: 'continue', id })
        }));
      },

      holdItem: (id, toCheck, schedule) => {
        slog('item:hold', { id, toCheck, schedule });
        set(s => ({
          items: s.items.map(it => {
            if (it.id !== id || it.kind !== 'task') return it;
            // Don't overwrite preHoldStatus if the task was already on hold and
            // is being re-scheduled — keep the original pre-hold status.
            const preHoldStatus = it.status === 'waiting' ? it.preHoldStatus : it.status;
            return { ...it, status: 'waiting', priorityBoost: false, toCheck, holdSchedule: schedule, preHoldStatus, updatedAt: Date.now() };
          }),
          history: pushHistory(s.history, { ts: Date.now(), type: 'hold', id })
        }));
      },

      rescheduleReminder: (id, schedule) => {
        slog('reminder:reschedule', { id, schedule });
        set(s => ({
          items: s.items.map(it =>
            it.id === id && it.kind === 'reminder'
              ? { ...it, schedule, bumpedAt: Date.now(), updatedAt: Date.now() }
              : it
          ),
          history: pushHistory(s.history, { ts: Date.now(), type: 'reschedule', id })
        }));
      },

      completeItem: (id) => {
        const item = get().items.find(it => it.id === id);
        if (!item) return null;
        slog('item:complete', { id, kind: item.kind, title: item.title });
        set(s => ({
          items: s.items.map(it => it.id === id ? { ...it, status: 'archived', archived: true, updatedAt: Date.now() } as Item : it),
          promotionsToday: item.kind === 'task' ? s.promotionsToday + 1 : s.promotionsToday,
          history: pushHistory(s.history, { ts: Date.now(), type: 'complete', id })
        }));
        return 'archived';
      },

      createItem: (item) => {
        // Seed a default Teams communication field on new tasks (unless already provided,
        // e.g. by duplicateTask which preserves the original's communications).
        // Seed nextFireAt on new reminders from their schedule.
        let seeded: Item = item;
        if (item.kind === 'task' && !(item as Task).communications) {
          seeded = { ...(item as Task), communications: [{ id: 'c' + Date.now() + Math.random().toString(36).slice(2, 5), label: 'Teams', value: '' }] } as Item;
        }
        if (seeded.kind === 'reminder' && !seeded.nextFireAt) {
          const sched = seeded.schedule;
          const initialAt = sched.type === 'once' ? sched.at : nextOccurrence(sched, Date.now());
          seeded = { ...seeded, nextFireAt: initialAt };
        }
        import('./snapshots').then(m => m.log('item:create', { id: seeded.id, kind: seeded.kind, title: seeded.title }));
        set(s => ({
          items: [...s.items, seeded],
          history: pushHistory(s.history, { ts: Date.now(), type: 'create', id: seeded.id })
        }));
      },

      archiveItem: (id) => {
        const item = get().items.find(it => it.id === id);
        import('./snapshots').then(m => m.log('item:archive', { id, title: item?.title }));
        set(s => ({
          items: s.items.map(it => it.id === id ? { ...it, archived: true, updatedAt: Date.now() } as Item : it),
          history: pushHistory(s.history, { ts: Date.now(), type: 'archive', id })
        }));
      },

      deleteItem: (id) => {
        const item = get().items.find(it => it.id === id);
        import('./snapshots').then(m => m.log('item:delete', { id, title: item?.title, snapshot: item }));
        set(s => ({
          items: s.items.filter(it => it.id !== id),
          history: pushHistory(s.history, { ts: Date.now(), type: 'delete', id })
        }));
      },

      unarchiveItem: (id) => {
        import('./snapshots').then(m => m.log('item:unarchive', { id }));
        set(s => ({
          items: s.items.map(it => it.id === id
            ? { ...it, archived: false, status: it.kind === 'task' ? 'backlog' : 'active', updatedAt: Date.now() } as Item
            : it
          ),
          history: pushHistory(s.history, { ts: Date.now(), type: 'unarchive', id })
        }));
      },

      addRequester: (name) => { slog('requester:add', { name }); set(s => ({ requesters: [...s.requesters, name] })); },
      removeRequester: (name) => { slog('requester:remove', { name }); set(s => ({ requesters: s.requesters.filter(r => r !== name) })); },
      addProject: (name) => { slog('project:add', { name }); set(s => ({ projects: [...s.projects, name] })); },
      removeProject: (name) => { slog('project:remove', { name }); set(s => ({ projects: s.projects.filter(p => p !== name) })); },

      addCustomField: (field) => { slog('customfield:add', field); set(s => ({ customFields: [...s.customFields, field] })); },
      removeCustomField: (id) => { slog('customfield:remove', { id }); set(s => ({ customFields: s.customFields.filter(f => f.id !== id) })); },
      updateCustomField: (id, patch) => {
        slog('customfield:update', { id, patch });
        set(s => ({ customFields: s.customFields.map(f => f.id === id ? { ...f, ...patch } : f) }));
      },
      updateItemCustomValue: (itemId, fieldId, value) => {
        slog('item:custom-value', { itemId, fieldId, value });
        set(s => ({
          items: s.items.map(it =>
            it.id === itemId && it.kind === 'task'
              ? { ...it, customValues: { ...(it.customValues ?? {}), [fieldId]: value }, updatedAt: Date.now() }
              : it
          )
        }));
      },

      // UI-only mutations — no need to log
      setView: (v) => set({ view: v }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setJiraConfig: (config) => { slog('jira-config:set', { host: config?.host, hasToken: !!config?.apiToken }); set({ jiraConfig: config }); },
      setItsmConfig: (config) => { slog('itsm-config:set', { host: config?.host }); set({ itsmConfig: config }); },
      setTaskOrder: (order) => { slog('task-order:set', { count: order.length }); set({ taskOrder: order }); },
      setTableVisibleCols: (cols) => { slog('table-cols:set', cols); set({ tableVisibleCols: cols }); },
      setArchiveVisibleCols: (cols) => { slog('archive-cols:set', cols); set({ archiveVisibleCols: cols }); },
      setTableColWidths: (widths) => { slog('table-widths:set', widths); set({ tableColWidths: widths }); },
      setArchiveColWidths: (widths) => { slog('archive-widths:set', widths); set({ archiveColWidths: widths }); },
      resetManualOrder: () => {
        slog('manual-order:reset');
        set(s => ({
          taskOrder: [],
          items: s.items.map(it =>
            it.kind === 'task' && it.manuallyMoved
              ? { ...it, manuallyMoved: false, updatedAt: Date.now() }
              : it
          ),
        }));
      },

      addCommunicationField: (taskId, label) => {
        const fid = 'c' + Date.now() + Math.random().toString(36).slice(2, 5);
        slog('comm:add', { taskId, fid, label });
        set(s => ({
          items: s.items.map(it =>
            it.id === taskId && it.kind === 'task'
              ? { ...it, communications: [...(it.communications ?? []), { id: fid, label, value: '' }], updatedAt: Date.now() }
              : it
          ),
        }));
      },
      updateCommunicationField: (taskId, fieldId, patch) => {
        slog('comm:update', { taskId, fieldId, patch });
        set(s => ({
          items: s.items.map(it =>
            it.id === taskId && it.kind === 'task'
              ? { ...it, communications: (it.communications ?? []).map(c => c.id === fieldId ? { ...c, ...patch } : c), updatedAt: Date.now() }
              : it
          ),
        }));
      },
      deleteCommunicationField: (taskId, fieldId) => {
        slog('comm:delete', { taskId, fieldId });
        set(s => ({
          items: s.items.map(it =>
            it.id === taskId && it.kind === 'task'
              ? { ...it, communications: (it.communications ?? []).filter(c => c.id !== fieldId), updatedAt: Date.now() }
              : it
          ),
        }));
      },
      setFieldSize: (taskId, fieldKey, height) => {
        slog('card:resize', { taskId, fieldKey, height });
        set(s => ({
          items: s.items.map(it =>
            it.id === taskId && it.kind === 'task'
              ? { ...it, fieldSizes: { ...(it.fieldSizes ?? {}), [fieldKey]: height } }
              : it
          ),
        }));
      },

      markTaskReviewed: (id) => {
        const now = Date.now();
        slog('review:mark-task', { id, ts: now });
        // Set reviewedAt without touching updatedAt — otherwise the very act
        // of reviewing would re-flag the task instantly (updatedAt > reviewedAt).
        set(s => ({
          items: s.items.map(it =>
            it.id === id && it.kind === 'task' ? { ...it, reviewedAt: now } : it
          ),
        }));
      },

      beginReview: (taskIds, initialReviewedAt) => {
        slog('review:begin', { count: taskIds.length });
        set({
          reviewSession: { taskIds, cardIdx: 0, stepIdx: 0, initialReviewedAt, startedAt: Date.now() },
        });
      },
      // Called every time the review popup opens. If no session exists, start
      // one. If a session exists (user closed mid-review), append any newly-
      // flagged task IDs that aren't in it yet, so new work created between
      // sessions gets picked up. cardIdx/stepIdx are preserved.
      syncReviewSessionWithFlags: (flaggedIds, initialReviewedAt) => {
        set(s => {
          if (!s.reviewSession) {
            slog('review:begin', { count: flaggedIds.length });
            return {
              reviewSession: {
                taskIds: flaggedIds, cardIdx: 0, stepIdx: 0,
                initialReviewedAt, startedAt: Date.now(),
              },
            };
          }
          const existing = s.reviewSession;
          const newIds = flaggedIds.filter(id => !existing.taskIds.includes(id));
          if (newIds.length === 0) return {};
          slog('review:extend', { added: newIds.length });
          return {
            reviewSession: {
              ...existing,
              taskIds: [...existing.taskIds, ...newIds],
              initialReviewedAt: { ...existing.initialReviewedAt, ...initialReviewedAt },
            },
          };
        });
      },
      updateReviewProgress: (cardIdx, stepIdx) => {
        set(s => s.reviewSession
          ? { reviewSession: { ...s.reviewSession, cardIdx, stepIdx } }
          : {}
        );
      },
      endReview: () => {
        slog('review:end');
        set({ reviewSession: null });
      },

      addResponsibility: ({ name, description, recurrence, taskTemplate }) => {
        const now = Date.now();
        const id = 'y' + now + Math.random().toString(36).slice(2, 6);
        const resp: Responsibility = {
          id, name, description, recurrence,
          taskTemplate: { title: taskTemplate?.title ?? '', description: taskTemplate?.description ?? '' },
          nextDueAt: computeNextDueAt(recurrence, now),
          active: true,
          createdAt: now, updatedAt: now,
        };
        slog('responsibility:add', { id, name });
        set(s => ({ responsibilities: [...s.responsibilities, resp] }));
      },
      updateResponsibility: (id, patch) => {
        const existing = get().responsibilities.find(r => r.id === id);
        slog('responsibility:update', { id, name: existing?.name, keys: Object.keys(patch) });
        set(s => ({
          responsibilities: s.responsibilities.map(r => {
            if (r.id !== id) return r;
            const merged = { ...r, ...patch, updatedAt: Date.now() };
            // If the recurrence changed, recompute nextDueAt from the last
            // fire (or now if never fired) so the schedule reflects the new rule.
            if (patch.recurrence && patch.recurrence !== r.recurrence) {
              merged.nextDueAt = computeNextDueAt(patch.recurrence, merged.lastTriggeredAt ?? Date.now());
            }
            return merged;
          }),
        }));
      },
      removeResponsibility: (id) => {
        const existing = get().responsibilities.find(r => r.id === id);
        slog('responsibility:remove', { id, name: existing?.name });
        set(s => ({ responsibilities: s.responsibilities.filter(r => r.id !== id) }));
      },
      toggleResponsibilityActive: (id) => {
        const existing = get().responsibilities.find(r => r.id === id);
        slog('responsibility:toggle-active', { id, name: existing?.name, nextActive: !existing?.active });
        set(s => ({
          responsibilities: s.responsibilities.map(r =>
            r.id === id ? { ...r, active: !r.active, updatedAt: Date.now() } : r
          ),
        }));
      },
      checkResponsibilitiesDue: () => {
        const s = get();
        const now = Date.now();
        const newTasks: Item[] = [];
        const nextRespList: Responsibility[] = [];
        let anyGenerated = false;
        // Iterate over a stable snapshot; the newly-generated tasks are added
        // to `items` after the loop so `hasOpenGeneratedTask` inside triggerIfDue
        // sees a consistent view.
        const viewItems = s.items;
        for (const resp of s.responsibilities) {
          const result = triggerIfDue(resp, viewItems, now);
          nextRespList.push(result.updatedResponsibility);
          if (result.generatedTask) {
            newTasks.push(result.generatedTask);
            anyGenerated = true;
          }
        }
        if (!anyGenerated && nextRespList.every((r, i) => r === s.responsibilities[i])) return;
        if (anyGenerated) {
          slog('responsibility:generate-tasks', { count: newTasks.length });
        }
        set({
          responsibilities: nextRespList,
          items: anyGenerated ? [...s.items, ...newTasks] : s.items,
        });
      },

      checkRemindersDue: () => {
        const s = get();
        const now = Date.now();
        const currentPending = new Set(s.pendingReminderIds);
        const toQueue: string[] = [];
        for (const it of s.items) {
          if (it.kind !== 'reminder') continue;
          if (it.archived || it.status !== 'active') continue;
          if (it.nextFireAt <= now && !currentPending.has(it.id)) {
            toQueue.push(it.id);
          }
        }
        if (toQueue.length === 0) return;
        slog('reminder:queue', { count: toQueue.length });
        set(s => ({ pendingReminderIds: [...s.pendingReminderIds, ...toQueue] }));
      },
      snoozeReminderTo: (id, at) => {
        slog('reminder:snooze', { id, at });
        set(s => ({
          items: s.items.map(it =>
            it.id === id && it.kind === 'reminder'
              ? { ...it, nextFireAt: at, updatedAt: Date.now() }
              : it
          ),
          pendingReminderIds: s.pendingReminderIds.filter(x => x !== id),
        }));
      },
      completeReminderOccurrence: (id) => {
        const now = Date.now();
        slog('reminder:complete-occurrence', { id });
        set(s => ({
          items: s.items.map(it => {
            if (it.id !== id || it.kind !== 'reminder') return it;
            if (it.schedule.type === 'once') {
              return { ...it, archived: true, status: 'archived', updatedAt: now };
            }
            // Recurring: skip all missed occurrences and land on the next one
            // strictly after now, so a reminder that fired 5 times while
            // offline still only pops up once.
            return { ...it, nextFireAt: nextOccurrence(it.schedule, now), updatedAt: now };
          }),
          pendingReminderIds: s.pendingReminderIds.filter(x => x !== id),
        }));
      },

      returnFromHold: (id) => {
        slog('item:return-from-hold', { id });
        set(s => ({
          items: s.items.map(it => {
            if (it.id !== id || it.kind !== 'task') return it;
            const restoredStatus = it.preHoldStatus ?? 'backlog';
            return {
              ...it, status: restoredStatus,
              holdSchedule: undefined, preHoldStatus: undefined, toCheck: '',
              updatedAt: Date.now(),
            };
          }),
        }));
      },
      // Rule 3: any change to forToday resets an in-place hold. When turning
      // ON we force status to 'in_progress' (Today implies "I'm working on
      // this now"). When turning OFF we still un-hold, restoring the pre-hold
      // status (or 'backlog') so the task doesn't linger silently in Waiting.
      setForToday: (id, value) => {
        slog('item:set-for-today', { id, value });
        set(s => ({
          items: s.items.map(it => {
            if (it.id !== id || it.kind !== 'task') return it;
            if (it.status === 'waiting') {
              const restoredStatus = value ? 'in_progress' : (it.preHoldStatus ?? 'backlog');
              return {
                ...it, forToday: value, status: restoredStatus,
                holdSchedule: undefined, preHoldStatus: undefined, toCheck: '',
                priorityBoost: false, updatedAt: Date.now(),
              };
            }
            return { ...it, forToday: value, updatedAt: Date.now() };
          }),
        }));
      },
      checkHoldsDue: () => {
        const now = Date.now();
        const s = get();
        let anyReturned = false;
        const nextItems = s.items.map(it => {
          if (it.kind !== 'task') return it;
          if (it.status !== 'waiting' || !it.holdSchedule) return it;
          // Compute this hold's due time. For 'once' it's schedule.at; for
          // recurring the first occurrence after when the hold started
          // (approximated by updatedAt).
          const due = it.holdSchedule.type === 'once'
            ? it.holdSchedule.at
            : nextOccurrence(it.holdSchedule, it.updatedAt);
          if (due > now) return it;
          anyReturned = true;
          const restoredStatus = it.preHoldStatus ?? 'backlog';
          return {
            ...it, status: restoredStatus,
            holdSchedule: undefined, preHoldStatus: undefined, toCheck: '',
            updatedAt: now,
          };
        });
        if (!anyReturned) return;
        slog('item:auto-return-holds', { count: nextItems.filter((it, i) => it !== s.items[i]).length });
        set({ items: nextItems });
      },

      checkDailyReset: () => {
        const { dailyResetAt } = get();
        if (Date.now() >= dailyResetAt) {
          set({ promotionsToday: 0, dailyResetAt: midnight() });
        }
      },
    }),
    {
      name: 'taskflow-store',
      version: 4,
      storage: createJSONStorage(() => IS_PREVIEW_MODE ? sessionStorage : localStorage),
      skipHydration: IS_PREVIEW_MODE,
      // UI-only fields: kept in-memory per-tab, NOT persisted. Otherwise every
      // tab's navigation state would sync to every other tab (via localStorage
      // + storage event), making per-tab navigation impossible.
      // Each tab restores its own view/displayId from the URL hash on mount.
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { view, displayId, triggerTagForId, pendingReminderIds, ...rest } = state;
        return rest;
      },
      // v3: drop legacy kind='responsibility' items (replaced by the standalone
      // Responsibility store slice).
      // v4: seed Reminder.nextFireAt from schedule so the popup scheduler has
      // something to compare against.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      migrate: (persisted: any, fromVersion: number) => {
        if (!persisted) return persisted;
        if (fromVersion < 3 && Array.isArray(persisted.items)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          persisted.items = persisted.items.filter((it: any) => it && it.kind !== 'responsibility');
        }
        if (!Array.isArray(persisted.responsibilities)) persisted.responsibilities = [];
        if (fromVersion < 4 && Array.isArray(persisted.items)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          persisted.items = persisted.items.map((it: any) => {
            if (!it || it.kind !== 'reminder' || it.nextFireAt) return it;
            const seed = it.schedule?.type === 'once'
              ? it.schedule.at
              : it.schedule ? nextOccurrence(it.schedule, it.createdAt ?? Date.now()) : Date.now();
            return { ...it, nextFireAt: seed };
          });
        }
        return persisted;
      },
    }
  )
);

// ── Multi-tab sync ─────────────────────────────────────────────────
// Without this, two tabs each hold their own in-memory state. When one tab
// writes to localStorage, the other tab's next write clobbers it with stale
// data — silently destroying work. This listener rehydrates the store when
// any other tab writes, keeping all tabs in sync.
// Disabled in preview mode: preview tabs are read-only and shouldn't react to
// changes made by the main tab.
if (typeof window !== 'undefined' && !IS_PREVIEW_MODE) {
  window.addEventListener('storage', (e) => {
    if (e.key === 'taskflow-store') {
      import('./snapshots').then(m => m.log('store:rehydrate-from-other-tab'));
      useStore.persist.rehydrate();
    }
  });
}
