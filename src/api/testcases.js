import express from 'express';
import { getDb } from '../db.js';
import { resolveActor } from './actor.js';

export const router = express.Router();

// The cycle the Updated column walks, and the only statuses accepted.
const ORDER = ['open', 'prog', 'fixed', 'ver'];

// verdict and severity are the finding as reviewed. They are deliberately
// absent from every write below: the page states they are fixed and not
// editable, so the API must not offer a way round that.
const PROJECTION = {
  _id: 0, caseId: 1, kind: 1, workstream: 1, seq: 1, verdict: 1, severity: 1,
  original: 1, edits: 1, tracking: 1, history: 1, addedAt: 1,
};

/* ---- reads --------------------------------------------------------------- */

// Everything the page needs to render itself, in one round trip.
router.get('/bootstrap', async (_req, res, next) => {
  try {
    const db = await getDb();
    const [team, testcases] = await Promise.all([
      db.collection('team').find({ active: true }, { sort: { order: 1 }, projection: { _id: 0 } }).toArray(),
      db.collection('testcases').find({}, { sort: { kind: -1, workstream: 1, seq: 1 }, projection: PROJECTION }).toArray(),
    ]);
    res.json({ team, testcases });
  } catch (err) { next(err); }
});

router.get('/testcases', async (req, res, next) => {
  try {
    const db = await getDb();
    const filter = {};
    if (req.query.kind) filter.kind = String(req.query.kind);
    if (req.query.workstream) filter.workstream = String(req.query.workstream);
    const rows = await db.collection('testcases')
      .find(filter, { sort: { workstream: 1, seq: 1 }, projection: PROJECTION })
      .toArray();
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * Section 03. The log is held per case rather than in its own collection, so
 * the feed is an unwind across cases; at 58 documents that is cheap, and it
 * means one change stream drives both the rows and this list.
 */
router.get('/log', async (req, res, next) => {
  try {
    const db = await getDb();
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const rows = await db.collection('testcases').aggregate([
      { $unwind: '$history' },
      { $sort: { 'history.at': -1 } },
      { $limit: limit },
      { $replaceWith: { $mergeObjects: ['$history', { caseId: '$caseId' }] } },
    ]).toArray();
    res.json(rows);
  } catch (err) { next(err); }
});

/* ---- status -------------------------------------------------------------- */

/**
 * Advances one case through open -> prog -> fixed -> ver -> open.
 *
 * The next status is computed inside the update pipeline rather than read,
 * decided here and written back. That makes the whole thing one atomic
 * operation against one document, so two people clicking the same row cannot
 * lose each other's transition, and - more to the point - two people clicking
 * *different* rows never touch the same document at all. The old page rewrote
 * the entire store on every click, which is what made concurrent editing
 * impossible.
 *
 * An explicit `to` skips the cycle, for a client that wants to set a state
 * directly. Returning to "open" clears tracking rather than storing it, which
 * is what the page means by an untouched row.
 */
router.post('/testcases/:caseId/status', async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const { actor, error } = await resolveActor(req.body?.memberKey);
    if (error) return res.status(400).json({ error });

    const to = req.body?.to;
    if (to !== undefined && !ORDER.includes(to)) {
      return res.status(400).json({ error: `Unknown status "${to}". Expected one of ${ORDER.join(', ')}.` });
    }

    const db = await getDb();
    const at = new Date().toISOString();

    const nextExpr = to !== undefined ? to : {
      $switch: {
        branches: ORDER.slice(0, -1).map((s, i) => ({
          case: { $eq: ['$_cur', s] }, then: ORDER[i + 1],
        })),
        default: 'open',
      },
    };

    const stamp = { ...actor, at };
    const result = await db.collection('testcases').findOneAndUpdate(
      { caseId, kind: 'case' },
      [
        { $set: { _cur: { $ifNull: ['$tracking.status', 'open'] } } },
        { $set: { _next: nextExpr } },
        {
          $set: {
            tracking: {
              $cond: [{ $eq: ['$_next', 'open'] }, null, { status: '$_next', ...stamp }],
            },
            // Newest first, matching the order the log renders in.
            history: {
              $concatArrays: [
                [{ kind: 'status', from: '$_cur', to: '$_next', ...stamp }],
                { $ifNull: ['$history', []] },
              ],
            },
          },
        },
        { $unset: ['_cur', '_next'] },
      ],
      { returnDocument: 'after', projection: PROJECTION },
    );

    if (!result) return res.status(404).json({ error: `No test case "${caseId}".` });
    res.json(result);
  } catch (err) { next(err); }
});

/* ---- wording ------------------------------------------------------------- */

// Editing the title or finding. `original` is never touched, so "restore
// original" always has something true to go back to.
router.put('/testcases/:caseId/text', async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const { actor, error } = await resolveActor(req.body?.memberKey);
    if (error) return res.status(400).json({ error });

    const patch = {};
    for (const field of ['title', 'finding']) {
      if (typeof req.body?.[field] === 'string') patch[field] = req.body[field];
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Nothing to change: send a title or a finding.' });
    }

    const db = await getDb();
    const at = new Date().toISOString();
    const stamp = { ...actor, at };

    const result = await db.collection('testcases').findOneAndUpdate(
      { caseId },
      [
        { $set: { edits: { $mergeObjects: [{ $ifNull: ['$edits', {}] }, patch, stamp] } } },
        {
          $set: {
            history: {
              $concatArrays: [
                Object.keys(patch).map((field) => ({ kind: 'text', field, ...stamp })),
                { $ifNull: ['$history', []] },
              ],
            },
          },
        },
      ],
      { returnDocument: 'after', projection: PROJECTION },
    );

    if (!result) return res.status(404).json({ error: `No test case "${caseId}".` });
    res.json(result);
  } catch (err) { next(err); }
});

// "Restore original" - drops the edit and leaves the log entries that recorded
// it, because they did happen.
router.delete('/testcases/:caseId/text', async (req, res, next) => {
  try {
    const db = await getDb();
    const result = await db.collection('testcases').findOneAndUpdate(
      { caseId: req.params.caseId },
      { $set: { edits: null } },
      { returnDocument: 'after', projection: PROJECTION },
    );
    if (!result) return res.status(404).json({ error: `No test case "${req.params.caseId}".` });
    res.json(result);
  } catch (err) { next(err); }
});

/* ---- adding a case ------------------------------------------------------- */

/**
 * Allocates the next id within a workstream and inserts the case.
 *
 * Ids run per workstream, so D1 continues at D1-13 while D3 continues at D3-15.
 * The number comes from max(seq)+1 rather than a count, so a deleted case
 * leaves a gap instead of handing its id to something else - the old id may
 * still be named in the update log and in saved snapshots. The unique index on
 * caseId is the backstop: if two people add to the same workstream at once, the
 * loser retries against the new maximum.
 *
 * A case added now was not part of the reviewed baseline, so it cannot honestly
 * carry a verdict from it. It defaults to NOT RUN - "cannot be judged without
 * executing the stack; no claim is made either way" - and carries addedAt so it
 * stays distinguishable from the original fifty.
 */
router.post('/testcases', async (req, res, next) => {
  try {
    const { actor, error } = await resolveActor(req.body?.memberKey);
    if (error) return res.status(400).json({ error });

    const workstream = String(req.body?.workstream || '').toUpperCase();
    if (!/^D[1-9][0-9]*$/.test(workstream)) {
      return res.status(400).json({ error: `Unknown workstream "${workstream}". Expected D1, D2, D3 or D4.` });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'A required test needs a title.' });
    const finding = String(req.body?.finding || '').trim();

    const verdict = req.body?.verdict ?? 'NOT RUN';
    const VERDICTS = ['PASS', 'FAIL', 'PARTIAL', 'NOT RUN'];
    if (!VERDICTS.includes(verdict)) {
      return res.status(400).json({ error: `Unknown verdict "${verdict}". Expected one of ${VERDICTS.join(', ')}.` });
    }

    const db = await getDb();
    const now = new Date().toISOString();

    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await db.collection('testcases')
        .find({ workstream, kind: 'case' }, { sort: { seq: -1 }, limit: 1, projection: { seq: 1 } })
        .next();
      const seq = (last?.seq ?? 0) + 1;
      const caseId = `${workstream}-${String(seq).padStart(2, '0')}`;

      const doc = {
        caseId,
        kind: 'case',
        workstream,
        seq,
        verdict,
        original: { title, finding },
        edits: null,
        tracking: null,
        history: [],
        addedAt: now,
        addedBy: actor,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      try {
        await db.collection('testcases').insertOne(doc);
        delete doc._id;
        return res.status(201).json(doc);
      } catch (err) {
        if (err?.code !== 11000) throw err;   // 11000 = duplicate key; someone won the race
      }
    }

    res.status(409).json({ error: 'Could not allocate an id; too many concurrent inserts. Try again.' });
  } catch (err) { next(err); }
});
