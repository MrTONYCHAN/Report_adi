# ADIGRAMS MongoDB handoff

Send the `ADIGRAMS-MongoDB-Handoff.zip` archive to your friend. It contains the application,
the complete exported database data in `migration-data.json`, and these instructions.
Credentials, local configuration, node_modules, and database files are excluded.
The data bundle contains the actual report content and team names; share it privately.

## Quick start for your friend

Install Node.js 24 or newer. Extract the archive, then open a terminal in the extracted
application folder (the folder containing `package.json`). Commands below use `npm`;
on Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

```sh
npm ci
```

Copy `.env.example` to `.env.local`. On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Choose one MongoDB option:

1. **Local MongoDB without Docker:** run `npm run db:local` in a separate terminal and
   keep it running. The first run downloads the MongoDB server binary. Data persists
   in `.mongo-data`; stopping the process does not delete it. Run the same command
   after restarting your computer. Keep the default URI and database in `.env.local`.
2. **Docker:** start Docker Desktop, then run `docker compose up -d --wait`.
   Keep the default URI. Do not also run `db:local`: both use port 27018.
   Data persists in the `adigrams_mongo` Docker volume. This option was supplied as
   an alternative; the verified local migration used option 1.
3. **MongoDB Atlas / your own replica set:** set `MONGODB_URI` and `MONGODB_DB`
   in `.env.local`. Use a new, dedicated database such as `adigrams_dashboard`.
   Keep credentials only in that local file. The MongoDB user needs read/write and
   collection/index creation permissions on this database. Permit your computer's
   IP through the database's network access settings.

Then run:

```sh
npm run db:validate
npm run db:import
npm run db:check
npm run build
npm start
```

Open **http://127.0.0.1:5174**. The original HTML report and `REPORT_SOURCE` are not
needed: the running application reads and writes MongoDB exclusively.

## Collections (MongoDB's equivalent of tables)

| Collection         | Key              | Contents                                                          |
| ------------------ | ---------------- | ----------------------------------------------------------------- |
| `reportMetadata`   | `report`         | Source metadata, import checksum, transaction revision            |
| `testcases`        | Case ID          | Original verdict, title, finding, current remediation and history |
| `findings`         | Finding ID       | Integration findings, severity and any tracking/history           |
| `developers`       | Member key       | Names, slots, workstreams, roster order                           |
| `tasks`            | TASK-number      | Work created in the dashboard, including its history              |
| `bugs`             | BUG-number       | Defects created in the dashboard, including their history         |
| `recordOverrides`  | Case/finding ID  | Current board status, assignee and dates for report records       |
| `teamEdits`        | Member key       | Roster corrections made in the dashboard                          |
| `automationEvents` | Ordered entry ID | Dashboard workflow audit log                                      |
| `workflowRules`    | Rule ID          | Enabled/disabled configuration for workflow rules                 |
| `versions`         | Version sequence | Imported saved versions, when present                             |
| `counters`         | task / bug       | Last allocated item number, retained after deletion               |

The initial report contains **50 test cases, 8 findings and 5 roster entries**, with
**24 recorded status-history entries** embedded in the source records. No standalone
dashboard tasks, bugs, overrides or saved versions existed locally at extraction.
Their collections are created empty. The Tasks and Bugs screens also derive work
from the report records; these are not duplicated as separate `tasks`/`bugs` documents.

Readiness totals, charts and contributor metrics are calculated from these records.
They are not stored as separate totals that could become inconsistent. Browser-only
preferences such as theme and sidebar state remain on each computer.

## Migration and backups

The importer validates the bundle checksum and data shape, creates indexes, and
imports all collections in one transaction. An identical import is a no-op, preserving
subsequent edits. Importing a different bundle into a populated database is refused.
Use a new database name when restoring a newer backup; there is no destructive force mode.
Do not run the repository root's older `migrate:seed` scripts against this database.

Export current MongoDB data, including edits made after the first import:

```sh
npm run db:export -- backup-2026-09-09.json
npm run db:validate -- backup-2026-09-09.json
```

On the receiving machine, point `.env.local` at a new database, then:

```sh
npm run db:import -- backup-2026-09-09.json
```

Export commands refuse to overwrite an existing file; choose a new filename.
For a one-time migration from legacy files, configure `REPORT_SOURCE` and optionally
`ADIGRAM_STORE`, then run `npm run db:extract -- legacy-export.json` followed by
`npm run db:import -- legacy-export.json`. Damaged input must be fixed before importing.

## Shared database versus an independent copy

The archive gives your friend an independent copy. To collaborate on the same data,
configure both local applications with the same database, using individually issued
database credentials. Import only once. The application listens on localhost and
has no application login system; it is not configured for public web hosting.

The persistence layer uses transactions with a revision lock to prevent concurrent
users from overwriting each other's changes. This requires an Atlas cluster or
replica set; a standalone `mongod` cannot run these transactions. See the
[MongoDB transaction documentation](https://www.mongodb.com/docs/manual/core/transactions/).

## Checks and troubleshooting

```sh
npm run typecheck
npm run test:data
npm run build
```

The integration tests launch an isolated real MongoDB replica set and exercise import,
concurrent creation, edits, rollback, safe re-import, deletion and export/import.
They do not modify your configured database. Initial execution may download MongoDB.

- **Connection failed:** start the selected MongoDB service, check `.env.local`,
  and restart `npm start` or `npm run dev` after changing configuration.
- **Database not initialized:** run `db:import` with the supplied bundle.
- **Target contains data:** use a new database name; do not delete existing work.
- **Port in use:** stop the other instance you started or choose one MongoDB option.
- **GitHub Pages:** serves static files only. Run the included Node server locally
  or deploy it separately with an appropriate authentication layer for remote users.

Do not commit `.env.local`, migration bundles, or `.mongo-data` to GitHub.
