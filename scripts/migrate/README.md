# Migrating the readiness review into MongoDB

Moves the review's tracked state out of `localStorage` — where it is invisible
to everyone but the browser that typed it — and into three shared collections.

## Why

Today `save()` writes one JSON blob to `localStorage` under
`adigrams-golive-readiness-v3`. Nobody sees anyone else's work, ever. The
remediation is visible to all readers only because it was hardcoded into the
page as seed arrays. That is the problem this migration closes.

Seeded and verified against the `report_adi` cluster: 5 team members, 58
testcases (50 cases + 8 findings), 24 tracked cases, 24 log entries.

## The three collections

| Collection | Holds | Written by |
|---|---|---|
| `team` | The roster: slot, area, name | Editing a name, `+ Add developer` |
| `versions` | Full snapshots plus the optional remark | `Save version` |
| `testcases` | The 50 cases, the 8 findings, their tracking, wording edits, and the update log | Every status click and wording edit |

The update log lives in `testcases.history` rather than in a fourth collection.
Every entry concerns exactly one case, so each status click is a single atomic
write — `$set` on `tracking`, `$push` on `history` — and one change stream on
`testcases` drives both the live rows and section 03. Section 03 renders as:

```js
db.testcases.aggregate([
  { $unwind: '$history' },
  { $sort: { 'history.at': -1 } },
  { $limit: 200 },
])
```

### Two status fields, deliberately

`verdict` (`PASS` / `FAIL` / `PARTIAL` / `NOT RUN`) is the finding as assessed on
5 September. It is **fixed and must never be writable through the API** — the
page says so in its own copy. `tracking.status` (`open` → `prog` → `fixed` →
`ver`) is the team's mutable remediation state and is what the Updated / By / On
columns show.

Findings (`F-01`…`F-08`) carry `severity` instead of `verdict` and are
read-only, matching the page today. The `kind` discriminator means enabling
tracking on them later is a flag, not a migration.

## Running it

```bash
npm install

# 1. Only if the private source is not on this machine:
$env:ACCESS_CODE = "..."            # PowerShell; bash: ACCESS_CODE=...
npm run migrate:decrypt

# 2. Source HTML -> source-data.json
npm run migrate:extract -- ../ADIGRAMS_GOLIVE_READINESS.decrypted.html

# 3. Review the plan, then load it
npm run migrate:seed -- --dry-run   # no connection opened
npm run migrate:seed

# 4. Once every person's export has been collected
npm run migrate:merge -- ./exports --dry-run
npm run migrate:merge -- ./exports
```

`--dry-run` on the seed and merge works offline, so the plan — especially the
version renumbering — can be reviewed from a machine that cannot reach the
cluster.

### `decrypt-page.mjs`

Only needed when the private source repository is not checked out locally.
Recovers the plaintext review from this repository's encrypted `index.html`,
mirroring exactly what the browser does at [index.html:733-763](../../index.html#L733-L763):
PBKDF2-SHA256 over the access code with the page's salt and iteration count,
then AES-256-GCM with the page's IV. Node keeps the GCM auth tag in a separate
call where WebCrypto expects it appended to the ciphertext, so the trailing 16
bytes are split off.

Pass the code through `ACCESS_CODE` rather than `--code`, so it stays out of
shell history. A wrong code fails GCM authentication and is reported as such —
that is the only signal there is, exactly as the page reports it.

The output is written **outside** this repository by default and is covered by
`.gitignore`. It is the readable review; the entire point of this repository is
that it holds nothing readable.

### `extract-source.mjs`

Parses the unencrypted document — either the private
`documents/ADIGRAMS_GOLIVE_READINESS.html` or the decrypted file above. It
refuses to run against the encrypted `index.html`.

It pulls out 50 cases, 8 findings, their original title/finding HTML (which is
what "restore original" restores), the 5 team slots, and both seed arrays. It
exits non-zero if a seeded entry has no matching row.

**`SEED_ROWS` and `SEED_LOG` are deliberately different sets — do not derive
one from the other.** `SEED_ROWS` is what the Updated / By / On columns show:
the state a case now stands at and who last put their name to it. `SEED_LOG` is
the history of state *changes* behind it. On 7 September each developer
confirmed work already recorded and took their name to it — a change of hand,
not a change of state — so it moves By and On without inventing a log entry
saying Fixed became Fixed. `D3-01` is the clearest example: `tracking` carries
Vinay on 7 Sep, `history` carries CHANDAN on 6 Sep. That is why `tracking` and
`history` are separate fields.

### `seed-mongo.mjs`

Creates the indexes and upserts the documents. Idempotent by field: `original`,
`verdict` and `severity` are the source's and are always refreshed, while
`tracking`, `edits` and `history` are `$setOnInsert` only — so re-running after
a wording fix in the source does not wipe anyone's work.

It refuses to run if the database already holds tracked cases or saved
versions, because a re-seed resets tracking to the seeded baseline. `--force`
overrides. (Verified: a second run against the seeded database is refused.)

### `merge-localstorage.mjs`

**Collect these exports before cutting the page over.** Once the page reads from
Mongo, `localStorage` is never read again and that history is stranded — not
deleted, but orphaned behind a code path nothing calls.

Each person opens the report and runs this once in the browser console:

```js
copy(localStorage.getItem("adigrams-golive-readiness-v3"))
```

Save each result as `<name>.json` in one directory, then point the script at it.
Both raw and double-quoted forms are handled.

Merge rules:

- **`rows` / `text`** → last-write-wins on each record's own timestamp. With
  one person per case in practice, conflicts are rare and the later click is
  the one that meant it.
- **`log`** → union, deduplicated on case + timestamp + member + kind.
  `$addToSet` makes re-running safe.
- **`versions`** → every browser numbered its own `v1.0, v1.1 …` independently,
  so the numbers collide across people and mean nothing together. All snapshots
  are ordered by when they were actually saved and renumbered into one sequence.
  `originalLabel` and `originalOwner` record where each came from. The dry run
  prints every renumbering.
- **`team`** → matched on **name, never on slot**. Slots collide: removing
  Developer 3 then adding one produces a second "Developer 4", and the page's
  own tally counts log entries by slot string, so the two would claim each
  other's updates. Names identify a person; `memberKey` is the foreign key
  everywhere else.

## Adding a test case afterwards

IDs increment **per workstream**, not globally. Current maxima are D1→12,
D2→12, D3→14, D4→12, so the next ones are `D1-13` and `D3-15`.

```js
const last = await db.collection('testcases')
  .find({ workstream: 'D1', kind: 'case' })
  .sort({ seq: -1 }).limit(1).next();
const seq = (last?.seq ?? 0) + 1;
const caseId = `D1-${String(seq).padStart(2, '0')}`;
```

Allocate server-side only — computing it in the browser races the same way
`nextVersionName()` does. The unique index on `caseId` is the backstop: catch
the duplicate-key error and retry. Do not reuse numbers after a delete; a
removed case may still be referenced in the update log and in saved snapshots,
so gaps are correct. New cases should default to `verdict: 'NOT RUN'` and carry
an `addedAt`, since they were not part of the reviewed baseline.

## Still to do in the page

The migration lands the data. These are the page-side changes it implies:

- Render the four workstream tables from `GET /api/testcases` instead of
  shipping literal `<tr>` markup. This is the largest single change: the
  document's content stops being the document.
- Compute the workstream header chips and meter widths, which are hand-written
  HTML today and already drift from the runtime-computed donut when a row is
  added.
- Drop the runtime seeding block — it exists only because there was no server.
- Scope "Reset my updates" to the acting member. Against a shared database it
  would otherwise wipe everyone's work.
- Keep `acting` in `localStorage`. It is per-reader state; sharing it would let
  one person silently re-identify everyone else mid-session.
- Skip live re-renders of a focused `contenteditable` cell, or an update landing
  mid-sentence wipes what someone is typing.
- Correct the copy that still says tracking is per-browser.
