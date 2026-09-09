# ADIGRAMS readiness dashboard

React + TypeScript + Vite dashboard over the ADIGRAMS 2.0 go-live readiness report, with its own
tracker for the work that follows. No sample records or metric arrays are shipped in the
application.

## Run

Requires Node.js 22.12+ (Node.js 24 recommended for the data tests).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5174. The existing `.env.local` points to the original ADIGRAMS readiness
HTML on this machine. On another machine, copy `.env.example` to `.env.local` and set
`REPORT_SOURCE` to the unencrypted report's absolute path. Restart the server after changing
configuration.

For the production build with its data API:

```sh
npm run build
npm start
```

`npm run preview` also serves the API. Static hosting of `dist/` alone cannot supply report data.
The bundled server binds only to localhost; it is intended for local use, not public access to the
private report.

## Two data sources, one board

The readiness report is **read-only**. It is the 5 September assessment plus the 6 September
remediation pass, and rewriting it would destroy that record. Everything the dashboard adds lives
in a JSON overlay beside it — `server/adigram-store.json`, or wherever `ADIGRAM_STORE` points —
which the API merges on every read:

| Comes from the report            | Comes from the overlay                             |
| -------------------------------- | -------------------------------------------------- |
| Test cases, verdicts, findings   | Tasks and defects added on the dashboard           |
| The recorded remediation history | Status moves made on report records (as overrides) |
| The team roster                  | Assignees, start dates, due dates, workflow log    |
| Slot placeholder names           | Roster corrections made on the Developers page     |

Rows added on the dashboard are labelled as such on the board and in every export, so a planned
item is never mistaken for a recorded assessment outcome.

### API

| Endpoint               | Method         | Purpose                                           |
| ---------------------- | -------------- | ------------------------------------------------- |
| `/api/dashboard`       | GET            | Report + overlay + workflow metadata              |
| `/api/items`           | POST           | Create a task or defect                           |
| `/api/items/:id`       | PATCH / DELETE | Edit, move or remove a dashboard item             |
| `/api/records/:caseId` | PATCH          | Move a report record without editing the report   |
| `/api/team/:memberKey` | PATCH / DELETE | Correct a roster entry, or reset it to the report |

## Workflow automation

`server/workflow.mjs` holds the tracker logic in two deliberately separate halves.

**`TRANSITIONS`** is the board's grammar: which status a card may legally move to next. The Move
menu in the interface is built from this same table, so the interface cannot offer a step the
server would reject.

**`RULES`** is the automation. Each rule is a pure `(item, now) => patch` function, so the same
board state always produces the same result and the engine can be tested without a clock. Rules run
whenever the board is read or written — a due date passes with nobody watching — and a run that
changes nothing writes nothing. Every rule only moves work forward or raises a flag; none of them
close or delete work a person did not close.

| Rule                      | What it does                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `activate-scheduled`      | Work planned for a future date leaves Scheduled on the morning it starts               |
| `sla-due-date`            | A missing due date is filled from severity (critical 2d, high 5d, medium 10d, low 20d) |
| `flag-overdue`            | Anything still open past its due date is marked breached                               |
| `escalate-stale-critical` | A critical defect that has not moved in 3 days is escalated                            |
| `progress-to-review`      | A task reported at 100% moves to Review                                                |
| `close-verified`          | A defect verified for 7 days is closed                                                 |

The engine runs headlessly: there is no page for it. Its transitions drive the Move menu on the
task board and the defect register, its audit trail feeds the activity list behind the header's
bell, and the response targets appear in the New task / New defect dialog as it explains what will
happen to the item being created. Rules are always on; the switches that used to toggle them lived
on a Workflow page that has been removed.

### Planning ahead

Creating a task or defect with a start date in the future opens it in **Scheduled** rather than on
the live board, and the dialog says exactly what the workflow will do with it before you save. It
waits in the board's Scheduled column and moves into the first active column by itself on the day.

## Editing the roster

The report's roster often still carries slot placeholders — "Developer 1" where a real name
belongs. The **Developers** page shows the roster as a table where **Edit** turns a row into inputs
for name, role and workstream, **Save** writes the correction to the overlay, and a **Reset** button
appears on any corrected row to drop the override and fall back to whatever the report says.

Only those three identity fields are editable. Updated, Open, Resolved and Share are computed from
the recorded remediation log — they are facts about what happened, not settings, so they cannot be
typed over. The server refuses a correction for a member the report does not have, which keeps the
overlay free of orphaned rows.

## Filtering by date

Both the tasks board and the defect register carry a calendar filter. It picks the field to match
on (due, start, raised, last updated, or any of them), a range on the calendar or from a quick
preset — overdue, due today, next 7 days, this month — and the sort direction. Choosing a range
also switches the board's ordering to that date, because a register read as a schedule should be in
schedule order. Rows carrying no date on the chosen field are excluded while a range is applied,
and the count of what that hides is stated rather than left implicit.

## Exports

Every page exports what is currently on screen — the filters are applied, not bypassed — as either:

- **CSV** for Excel, Sheets or Numbers. UTF-8 with a BOM so Excel on Windows reads it correctly, and
  every cell beginning `=`, `+`, `-` or `@` is prefixed so a report title is never evaluated as a
  formula.
- **Word (.docx)** — a real OOXML package with formatted tables, not an HTML file with a `.docx`
  name, so the tables stay editable when pasted into a status pack.

The Overview page's **Status pack** export is the multi-section one: headline numbers, workstream
outcomes, open tasks and open defects in a single document. The `docx` library is imported at the
moment of the click rather than shipped with the page.

## Theme and layout

The header carries a theme toggle: one click flips light and dark, and the menu beside it pins the
choice or follows the device. The preference is stored per browser and the mobile browser chrome
follows it. The sidebar collapses to an icon rail with the header's panel button or **Ctrl + B**,
keeping navigation one click away on a wide monitor; that preference is stored too. Both degrade
gracefully in a browser with site data blocked.

The header refresh button re-fetches on demand and turns red when the last refresh failed; React
Query also refreshes every 30 seconds and on window focus.

The header carries no rule beneath it — the blurred panel alone separates it from the page, so its
controls read as floating rather than boxed. A few conventions keep the pages from sprawling:

- Long registers scroll inside their panel rather than stretching the page. The task board is a
  sideways-scrolling kanban whose columns each scroll independently, so one busy column cannot drag
  the page to several thousand pixels.
- A panel with nothing to show uses the shared compact empty state and says _why_ it is empty. A
  chart with no series does not reserve a screen-high void; the readiness trend only appears once
  there is a series to draw, and two-column rows are top-aligned so a short panel stays short.
- Entry animations are staggered but capped, so a fifty-row register finishes appearing in about a
  third of a second rather than two seconds.
- Repeated defaults are suppressed. "Unassigned" and "No due date" are true of nearly every row the
  report supplied, so cards show only the facts that differ from the default.

## Data and calculations

`GET /api/dashboard` rereads the report on every request. Request failures show an error or clearly
marked last successful data; there is no fallback to fabricated data.

- Test counts and workstream bars are computed from actual case verdicts.
- Findings and the severity chart are computed from the actual finding rows.
- Remediation tasks include recorded tracking and cases whose assessment is not PASS. Tracking maps
  open → To do, prog → In progress, fixed → Review, ver → Done.
- The original assessment verdict remains separate from remediation status. A verified remediation
  does not rewrite the historical assessment to PASS.
- **The person who stamped a tracking update is a contributor, not an assignee.** Report rows show
  Unassigned until someone is named on the dashboard.
- Developer metrics describe recorded contributions: updated cases, updates still open,
  fixed/verified updates, and each member's share of the recorded update history. They are not
  inferred assignments or capacity estimates.
- The report does not provide historical readiness or defect snapshots, so those charts show an
  explicit empty state rather than an invented trend.
- Activity merges the report's embedded remediation log with the dashboard's own workflow log.

The report data source is the original report file, **not a live MongoDB connection**. The report
adapter is in `server/report-source.mjs`; replace it with an authenticated database/API integration
when its connection is supplied. No database credentials are sent to the browser.

## Verification

```sh
npm run typecheck
npm run lint
npm run test:data
npm run build
```

`npm run test:data` covers both the report adapter and the workflow engine
(`server/workflow.test.mjs`): scheduling, SLA dates, breach flagging fired once rather than
repeatedly, escalation, disabled rules, and that no rule can make a move the transition table
forbids.

Charts and progress bars use separate light fill tokens while text and status labels retain
contrast in both themes.
