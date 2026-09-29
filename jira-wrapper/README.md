# Jira wrapper (Jira Mover)

A standalone side tool that lives in the TaskFlow repo but shares no code,
build or data with it. Run everything below from this `jira-wrapper` folder.

Move a Jira ticket to **In progress** in one click. It runs inside the Jira
page itself: click a ticket, a pane opens, press the button. The fields the
move demands are filled from your defaults.

## Install

**Bookmark (nothing to install).** Run `npm run build`, open
`dist/install.html` in the browser and drag the blue button to the bookmarks
bar. On any Jira page, click the bookmark.

**Userscript (always on).** With Tampermonkey or Violentmonkey, install
`dist/jira-mover.user.js`. It wakes up only on Jira pages, survives page
refreshes, and the pane opens by itself when you click a ticket.

## First use

1. Open the pane, press **⚙**, then **Detect**. It finds the field ids of
   acceptance criteria, story points, scrum team and epic by name.
2. Type your default scrum team and epic. Story points default to 1 and
   acceptance criteria to the ticket's title.
3. Click a ticket, press **Move to In progress**.

If Jira asks for a field that has no default, the pane shows an input for it.
Tick "remember" and it is never asked again.

## What it does on a move

1. **Fills the ticket first.** Every default whose field is empty is written
   on the ticket (there is a setting to overwrite instead). Jira's workflow
   checks the ticket's fields on each step, so it must be complete before
   the first move.
2. **Then walks the flow** `New > To do > In progress > Done` one legal
   transition at a time, in either direction. A field that can only be set
   on a transition screen goes in with that transition.
3. **If Jira still refuses** because of a field, the pane asks for exactly
   that field, with Jira's own choices when it is a list.

## The pane

Drag it by its title bar, resize it from the bottom-right corner. Position
and size are remembered; double-click the title bar to reset. It can't be
dragged off-screen.

## Keys

`Alt+I` move to In progress · `Alt+J` show/hide the pane · `Esc` close

## Privacy

It uses the Jira session of the tab it runs in. It talks only to that Jira's
own REST API. Settings are stored in that browser, per Jira host. No token.

## Develop

    npm test        # logic tests + an end-to-end run in headless Chrome against a mock Jira
    npm run build   # dist/jira-mover.user.js, dist/install.html, dist/bookmarklet.txt
