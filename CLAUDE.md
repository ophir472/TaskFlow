# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
./start.sh         # one-shot startup: installs deps if needed, starts dev server, opens browser
./start.sh --build # production build + preview server
npm start          # dev server + open browser (deps must already be installed)
npm run dev        # start dev server at http://localhost:5173
npm run build      # TypeScript check + Vite production build
npm run preview    # preview the production build
```

## Architecture

**Stack:** Vite + React 19 + TypeScript, Zustand (with `persist` to localStorage), no CSS framework — layout uses inline styles matching the design tokens exactly.

**`localApiProxy.ts`** (repo root, server-side only) — Vite plugin serving `/api-proxy/<scheme>/<host>/<path>`: forwards Jira/ServiceNow/AI REST calls from Node so browser CORS never applies (self-signed corporate certs accepted). Client side is `proxiedFetch` in `src/apiLog.ts` — proxy first, direct fetch fallback (marker header `x-taskflow-proxy` tells them apart), `ApiUnreachableError` only when both fail. Jira create is REST-first; the host's pre-filled create-URL opens only as unreachable-fallback.

**`src/types.ts`** — all data types: `Task`, `Reminder`, `Responsibility`, `Subtask`, `Item` (union), `ChangeRecord`. Every item kind now has `priorityBoost: boolean` to allow the +100 Hold-return boost on all three kinds.

**`src/engine.ts`** — pure functions: `scoreItem(item)`, `buildQueue(items)` (for-today override → needsTag tier → scored pool; needs-Jira tier retired), `nextId(prefix)`, `midnight()` (returns the UPCOMING midnight — the daily-reset deadline, NOT start-of-today).

**`src/store.ts`** — single Zustand store, persisted to `taskflow-store` in localStorage. Keeps `history: ChangeRecord[]` capped at 100 entries (PRD §11 snapshot+history backup). Exposes all mutation actions (updateItem, toggleTag, holdItem, snoozeItem, completeItem, etc.). `checkDailyReset()` compares against `dailyResetAt` and resets `snoozesToday`/`promotionsToday` at midnight.

**Components (highlights):**
- `Sidebar` — nav (7 views incl. Docs), overlay buttons (✉ Mail w/ badge, ▶ Sprint, Review, ◷ Plan w/ unplanned-today badge), promotions pie, "+ New item"
- `CardFeed` — primary screen; frosted transport bar (back/hold/play/complete/continue); hold panel; subtask rows (checkbox, ★ next, ◷ quick, click-to-slide-over)
- Overlays (all hash-routed): `GreenPlay` review, `SprintMode`, `PlanPopup`, `Play` (dark focus mode), `MailAssistant` (+ shared `MailEntryFields`), `SnCreateMenu`, `DailyPlay` (Table-local), `ShortcutsHelp` (?), `Tour` (guided onboarding on self-cleaning `[Tour] ` sample data; pauses app shortcuts while active)
- Shared card sections (parity!): `TicketSections`, `WaitingForSection`, `CommunicationSection` + `LinkedCommTable`, `QuickToActSection`, `SubtaskChecklist`, `EstimatesSection`, `ParentContextCard`
- `Table`/`Archive` — inline edit, filters, bulk actions, AI assign; `Docs` — notebooks/categories/pages; `Settings` — five URL-driven tabs

## Key business rules (PRD source of truth)

- **Queue tiers (§5.1, amended):** for-today override (any today-marked task → only those) → tasks missing all tags (and not marked noTag) → scored pool including reminders. The PRD's needs-Jira tier is retired by decision (2026-08-18); `noJira` only gates the review's Jira steps.
- **Scoring (§5.2):** urgent=6, important=3, quick=1, staleness bonus=staleness field (0–1), hold-return boost=+100 temporary.
- **Hold boost reset:** `priorityBoost` clears when the user genuinely acts on the card — currently on `continueItem`, `snoozeItem`, `completeItem`. The PRD says it should clear on first interaction (not just viewing), so the boost flag is passed to `updateItem` as `priorityBoost: false` inside those actions.
- **Snooze (§8):** global daily limit (default 2), Reminders exempt (they use "Remind me again" which calls `rescheduleReminder`, not `snoozeItem`).
- **Complete (§4.1):** Task/Reminder → archived; Responsibility → rescheduled (bumpedAt update, stays active).
- **Subtasks (§6):** one level deep; no own scoring; no Hold/Continue/Complete; "next up" star is visual only.
- **Promotions pie (§5.3):** increments on task completion or subtask done-toggle; resets at midnight; turns green at goal.

## Design tokens

Background `#f6f5f2`, cards/sidebar `#ffffff`, borders `#e9e6de`/`#e6e3dc`, text primary `#211f1c`, secondary `#48453e`, muted `#8b877e`. Accent (CTA, active nav): `oklch(0.5 0.15 264)`. Success (Complete, pie goal): `oklch(0.5 0.14 150)`. Amber (Hold resume, to-check): `oklch(0.93 0.05 85)` bg / `oklch(0.45 0.13 85)` text. Radii: 16px cards, 10–12px panels, 9px buttons, 999px chips.

## Working agreements (how Ophir works — follow these without being asked)

- **Ask first on big features.** 2–4 sharp clarifying questions before building; answers come fast and behavior is iterated until exact. Field lists Ophir gives are exhaustive and literal — don't add or keep extras.
- **Never forget keyboard navigation.** Every new list, popup, stepper, or picker ships WITH keyboard support (↑↓ to navigate, Enter to act, Esc to close, ←→ to step) and is registered in `ShortcutsHelp` GROUPS. Historically the most-repeated omission — check it before calling a feature done.
- **Same card everywhere.** Showing a task/entity in another place means the SAME entity with ALL its fields — render the shared section components (TicketSections, WaitingForSection, CommunicationSection, QuickToActSection, SubtaskChecklist, SnTemplateForm…), never a hand-picked subset. A field missing on one surface is a bug, not a styling choice.
- **Customization over hardcoding.** Anything org- or workflow-specific (URLs, URIs, field names, templates, prompts, credentials) is data, editable from Settings. The app runs on two computers (home dev / work); only data travels between them.
- **URL-driven everything.** Every view, tab, page, and overlay has a hash route (`#settings/<tab>`, `#docs/<page>`, `#mail/preview/<id>`, `#sprint`, …) — it makes navigation easier: back/Esc close overlays, refresh keeps the exact spot, anything is deep-linkable. New overlays must extend the view→URL guard list in App.
- **Zero data loss (7-day guarantee).** Every change flows localStorage → `current.json` live mirror → versioned snapshots. Background syncs use quiet store updates (no `updatedAt` bump, no review flags, no snapshot pressure).
- **Logs matter — but are forensic only.** Every mutation logs a structured event; Jira/SN API traffic logs full request+response via `loggedFetch` (credentials redacted). App features NEVER read logs as data — functional state lives in the store.
- **One entity, two views.** When the same information shows in two places, back both with one underlying object + a flag/filter (isQuick subtasks ↔ Quick to Act table; mail entries ↔ card "To send" table). Never two lists with sync code.
- **External links open new tabs** (`window.open(url, '_blank')`) — corporate hosts refuse iframes.
- **Animations only on real state changes**, never on mount/refresh.

## Feature checklist (walk it for every store-touching change)

1. New mutation → `slog` event + register in snapshots' THREE sets (`COALESCE_DATA_EVENTS`, `CATEGORIZED`, `DATA_EVENTS`) + a `summarizePrepared` switch case.
2. Per-keystroke edits → coalescing rule (same-target merge); Settings inputs → blur-commit drafts.
3. Settings-scope store field → App's `settingsChanged` watcher.
4. New persisted top-level key → backup `STATE_DEFAULTS`.
5. Persisted schema change → bump persist version + migrate (old stores AND old snapshots must load — restore re-runs migrations).
6. Per-tab UI state → `partialize` exclusion.
7. Keyboard support + `ShortcutsHelp` entry.
8. Popups: `backdropCloseProps` (mousedown-origin close) + 4px backdrop blur + Esc; shortcuts match `e.code` (Hebrew layout) and skip form controls.
9. `npx tsc --noEmit -p tsconfig.app.json` + `npm run build` must pass.

## Quiet vs versioned events

User-authored changes register in all THREE snapshot sets (they trigger version history). Background/meta markers are QUIET — registered in `CATEGORIZED` only, set without bumping `updatedAt`, so they create no snapshot pressure and never re-flag review: `itsm:sync`, `itsm:viewed`, `task:planned`, `ai:request/response/error`, and the table/archive column prefs (`table-cols/widths`, `archive-cols/widths`). The live `current.json` mirror still captures them (zero data loss holds). Choose quiet ONLY for machine-written or workflow-meta state; anything the user typed is versioned.

## Session finish routine ("as always")

Before pushing, verify and report:
1. **0 lost data** — everything added triggers the sync and reaches backup (events registered; live file covers the rest).
2. **Backward compatibility** — old persisted stores and old snapshots still load (optional fields or migrations).
3. **Questions?** — surface anything ambiguous instead of guessing; Ophir wants the questions.
4. **Summarize and push** — session summary (features, fixes, action items for the work computer), then commit + push with the Co-Authored-By trailer.

## Known drift / gotchas

- A "bug report" matching pre-fix behavior is often a stale browser bundle — suggest a hard reload (Cmd+Shift+R) before debugging.
