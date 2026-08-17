# TaskFlow

A personal task-management app built with React, TypeScript, and Vite. All data lives locally in your browser (no account or server) with versioned backups to a folder you choose.

## Key features

**Working the queue**
- **Card feed** — one card at a time from a scored queue (urgent / important / quick tags, staleness, hold-return boost); Continue / Hold / Snooze / Complete; "for today" focus mode
- **Green Play review** (`r`) — guided walkthrough per task: create/update/close Jira, break into subtasks, estimate, log comms; resumable sessions with a queue preview in Settings
- **Sprint war mode** (`s`) — blacked-out one-item-at-a-time blitz through everything quick: quick subtasks, Q-tagged tasks, pending mail; timer, arrow navigation, expandable context
- **Communication assistant** (`m`) — fast capture of mails/Teams chats to answer, preview stepper (subject / what I want to say / mail to send), entries linkable to tasks and mirrored on the card's "To send" table

**Tasks**
- Subtasks with next-up ★, quick-to-act ◷ (shared with the Quick to Act table), per-subtask checklists, estimates, and a floating parent-context card when a subtask is open
- "Waiting for" tables, communication fields, custom fields, reminders (with popup scheduling) and recurring **responsibilities** that auto-generate tasks

**Views** — Explore search + spotlight (`⌘F`), Kanban (with one-click Jira board buttons), an inline-editable Table (filters, bulk actions, AI assign), Archive, and a **Docs** tab (notebook → category → page, markdown-lite with folding headings and checkboxes, "links board" pages).

**Integrations** (all configured from Settings — URLs, fields, and templates are data, so it adapts to any organization)
- **Jira**: multiple hosts, create via REST or a pre-filled create-URL, summary templates, comments, close transitions
- **ServiceNow**: INC/CHG creation from reusable templates (`#sncreate`) with FILL prompts, plus live ticket-status sync on cards
- **AI assignment**: send a task to any OpenAI/Anthropic-style endpoint from the table; reply goes to the logs

**Data safety** — every change hits localStorage instantly, a live mirror file within ~0.5s, and versioned snapshots with 7-day retention; automatic restore prompt, version history with change summaries, JSON/Excel export-import. A banner warns until a backup folder is selected.

Everything is URL-driven (`#settings/backup`, `#docs/<page>`, `#mail`, `#sprint`, …) — refresh keeps your place, back closes overlays. Press **?** in Settings for the full keyboard-shortcut reference.

## How it decides what's next (core logic)

- **Queue eligibility** — the card feed considers non-archived items: tasks that aren't done/archived (tasks on *waiting* stay hidden until boosted back), active reminders, and never mail entries.
- **"For today" override** — if any task is marked for today, the feed shows *only* those until they're done or unmarked.
- **Untagged first** — tasks with no priority tag (and not marked "no tag") surface before everything else, so nothing enters the pool unclassified.
- **Scoring** — urgent **6** + important **3** + quick **1** + staleness (0–1). Returning from hold adds a temporary **+100** that clears the moment you act on the card. Reminders score 0 (100 when boosted). Ties go to the least-recently-bumped.
- **Hold / snooze** — Hold parks a task with a "to check" note and a schedule, remembers its pre-hold status, and auto-returns it (with the +100 boost) when due. Snooze has a global daily limit; reminders instead reschedule, which also moves their next-fire time.
- **Done ⇄ archive** — marking done archives automatically; giving an archived task an active status un-archives it (Kanban's Done column includes archived-done cards for this reason).
- **Review flagging** — a task is queued for review when it was created or edited after its personal `reviewedAt`. Finishing a card's walkthrough stamps it (without counting as an edit); any later change re-flags it. Sessions persist, resume mid-step, and compact walked cards on reopen.
- **Sprint pool** — quick subtasks → Q-tagged tasks → pending mail entries, frozen at start; items completed elsewhere are skipped automatically.
- **Reminders** — a precise timer fires the popup at `nextFireAt`; snoozing or completing an occurrence advances it (recurring rules are drift-free, day-31 clamped).
- **Responsibilities** — a recurring rule generates its task when due, but never while a previously generated task is still open.
- **Promotions pie** — task completions and subtask ticks fill the daily ring; it resets at midnight along with snooze counts.

## Setup on a new computer

**Prerequisites:** [Node.js](https://nodejs.org/) (v18 or later) and [Git](https://git-scm.com/)

```bash
# 1. Clone the repo
git clone https://github.com/ophir472/TaskFlow.git
cd TaskFlow/app

# 2. One-shot start — installs dependencies if needed, starts the dev
#    server, and opens the browser:
./start.sh
```

Or manually:

```bash
npm install      # install dependencies (first time only)
npm run dev      # start the dev server
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

`./start.sh --build` serves the production build instead (build + preview).

## Other commands

```bash
npm run build    # production build
npm run preview  # preview the production build locally
```

## First run

1. Pick a **backup folder** when the orange banner asks (ideally inside OneDrive/Dropbox for an offsite copy).
2. **Settings → Integrations**: add Jira host(s) + token, ITSM host/credentials for status sync, ServiceNow create-URLs + fields + templates, AI endpoint if used.
3. **Settings → General**: requesters, projects, custom fields, theme.
4. Press **?** in Settings once — the shortcuts pay for themselves.

## Troubleshooting

- **A "fixed" bug still happens** → the browser is running an old bundle; hard-reload (Cmd+Shift+R) before debugging.
- **Jira / ServiceNow / AI calls fail at work** → open DevTools Console: every request+response is logged in a collapsed `[jira:*]` / `[itsm:*]` group (credentials redacted). Network errors usually mean the host doesn't allow browser CORS from this origin.
- **Backups stopped writing** → the folder permission was revoked (browser restart does this); a banner offers to re-grant. Version history lives in Settings → Backup.
- **Something looks lost** → Settings → Backup → version history lets you preview any snapshot from the last 7 days in a read-only tab and restore it; the `current.json` live mirror in the backup folder is at most ~1s behind.

## Notes

- Data is per-browser. To move machines: Settings → Backup → **Export JSON** on the old machine, **Import JSON** on the new one (settings and integrations travel too, so configure once).
- Pick a backup folder when prompted (Chrome/Edge) — ideally inside a synced directory (OneDrive/Dropbox) for an offsite copy.
