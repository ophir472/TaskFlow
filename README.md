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

## Setup on a new computer

**Prerequisites:** [Node.js](https://nodejs.org/) (v18 or later) and [Git](https://git-scm.com/)

```bash
# 1. Clone the repo
git clone https://github.com/ophir472/TaskFlow.git
cd TaskFlow/app

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Other commands

```bash
npm run build    # production build
npm run preview  # preview the production build locally
```

## Notes

- Data is per-browser. To move machines: Settings → Backup → **Export JSON** on the old machine, **Import JSON** on the new one (settings and integrations travel too, so configure once).
- Pick a backup folder when prompted (Chrome/Edge) — ideally inside a synced directory (OneDrive/Dropbox) for an offsite copy.
