# ADIGRAMS — Go-Live readiness review

This repository publishes one page: an encrypted review document served through
GitHub Pages.

`index.html` contains no readable text. The document body is AES-256-GCM
ciphertext under a key derived from an access code with PBKDF2-SHA256, and the
code is not stored here, in the page, or in CI. Opening the file without it
shows a lock screen and nothing else.

The review is regenerated from its source with
`scripts/build-protected-page.js`, which lives in the private project
repository along with the unencrypted original. Neither is kept here, and
neither should be added: the whole point of this repository is that it holds
nothing worth reading without the code.

## Publishing

Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`.

No workflow is needed. `.nojekyll` stops Pages from running the file through
Jekyll on the way out.

## The API

The review's tracking used to live in one `localStorage` blob per browser, so
nobody saw anyone else's work. It now lives in MongoDB and is served from
`src/`. See [scripts/migrate/README.md](scripts/migrate/README.md) for the
schema and the one-time migration.

```bash
npm install
npm run db:check     # connection smoke test
npm start            # http://localhost:3000
```

| Method | Endpoint | |
|---|---|---|
| `GET` | `/api/health` | ping plus document counts |
| `GET` | `/api/bootstrap` | roster and all 58 rows, one round trip |
| `GET` | `/api/testcases` | `?kind=` `?workstream=` |
| `POST` | `/api/testcases` | add a case; allocates the next id |
| `POST` | `/api/testcases/:caseId/status` | advance the Updated column |
| `PUT` / `DELETE` | `/api/testcases/:caseId/text` | edit wording / restore original |
| `GET` | `/api/log` | section 03, newest first |
| `GET` `POST` | `/api/team` | roster; add a developer |
| `PATCH` `DELETE` | `/api/team/:memberKey` | rename; soft-remove |
| `POST` | `/api/team/:memberKey/reset` | reset one member's updates |
| `GET` `POST` | `/api/versions` | list; save a snapshot |
| `GET` | `/api/versions/:seq` | one version, with its snapshot |
| `GET` | `/api/stream` | server-sent events, live updates |

Writes carry a `memberKey` naming the roster row they come from. There is no
authentication: the roster is an honour system among a named review team, and
that was a deliberate decision. What is enforced is that a change is
*attributable* — the member must exist and must have a name typed against them,
the same rule the page applies before recording a click. The name and slot are
read from the roster rather than trusted from the request.

Three things the API is careful about, each of them a bug in the old page:

- **`verdict` is not writable.** It is the finding as reviewed, and the page
  says so in its own copy. Only `tracking.status` cycles. Findings carry
  `severity` and stay read-only.
- **Ids and version numbers are allocated server-side**, against a unique index
  and retried on collision. The page computed `"v1." + versions.length` in the
  browser, so two people saving at the end of a session both produced the same
  label and one silently overwrote the other.
- **A status click is one atomic update to one document.** The next state is
  computed inside the update pipeline rather than read, decided, and written
  back. The old page rewrote its entire store on every click, so two people
  editing *different* rows would still clobber each other.

`acting` — which row you are acting as — stays in `localStorage`. It is
per-reader state; sharing it would let one person silently re-identify everyone
else mid-session.
