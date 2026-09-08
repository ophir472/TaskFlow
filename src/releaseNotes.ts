// App versioning — bump APP_VERSION and PREPEND a release entry on every
// push (part of the session finish routine in CLAUDE.md). Shown at the
// bottom of Settings; clicking the version opens the full history.

export const APP_VERSION = '1.2.0';

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  notes: string[];
}

export const RELEASES: Release[] = [
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
