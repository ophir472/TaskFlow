# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server at http://localhost:5173
npm run build      # TypeScript check + Vite production build
npm run preview    # preview the production build
```

## Architecture

**Stack:** Vite + React 19 + TypeScript, Zustand (with `persist` to localStorage), no CSS framework — layout uses inline styles matching the design tokens exactly.

**`src/types.ts`** — all data types: `Task`, `Reminder`, `Responsibility`, `Subtask`, `Item` (union), `ChangeRecord`. Every item kind now has `priorityBoost: boolean` to allow the +100 Hold-return boost on all three kinds.

**`src/engine.ts`** — pure functions: `scoreItem(item)`, `buildQueue(items)` (implements the 3-tier PRD §5.1 algorithm: needsTag → needsJira → scored pool), `nextId(prefix)`, `midnight()`.

**`src/store.ts`** — single Zustand store, persisted to `taskflow-store` in localStorage. Keeps `history: ChangeRecord[]` capped at 100 entries (PRD §11 snapshot+history backup). Exposes all mutation actions (updateItem, toggleTag, holdItem, snoozeItem, completeItem, etc.). `checkDailyReset()` compares against `dailyResetAt` and resets `snoozesToday`/`promotionsToday` at midnight.

**Components:**
- `Sidebar` — nav, promotions pie ring (CSS `conic-gradient`), snooze counter, "+ New item" button, collapse toggle
- `CardFeed` — the primary screen; calls `buildQueue` to get the top item; handles all card actions (Continue/Hold/Snooze/Complete); inline Hold panel; subtask rows with checkbox + star + click-to-slide-over
- `SubtaskPanel` — 400px right slide-over for subtask editing; no action buttons per PRD §6
- `CreateModal` — Task/Reminder/Responsibility tabs; Create disabled until title + Jira present for tasks
- `Kanban` — skeleton, 4 columns (in_progress/backlog/waiting/done)
- `Table` — filterable by requester/project; all non-archived items
- `Settings` — Requesters and Projects managed lists; Custom fields placeholder
- `Toast` — fixed bottom-center pill, auto-dismiss

## Key business rules (PRD source of truth)

- **Queue tiers (§5.1):** tasks missing all tags (and not marked noTag) surface first; then tasks missing Jira; then scored pool including reminders.
- **Scoring (§5.2):** urgent=6, important=3, quick=1, staleness bonus=staleness field (0–1), hold-return boost=+100 temporary.
- **Hold boost reset:** `priorityBoost` clears when the user genuinely acts on the card — currently on `continueItem`, `snoozeItem`, `completeItem`. The PRD says it should clear on first interaction (not just viewing), so the boost flag is passed to `updateItem` as `priorityBoost: false` inside those actions.
- **Snooze (§8):** global daily limit (default 2), Reminders exempt (they use "Remind me again" which calls `rescheduleReminder`, not `snoozeItem`).
- **Complete (§4.1):** Task/Reminder → archived; Responsibility → rescheduled (bumpedAt update, stays active).
- **Subtasks (§6):** one level deep; no own scoring; no Hold/Continue/Complete; "next up" star is visual only.
- **Promotions pie (§5.3):** increments on task completion or subtask done-toggle; resets at midnight; turns green at goal.

## Design tokens

Background `#f6f5f2`, cards/sidebar `#ffffff`, borders `#e9e6de`/`#e6e3dc`, text primary `#211f1c`, secondary `#48453e`, muted `#8b877e`. Accent (CTA, active nav): `oklch(0.5 0.15 264)`. Success (Complete, pie goal): `oklch(0.5 0.14 150)`. Amber (Hold resume, to-check): `oklch(0.93 0.05 85)` bg / `oklch(0.45 0.13 85)` text. Radii: 16px cards, 10–12px panels, 9px buttons, 999px chips.
