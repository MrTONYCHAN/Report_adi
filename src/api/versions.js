import express from 'express';
import { getDb } from '../db.js';
import { resolveActor } from './actor.js';

export const router = express.Router();

const LIST_PROJECTION = { _id: 0, seq: 1, v: 1, at: 1, byName: 1, bySlot: 1, note: 1 };

// The list behind the View dropdown. Snapshots are excluded: they are the bulk
// of each document and the dropdown only needs the label and who saved it.
router.get('/versions', async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.collection('versions')
      .find({}, { sort: { seq: 1 }, projection: LIST_PROJECTION })
      .toArray();
    res.json(rows);
  } catch (err) { next(err); }
});

// One version, with its snapshot, for putting an earlier state on screen.
router.get('/versions/:seq', async (req, res, next) => {
  try {
    const db = await getDb();
    const doc = await db.collection('versions')
      .findOne({ seq: Number(req.params.seq) }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ error: `No version ${req.params.seq}.` });
    res.json(doc);
  } catch (err) { next(err); }
});

/**
 * "Save version" - a full snapshot of the tracked state plus an optional remark.
 *
 * The snapshot is taken here, from the database, rather than accepted from the
 * client: the point of a version is what the shared state actually was at that
 * moment, not what one browser happened to be showing.
 *
 * Snapshots are stored whole rather than as patches, deliberately. An earlier
 * version can then always be rendered even if the roster or the numbering
 * changes later - which is exactly what happened when three browsers each
 * numbered their own v1.0.
 *
 * The number is allocated against a unique index and retried on collision.
 * The old page computed "v1." + versions.length in the browser, so two people
 * saving at the end of a session would both compute the same label and one
 * would quietly overwrite the other.
 */
router.post('/versions', async (req, res, next) => {
  try {
    const { actor, error } = await resolveActor(req.body?.memberKey);
    if (error) return res.status(400).json({ error });

    const note = String(req.body?.note || '').trim();
    const db = await getDb();

    const [cases, team] = await Promise.all([
      db.collection('testcases')
        .find({}, { projection: { _id: 0, caseId: 1, tracking: 1, edits: 1 } })
        .toArray(),
      db.collection('team')
        .find({}, { sort: { order: 1 }, projection: { _id: 0, memberKey: 1, slot: 1, area: 1, name: 1, active: 1 } })
        .toArray(),
    ]);

    const snap = {
      tracking: Object.fromEntries(cases.filter((c) => c.tracking).map((c) => [c.caseId, c.tracking])),
      edits: Object.fromEntries(cases.filter((c) => c.edits).map((c) => [c.caseId, c.edits])),
      team,
    };

    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await db.collection('versions')
        .find({}, { sort: { seq: -1 }, limit: 1, projection: { seq: 1 } })
        .next();
      const seq = (last?.seq ?? -1) + 1;

      const doc = {
        seq,
        v: `v1.${seq}`,
        at: new Date(),
        ...actor,
        note,
        snap,
      };

      try {
        await db.collection('versions').insertOne(doc);
        delete doc._id;
        return res.status(201).json(doc);
      } catch (err) {
        if (err?.code !== 11000) throw err;   // someone else claimed this number
      }
    }

    res.status(409).json({ error: 'Could not allocate a version number; too many concurrent saves. Try again.' });
  } catch (err) { next(err); }
});
