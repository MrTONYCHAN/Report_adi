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
