// App versioning — bump APP_VERSION and PREPEND a release entry on every
// push (part of the session finish routine in CLAUDE.md). Shown at the
// bottom of Settings; clicking the version opens the full history.

export const APP_VERSION = '1.7.0';

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '1.7.0',
    date: '2026-09-10',
    notes: [
      'Bookmarks: a line with a bump along the bottom of every screen (or b) opens a full bookmark manager — nested folders, drag to organise, tags, notes, favorites, Unsorted inbox, duplicate check, list/grid/cards, Chrome HTML import/export, search with tag: / folder: / is:. Every link on a card is mirrored here automatically, tagged with the task',
      'Docs: Notion-style blocks — nested to-dos, toggles, callouts, quotes, code, tables, [[links]] to pages and tasks; / block menu, [[ link picker, Enter/Tab list handling, ⌘B/I/E. Links boards became bookmark folders',
      'Daily agenda: any Docs checklist page can be a step — ticks reset at midnight, tick inline from Home or the walkthrough, copy link / Add to agenda on the page',
      'Daily agenda: Sweep — skim Outlook + Teams, jot subject + key point, Next, Done; replies stay in the preview walk. Pipeline redrawn Jenkins-style with live per-stage numbers, full width',
      'Communication: Outlook / Teams per entry (real brand marks); card threads get Outlook / Teams + ◉ Focus; the Hub lists focus threads touched today (Settings → General → Hub)',
      'Hub rebuilt: Get back to on top, then Today and All cards with ITSM · custom systems · waiting for · communication · followups, each full width; blue ✓ = followed up today on every row; the Home tile counts what is left',
      'Comments on every card — quick timestamped updates; the review\'s Update-Jira box opens with them and the Σ summary lists them',
      'Table: Archive view folded in (is:archived / status:done, ↩ Restore), group by requester/project with click-to-filter, Kibana-style filter picker, URL-mirrored search + view + page size with a copy-link button, filter bar and empty state with a way out, Tags as a dropdown like Kind, professional Gantt with drag to reorder / resize, cards view roomier, bulk archive/restore without dialogs (banner)',
      'Sprint: only quick work from Today cards by default (toggle in Settings → Sprint queue)',
      'Look: page, cards, rows and borders read apart (two steps darker); new High contrast theme',
      'Fixes: page 2 was unreachable; browser-back left the task popup open with a filter set; closing an overlay after a walkthrough hop reopened the previous one; the walkthrough bar lingered; the header ran off-page when zoomed; Continue button vanished on custom steps; pipeline stages overlapped',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-10',
    notes: [
      'Table: a search box in the toolbar — matches title, requester, project, Jira, ITSM, notes and description; / focuses it, Esc clears',
    ],
  },
  {
    version: '1.5.2',
    date: '2026-08-27',
    notes: [
      'Fix: the Kind dropdown inside the Table was clipped by the table — it now floats above it',
      'Audit: every store event is registered for logs/versioning; reminder reschedules get a version-history line; backup defaults cover the daily counters',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-08-27',
    notes: [
      'Kind (Planned / Urgent / Quick help) is a dropdown too on existing tasks — card, popup, Quick Help and the Table column; the create form keeps its chips',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-08-27',
    notes: [
      'Priority tags on the card and in the task popup are a dropdown: collapsed it shows the chosen tags, open it shows the same four chips as before (↑↓ · ↵ · Esc)',
      'Untagged cards show an amber "Untagged — pick tags" button and open it automatically, as the tag sweep did',
      'The create form keeps its chip visuals',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-08-27',
    notes: [
      'In scope is a sub-task property only — the task-level pill is gone; ▶ Play decides per step',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-08-27',
    notes: [
      'Followup marks are now one glyph apart: ✓ = progressed (blue), ✓✓✓ = done (green) — on the card, the Hub, and the ticket rows',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-27',
    notes: [
      'In scope / out of scope on every task (◎ pill next to Kind) and every sub-task (◎ on the row)',
      '▶ Play focus mode only stars and executes in-scope steps; its next-task queue and the walkthrough skip out-of-scope tasks',
      'Default is in scope — nothing changes until you opt something out',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-08-27',
    notes: [
      '"Get back to <who>" is back — alongside the new Followup table, not instead of it (Spotlight / Explore / ⌘K / Hub creation, popup with ✓ top-right and Done)',
      'Notes that v1.3.0 had turned into cards are converted back automatically (migration v11) — nothing lost either way',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-27',
    notes: [
      'Followup table on every card (under Waiting for): title + notes rows, plus an auto row per ITSM / custom-system ticket',
      'Blue ✓ progressed (strikes through, resets at 00:00) · green ✓ done (hides, "Show completed" reveals); the ticket ✓ and its followup row are one state',
      'Hub: today\'s cards\' followups (progressed/done disappear until "Show done"), all followups collapsed',
      'Every progress/done is logged and versioned; Review\'s Σ day summary lists followups completed / progressed',
      'Replaces v1.2.0\'s standalone "Get back to" notes — existing ones become a card with one followup row (nothing lost)',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-27',
    notes: [
      '"Get back to <who>" — a name + a note, nothing else; create it from Spotlight (⌘F), Explore search, ⌘K, or the Hub',
      'Shows only on the ▣ Hub and in search — never the card feed, table, or Kanban; ✓ marks it followed up',
      'Logged and versioned like every other edit; counted in Review\'s Σ day summary ("Followed up with" / "Added to get-back-to")',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-27',
    notes: [
      'App versioning: this release-notes history, reachable from the version number at the bottom of Settings',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-27',
    notes: [
      '▣ Hub page: every ITSM + custom-system ticket across all cards, today\'s communications and open waiting-for rows',
      '✓ not-relevant toggle per ticket, on the card and on the Hub',
      'Dashboard "Open tickets" tile (combined ITSM + custom count)',
      'Archive: click the blank space after a title to open; archived mail opens the mail popup',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-08-27',
    notes: [
      'Dashboard homepage (⌂, key 1): stat tiles, daily agenda pipeline, activation, continue, walkthrough mode, gamification strip',
      'Task kinds: Planned / Urgent / Quick help (⚡ Quick Help walker view); urgent Jira label; Kind column + filter in the table',
      'Table redesign: flat + Filter menu with pills, pagination, table/cards/pipeline/gantt views',
      'Kanban To-do column; today ⇄ in-progress pairing; archived ⇒ done',
      'Custom systems (URL integrations with templates + FILL), meeting-minutes builder, Σ day summary + Docs archive, requester quick-create, hold ⏭ 1h/17:00 + on-hold queue',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-08-19',
    notes: [
      'Sprint pool control: mail first then oldest-first tasks/subtasks, type toggles, drag order',
      'Review queue: drag order, per-card dismiss, join-last ordering',
      'Queue items open as overlays; ⌘F results open the card in place',
      'Update-Jira prefill includes blockers, waiting-on and changed subtasks',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-08-18',
    notes: [
      'Local API proxy — Jira/ServiceNow/AI REST calls work everywhere (no browser CORS)',
      'Jira Data Center support: PAT / Basic auth, api/2, XSRF fix, Test-connection button, urgent-label',
      '⧉ ticket popup windows beside every ↗',
      'Guided onboarding tour on sample data; multi-tab clobber guard',
    ],
  },
];
