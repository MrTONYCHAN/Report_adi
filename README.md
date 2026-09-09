# ADIGRAMS — Go-Live readiness review

## MongoDB dashboard

The React dashboard is in [`adigram-react`](adigram-react/README.md). Its complete
MongoDB migration and friend setup instructions are in
[`MONGODB-HANDOFF.md`](adigram-react/MONGODB-HANDOFF.md). Run those commands from
`adigram-react`; the older root-level API and migration scripts are separate.
`Data/` contains developer-provided browser migration inputs. Generated MongoDB
bundles are distributed directly rather than added to the repository.

## Vercel deployment

`vercel.json` is what Vercel builds from. It builds the React dashboard in
`adigram-react`, serves `adigram-react/dist` as the site, and routes every
`/api/*` request to `api/[...route].mjs`, which wraps the same
`adigram-react/server/api.mjs` handler the local dev server uses. The
root-level `src/server.js` Express API is legacy and is no longer deployed.

The deployment needs two environment variables set in the Vercel project
(Settings -> Environment Variables, Production and Preview):

- `MONGODB_URI` - a **MongoDB Atlas** connection string. The local
  `mongodb://127.0.0.1:27018` URI in `adigram-react/.env.local` is not
  reachable from Vercel. The API writes in transactions, so the cluster must be
  a replica set; every Atlas cluster is one.
- `MONGODB_DB` - the database name, e.g. `adigrams_dashboard`.

That database must already hold the report. Seed it once by pointing
`adigram-react`'s `.env.local` at the same Atlas URI and running `npm run
db:import` from `adigram-react`; see
[`MONGODB-HANDOFF.md`](adigram-react/MONGODB-HANDOFF.md).

Until both variables are set the site still loads: the API answers 503 with a
readable message and the dashboard shows its data-unavailable state rather than
crashing the function.

## Access gate

The dashboard sits behind an 8-digit access code, entered one digit per box.
The initial code is `00000000`.

The code is never stored anywhere in the repository or in the deployed bundle.
What ships is a PBKDF2-SHA256 verifier (210,000 iterations, random salt) in
[`adigram-react/server/access.mjs`](adigram-react/server/access.mjs); a
submitted code is hashed and compared against it in constant time. A correct
code returns an HttpOnly, SameSite=Strict, Secure session cookie holding a
signed 12-hour expiry, not the code.

The check runs on the server, ahead of the data layer, so `/api/*` answers 401
to anyone without a session. Reading the JavaScript bundle or calling the API
directly does not get past it.

To change the code, set one of these in the Vercel project and redeploy:

- `DASHBOARD_ACCESS_CODE` - the new code in plain text, hashed at startup.
- `DASHBOARD_ACCESS_VERIFIER` - a pre-computed verifier, so the code itself
  never goes into the environment. Generate one with:

  ```
  node -e "import('./adigram-react/server/access.mjs').then(m=>console.log(m.hashCode('YOUR-CODE')))"
  ```

Optionally set `DASHBOARD_SESSION_SECRET` to an independent random string;
without it the cookie signing key is derived from the verifier, which is
already unrelated to the code but rotates whenever the code changes.

Be aware of what an 8-digit numeric code is worth: 100 million combinations,
and no lockout. The per-attempt PBKDF2 cost is the only throttle. It keeps
casual visitors out of a link that has been shared around; it is not protection
against a determined attacker, and `00000000` in particular is a first guess.
Change it before the link goes anywhere public.

## Encrypted published review

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
