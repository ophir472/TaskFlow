import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Item, Task, Subtask, ChangeRecord, ScheduleSpec, CustomField, JiraConfig, ItsmConfig } from './types';
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
        set(s => ({
          items: s.items.map(it => it.id === id ? { ...it, bumpedAt: Date.now(), updatedAt: Date.now() } as Item : it),
          history: pushHistory(s.history, { ts: Date.now(), type: 'continue', id })
        }));
      },

      holdItem: (id, toCheck, schedule) => {
        slog('item:hold', { id, toCheck, schedule });
        set(s => ({
          items: s.items.map(it =>
            it.id === id && it.kind === 'task'
              ? { ...it, status: 'waiting', priorityBoost: false, toCheck, holdSchedule: schedule, updatedAt: Date.now() }
              : it
          ),
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

      createItem: (item) => {
        import('./snapshots').then(m => m.log('item:create', { id: item.id, kind: item.kind, title: item.title }));
        set(s => ({
          items: [...s.items, item],
          history: pushHistory(s.history, { ts: Date.now(), type: 'create', id: item.id })
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

      checkDailyReset: () => {
        const { dailyResetAt } = get();
        if (Date.now() >= dailyResetAt) {
          set({ promotionsToday: 0, dailyResetAt: midnight() });
        }
      },
    }),
    {
      name: 'taskflow-store',
      version: 2,
      // In preview mode: persist to sessionStorage (per-tab, discarded on close)
      // so the preview can't affect the real localStorage or other tabs.
      // Use the CACHED preview flag — never re-check URL, because browsing
      // inside the preview changes the URL and would flip storage to localStorage.
      storage: createJSONStorage(() => IS_PREVIEW_MODE ? sessionStorage : localStorage),
      // In preview mode, skip auto-hydration. main.tsx seeds sessionStorage
      // asynchronously (needs to read from disk), then manually rehydrates.
      skipHydration: IS_PREVIEW_MODE,
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
