# ADIGRAMS readiness dashboard

React + TypeScript dashboard backed by MongoDB. All report records, roster data,
dashboard work, status overrides and audit history are persisted in MongoDB.
The original report is needed only for the one-time legacy extraction.

See [MONGODB-HANDOFF.md](MONGODB-HANDOFF.md) for installation, database collections,
migration, backups and the steps your friend should follow.

## Run

Requires Node.js 24+. Copy `.env.example` to `.env.local`, then:

```sh
npm ci
npm run db:local
```

Keep MongoDB running. In another terminal, import the supplied private bundle:

```sh
npm run db:import
npm run build
npm start
```

Open http://127.0.0.1:5174. For development, use `npm run dev` instead of `npm start`.
Atlas and Docker alternatives are described in the handoff guide. The private data
bundle is supplied separately and is not committed to GitHub.

## Data behavior

Original assessment verdicts remain separate from later remediation status.
Report-derived work is calculated from MongoDB test cases and findings; dashboard-created
work is stored in the tasks and bugs collections. The contributor on an update is
not automatically treated as its assignee. Missing historical chart data is shown
as an empty state. Data-source failures never fall back to fabricated records.

All API mutations commit before responding. Transaction retries read the latest
state, so concurrent edits and generated IDs do not silently overwrite each other.
Rule definitions remain in `server/workflow.mjs`; their enabled state is in MongoDB.
Automation runs when the board is read or modified, not on a background timer.

## Verification

```sh
npm run typecheck
npm run test:data
npm run build
```

Tests include real MongoDB import/export, concurrent writes and rollback, plus the
legacy report parser and workflow rules. The server binds to localhost; this is not
an authenticated public deployment. MongoDB credentials stay on the server.
