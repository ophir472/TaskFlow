import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Item, Task, Subtask, ChangeRecord, ScheduleSpec, CustomField, JiraConfig } from './types';
import { midnight } from './engine';

const PROMOTION_GOAL = 3;

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
  taskOrder: string[];

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
  setTaskOrder: (order: string[]) => void;
  resetManualOrder: () => void;
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
      taskOrder: [],

      setDisplayId: (id) => set({ displayId: id }),
      setTriggerTagForId: (id) => set({ triggerTagForId: id }),
      setTheme: (themeId, customAccent = null, customBg = null) => set({ themeId, customAccent, customBg }),

      updateItem: (id, patch) => set(s => ({
        items: s.items.map(it => it.id === id ? { ...it, ...patch, updatedAt: Date.now() } as Item : it),
        history: pushHistory(s.history, { ts: Date.now(), type: 'update', id, patch: patch as Partial<Item> })
      })),

      updateTask: (id, patch) => set(s => ({
        items: s.items.map(it => it.id === id && it.kind === 'task' ? { ...it, ...patch, updatedAt: Date.now() } : it),
        history: pushHistory(s.history, { ts: Date.now(), type: 'updateTask', id })
      })),

      updateSubtask: (parentId, subId, patch) => set(s => ({
        items: s.items.map(it =>
          it.id === parentId && it.kind === 'task'
            ? { ...it, subtasks: it.subtasks.map(su => su.id === subId ? { ...su, ...patch } : su), updatedAt: Date.now() }
            : it
        ),
        history: pushHistory(s.history, { ts: Date.now(), type: 'updateSubtask', id: subId })
      })),

      toggleTag: (id, key) => set(s => ({
        items: s.items.map(it => {
          if (it.id !== id || it.kind !== 'task') return it;
          if (key === 'noTag') return { ...it, noTag: !it.noTag, urgent: false, important: false, quick: false, updatedAt: Date.now() };
          return { ...it, [key]: !(it as Task)[key], noTag: false, updatedAt: Date.now() };
        }),
        history: pushHistory(s.history, { ts: Date.now(), type: 'toggleTag', id })
      })),

      toggleSubtaskDone: (parentId, subId) => set(s => {
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
      }),

      toggleSubtaskNext: (parentId, subId) => set(s => ({
        items: s.items.map(it =>
          it.id === parentId && it.kind === 'task'
            ? { ...it, subtasks: it.subtasks.map(su => ({ ...su, isNext: su.id === subId ? !su.isNext : false })) }
            : it
        )
      })),

      addSubtask: (parentId, title) => {
        const id = 's' + Date.now() + Math.random().toString(36).slice(2, 5);
        set(s => ({
          items: s.items.map(it =>
            it.id === parentId && it.kind === 'task'
              ? { ...it, subtasks: [...it.subtasks, { id, title, done: false, isNext: false, jira: '', generalLink: '', notes: '', blockers: '', createdAt: Date.now() }], updatedAt: Date.now() }
              : it
          ),
          history: pushHistory(s.history, { ts: Date.now(), type: 'addSubtask', id: parentId })
        }));
      },

      deleteSubtask: (parentId, subId) => set(s => ({
        items: s.items.map(it =>
          it.id === parentId && it.kind === 'task'
            ? { ...it, subtasks: it.subtasks.filter(su => su.id !== subId), updatedAt: Date.now() }
            : it
        ),
        history: pushHistory(s.history, { ts: Date.now(), type: 'deleteSubtask', id: subId })
      })),

      continueItem: (id) => set(s => ({
        items: s.items.map(it => it.id === id ? { ...it, bumpedAt: Date.now(), updatedAt: Date.now() } as Item : it),
        history: pushHistory(s.history, { ts: Date.now(), type: 'continue', id })
      })),

      holdItem: (id, toCheck, schedule) => set(s => ({
        items: s.items.map(it =>
          it.id === id && it.kind === 'task'
            ? { ...it, status: 'waiting', priorityBoost: false, toCheck, holdSchedule: schedule, updatedAt: Date.now() }
            : it
        ),
        history: pushHistory(s.history, { ts: Date.now(), type: 'hold', id })
      })),

      rescheduleReminder: (id, schedule) => set(s => ({
        items: s.items.map(it =>
          it.id === id && it.kind === 'reminder'
            ? { ...it, schedule, bumpedAt: Date.now(), updatedAt: Date.now() }
            : it
        ),
        history: pushHistory(s.history, { ts: Date.now(), type: 'reschedule', id })
      })),

      completeItem: (id) => {
        const item = get().items.find(it => it.id === id);
        if (!item) return null;
        if (item.kind === 'responsibility') {
          set(s => ({
            items: s.items.map(it => it.id === id ? { ...it, bumpedAt: Date.now(), updatedAt: Date.now() } as Item : it),
            history: pushHistory(s.history, { ts: Date.now(), type: 'complete', id })
          }));
          return 'rescheduled';
        }
        set(s => ({
          items: s.items.map(it => it.id === id ? { ...it, status: 'archived', archived: true, updatedAt: Date.now() } as Item : it),
          promotionsToday: item.kind === 'task' ? s.promotionsToday + 1 : s.promotionsToday,
          history: pushHistory(s.history, { ts: Date.now(), type: 'complete', id })
        }));
        return 'archived';
      },

      createItem: (item) => set(s => ({
        items: [...s.items, item],
        history: pushHistory(s.history, { ts: Date.now(), type: 'create', id: item.id })
      })),

      archiveItem: (id) => set(s => ({
        items: s.items.map(it => it.id === id ? { ...it, archived: true, updatedAt: Date.now() } as Item : it),
        history: pushHistory(s.history, { ts: Date.now(), type: 'archive', id })
      })),

      deleteItem: (id) => set(s => ({
        items: s.items.filter(it => it.id !== id),
        history: pushHistory(s.history, { ts: Date.now(), type: 'delete', id })
      })),

      unarchiveItem: (id) => set(s => ({
        items: s.items.map(it => it.id === id
          ? { ...it, archived: false, status: it.kind === 'task' ? 'backlog' : 'active', updatedAt: Date.now() } as Item
          : it
        ),
        history: pushHistory(s.history, { ts: Date.now(), type: 'unarchive', id })
      })),

      addRequester: (name) => set(s => ({ requesters: [...s.requesters, name] })),
      removeRequester: (name) => set(s => ({ requesters: s.requesters.filter(r => r !== name) })),
      addProject: (name) => set(s => ({ projects: [...s.projects, name] })),
      removeProject: (name) => set(s => ({ projects: s.projects.filter(p => p !== name) })),

      addCustomField: (field) => set(s => ({ customFields: [...s.customFields, field] })),
      removeCustomField: (id) => set(s => ({ customFields: s.customFields.filter(f => f.id !== id) })),
      updateCustomField: (id, patch) => set(s => ({
        customFields: s.customFields.map(f => f.id === id ? { ...f, ...patch } : f)
      })),
      updateItemCustomValue: (itemId, fieldId, value) => set(s => ({
        items: s.items.map(it =>
          it.id === itemId && it.kind === 'task'
            ? { ...it, customValues: { ...(it.customValues ?? {}), [fieldId]: value }, updatedAt: Date.now() }
            : it
        )
      })),

      setView: (v) => set({ view: v }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setJiraConfig: (config) => set({ jiraConfig: config }),
      setTaskOrder: (order) => set({ taskOrder: order }),
      resetManualOrder: () => set(s => ({
        taskOrder: [],
        items: s.items.map(it =>
          it.kind === 'task' && it.manuallyMoved
            ? { ...it, manuallyMoved: false, updatedAt: Date.now() }
            : it
        ),
      })),

      checkDailyReset: () => {
        const { dailyResetAt } = get();
        if (Date.now() >= dailyResetAt) {
          set({ promotionsToday: 0, dailyResetAt: midnight() });
        }
      },
    }),
    { name: 'taskflow-store', version: 2 }
  )
);
