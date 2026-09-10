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

**`localApiProxy.ts`** (repo root, server-side only) — Vite plugin serving `/api-proxy/<scheme>/<host>/<path>`: forwards Jira/ServiceNow/AI REST calls from Node so browser CORS never applies (self-signed corporate certs accepted). Client side is `proxiedFetch` in `src/apiLog.ts` — proxy first, direct fetch fallback (marker header `x-taskflow-proxy` tells them apart), `ApiUnreachableError` only when both fail. Jira create is REST-first; the host's pre-filled create-URL opens only as unreachable-fallback. Jira targets DATA CENTER: PAT Bearer auth (per-host `authMode: 'basic'` switches to username:password Basic for instances that reject PATs), `/rest/api/2`, plain-text description/comment bodies, name-based reporter/assignee (the Cloud scheme — Basic email:token, api/3, ADF — was dropped by decision 2026-08-18; JiraConfig.username persists but is unused).

**`src/types.ts`** — all data types: `Task` (incl. `followups: Followup[]`), `Reminder`, `Responsibility`, `Subtask`, `Item` (union), `ChangeRecord`. `GetBackTo` (standalone people-bound note — see rules). Every item kind except `GetBackTo` has `priorityBoost: boolean` for the +100 Hold-return boost.

**`src/agenda.ts`** — shared Dashboard selectors: `dashCounts` (tile numbers, today-planning state), `TILE_DEFS` registry, `BUILTIN_STEPS` + `stepDone` (agenda pipeline + Walkthrough done-detection). Pure store data, logs never consulted.

**`src/engine.ts`** — pure functions: `scoreItem(item)`, `buildQueue(items)` (for-today override → needsTag tier → scored pool; needs-Jira tier retired), `nextId(prefix)`, `midnight()` (returns the UPCOMING midnight — the daily-reset deadline, NOT start-of-today).

**`src/store.ts`** — single Zustand store, persisted to `taskflow-store` in localStorage. Keeps `history: ChangeRecord[]` capped at 100 entries (PRD §11 snapshot+history backup). Exposes all mutation actions (updateItem, toggleTag, holdItem, snoozeItem, completeItem, etc.). `checkDailyReset()` compares against `dailyResetAt` and resets `snoozesToday`/`promotionsToday` at midnight.

**Components (highlights):**
- `Home` — dashboard landing view (version registry, stat tiles, agenda pipeline, walkthrough start); `WalkthroughBar` — floating store-driven guide (`walkthrough` quiet state); `QuickHelp` — walker over type-'quick' tasks; `Hub` — (layout 2026-09-10) row 1 full-width Get back to; TODAY section (cards marked Today) with five parts ITSM · custom systems · waiting for · communication · followups (manual rows only — ticket rows are the ITSM/custom parts; the card's followup table is unchanged); ALL section beneath, same five parts across every active card (collapsible). Every row has the blue followed-up-today ✓ (`progressedToday`/`waitKey`/`commKey`); the Home tile 'To follow up' = `hubOpenCount` = the Today section minus done/followed-up; `GetBackToModal` — the one Who/Notes edit surface (✓ top-right completes, Done closes), opened from Explore/Spotlight results and Hub rows
- `BookmarksDrawer` (+ `BookmarkEditor`, `src/bookmarks.ts`) — the line-with-a-bump along the bottom of every screen; click / `b` slides a drawer to 92vh over the current view (`#bookmarks[/<folderId|fav|unsorted|task>][?q=…]`, overlay route in App's guard list). Chrome's model (nested `bookmarkFolders`, drag bookmarks onto folders, folder onto folder to nest) + Raindrop's tags, notes, ★ favorites, Unsorted inbox (folderId null), `is:dup` duplicate check (normalized URL), list/grid/cards, Chrome-HTML import/export, keyboard (/, ↑↓, ↵, e, f, n, space, ⌫ with Undo banner). Search: free text · `tag:` · `folder:` · `is:`. Favicon URL template lives in Settings → General (`bookmarkConfig.faviconTemplate`, empty = letter tiles). **Task links are mirrored** (`store.mirrorTaskLinks` after updateItem/updateTask/updateSubtask → `bookmarks.upsertTaskLinks`): one bookmark per card link field (`source: {taskId, field}`), tagged `task` + keywords from the card title/label/project/requester; QUIET event `bookmark:auto`; a hand edit of title/tags/notes sets `auto:false` and only the URL keeps following the card. Links-board Docs pages were retired 2026-09-10 — migration v12 turns each into a bookmark folder.
- `Sidebar` — nav (9 views: Home, Feed…Quick Help…Settings, keys 1–9), overlay buttons (✉ Mail w/ badge, ▶ Sprint, Review, ◷ Plan w/ unplanned-today badge), promotions pie, "+ New item"
- `TypePicker` (Common) — Kind on existing tasks is likewise a dropdown (collapsed = the chosen kind, amber "Set kind" when untyped; open = the three chips; ↑↓/Enter/Esc) — card, popup, Quick Help, Table column.
- `TagDropdown` (Common) — priority tags on EXISTING tasks: collapsed button showing the chosen tags, opens the four chips (↑↓/Enter/Esc); the card feed ties its open state to tag-edit mode (card pinned). The create form keeps plain chips.
- `CardFeed` — primary screen; frosted transport bar (back/hold/play/complete/continue); hold panel; subtask rows (checkbox, ★ next, ◷ quick, click-to-slide-over)
- Overlays (all hash-routed): `GreenPlay` review, `SprintMode`, `PlanPopup`, `Play` (dark focus mode), `MailAssistant` (+ shared `MailEntryFields`), `SnCreateMenu`, `DailyPlay` (Table-local), `ShortcutsHelp` (?), `Tour` (guided onboarding on self-cleaning `[Tour] ` sample data; pauses app shortcuts while active)
- Shared card sections (parity!): `RequesterSelect` (+ new-requester popup), `TypePicker`, `FollowupSection` (+ `FollowupMarks` reused by the Hub), custom-system rows in TicketSections, `MailEntryPopup` (Table + Settings queues), `TicketSections`, `WaitingForSection`, `CommunicationSection` + `LinkedCommTable`, `QuickToActSection`, `SubtaskChecklist`, `EstimatesSection`, `ParentContextCard`
- `Table` — inline edit, Kibana-style search/query language (`src/tableQuery.ts`, the string IS the filter state, mirrored to `#table?q=…&group=…&view=…&size=…`), grouping, bulk actions, AI assign, cards/pipeline/gantt views. The Archive view was DECOMMISSIONED 2026-09-10: archived rows are the `is:archived` / `is:closed` (archived today) / `status:done` filter on the same table (🗑 segment in the header; bulk action flips to ↩ Restore); legacy `#archive` / `#archive/task/<id>` links redirect in App; `Docs` — notebooks/categories/pages. Pages are plain text with Notion-style blocks (`src/docBlocks.ts` parses: headings fold, nested to-dos (parent done when children are), `▸` toggles, `!!` callouts, quotes, dividers, ``` code, `|` tables; inline **b** *i* ~~s~~ `c` links and `[[Page]]` / `[[JIRA-1]]` / `[[t…]]` refs that open the page/task). `DocView` renders, `DocEditor` is the textarea with `/` block menu, `[[` link picker, Enter/Tab list handling, ⌘B/I/E. **Checklist agenda steps:** `AgendaStep.docPageId` — the page is a template; today's ticks are `agendaChecks` ids `doc:<pageId>:<leafKey>` (reset at midnight; `store.setAgendaChecks` batches, quiet like `agenda:check`); `stepDone(step, counts, todayChecks, pageContent)` = every leaf to-do ticked today. The page shows a ☑ Daily badge and ticks the same state; Home/walkthrough open `#checklist/<pageId>` (`ChecklistPopup`, global overlay in App); ⧉ on the page copies `#docs/<id>`, ☑ Add to daily agenda toggles the step; Settings → Dashboard adds one from a page picker or a pasted link; `Settings` — five URL-driven tabs; queue sections there: sprint (type toggles + drag order within mail/tasks sections + click-through) and review (drag order honored by the walkthrough, × = quiet dismiss)

## Key business rules (PRD source of truth)

- **Card communication threads (2026-09-10):** `CommunicationField.channel` ('outlook' | 'teams'; missing = teams for the seeded 'Teams' field, else outlook — `commChannel()`), `focus` (shown on the ▣ Hub), `touchedAt` (stamped on value edits). Brand marks = inline SVG `OutlookIcon`/`TeamsIcon` (`Mail/ChannelToggle.tsx`), used by the mail-entry channel toggle too. Hub → Communications lists threads from every active card narrowed by `hubConfig` (Settings → General → Hub): `commTodayOnly` (touchedAt today; unstamped → card marked Today) and `commFocusOnly`, both default on; the Hub row's ◉ toggles focus (same entity).
- **Sweep (2026-09-10):** daily-agenda builtin `sweep` (BUILTIN_STEPS, default order review → sweep → plan → mail → sprint → today; migration v13 inserts it before Communication in saved configs). Lives in the communication assistant at `#mail/sweep`: two boxes — Subject / Teams chat + optional Key point (`Task.keyPoint`, shown on the entry form, list rows, Sprint) — **Next** (Enter) files a mail entry via `buildMailEntry(title, linked?, channel, keyPoint)` and clears; **Done** = `setAgendaChecks(['sweep'], true)` (per-day, quiet) and back to `#mail`. Replying stays in the preview walk. Mail entries carry `channel` ('outlook' | 'teams', missing = outlook) — `ChannelToggle`/`ChannelIcon` everywhere an entry shows.
- **Followups (2026-08-27, replaces v1.2.0's standalone "get back to"):** per-card table `Task.followups` (`src/followups.ts` derives the rows). Manual rows = title + notes. Ticket rows (ITSM primary/extras, custom systems) are DERIVED at render, in card order; they get a shadow record (`ticketKey`) only once progressed/annotated/done. Two marks: `progressedAt` = today-only (strikethrough while the stamp is from today — resets at 00:00 by comparison, no job); `done` hides the row. A ticket row's done IS `irrelevantTickets` — `store.setFollowupDone` keeps both in lockstep, and `RelevanceToggle` (the ticket ✓) calls it. Actions: `addFollowup`/`updateFollowup`/`removeFollowup`/`toggleFollowupProgressed`/`setFollowupDone` (refs are `{id}` or `{ticketKey,title}`); events `followup:*` are versioned; title/notes inputs are blur-commit. Hub shows today's cards' rows (progressed/done hidden behind "Show done") and all rows collapsed; Σ summary lists completed/progressed rows. (Schema 10 briefly converted getback items into cards; that was reverted — migration v11 turns those `tg…` cards back into getback items. Both features coexist.)
- **Get back to `<who>`:** `Item` kind `'getback'` — fields `who` + `notes`; `title` derived (`Get back to ${who}`, re-derived by `store.updateItem` on `who` edits). No schedule/scoring/ticket link — `buildQueue`/Table/Kanban/Archive exclude it; lives in Explore/Spotlight search and the Hub. Constructor `buildGetBackTo(who, notes?)` (`src/getBackTo.ts`); generic `createItem`/`updateItem`/`deleteItem` → logged/versioned like any edit; `doneAt` feeds the Σ summary.
- **In scope (2026-08-27):** `Subtask.inScope?` ONLY (tasks have no scope flag — decided 2026-08-27) — `false` opts a step out, missing = in (no migration). Only ▶ Play honors it: `starred`/next-step/`skipNext`/`noSteps`/`allDone` consider in-scope steps; Play's next-task queue skips tasks with no open in-scope step. `SubScopeToggle` (row ◎) in `Common/ScopeToggle.tsx`; edits go through `updateSubtask` (versioned).
- **Task types (2026-08-27):** `Task.type` = `'mail' | 'quick' | 'planned' | 'urgent'` (undefined = legacy, highlighted until set; `createItem` defaults new tasks to `'planned'`). `'quick'` (Quick help) and `'mail'` never enter the scored feed; `'quick'` joins the Sprint task section and the ⚡ Quick Help view. `'urgent'` = unplanned same-day; REST Jira create adds the host's `urgentLabel`.

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
4. **Version bump** — every push: bump `APP_VERSION` in `src/releaseNotes.ts` and PREPEND a release entry (version, date, user-facing notes). The version shows at the bottom of Settings; clicking it opens the history.
5. **Summarize and push** — session summary (features, fixes, action items for the work computer), then commit + push with the Co-Authored-By trailer.

## Known drift / gotchas

- A "bug report" matching pre-fix behavior is often a stale browser bundle — suggest a hard reload (Cmd+Shift+R) before debugging.
