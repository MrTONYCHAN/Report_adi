import express from 'express';
import { getDb } from '../db.js';

export const router = express.Router();

const PROJECTION = { _id: 0, memberKey: 1, slot: 1, area: 1, name: 1, order: 1, active: 1 };

/**
 * The roster.
 *
 * `acting` - which row the reader is currently acting as - is deliberately NOT
 * stored here. It is per-reader state: if it were shared, one person clicking
 * "Act as" would silently re-identify everyone else mid-session. It stays in
 * each browser's localStorage.
 */
router.get('/team', async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.collection('team')
      .find({ active: true }, { sort: { order: 1 }, projection: PROJECTION })
      .toArray();
    res.json(rows);
  } catch (err) { next(err); }
});

// Typing over a name to correct it, or relabelling a slot.
router.patch('/team/:memberKey', async (req, res, next) => {
  try {
    const patch = {};
    for (const field of ['name', 'slot', 'area']) {
      if (typeof req.body?.[field] === 'string') patch[field] = req.body[field].trim();
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Nothing to change: send a name, slot or area.' });
    }

    const db = await getDb();
    const result = await db.collection('team').findOneAndUpdate(
      { memberKey: req.params.memberKey },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: 'after', projection: PROJECTION },
    );
    if (!result) return res.status(404).json({ error: `No roster member "${req.params.memberKey}".` });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * "+ Add developer".
 *
 * The slot is numbered from the highest "Developer N" already on the roster
 * rather than from its length, so removing Developer 3 and adding one produces
 * Developer 5 rather than a second Developer 4. Two rows sharing a slot label
 * matters: the page's own update tally counts log entries by slot string, so
 * duplicates would claim each other's updates.
 */
router.post('/team', async (req, res, next) => {
  try {
    const db = await getDb();
    const existing = await db.collection('team').find({}, { projection: { slot: 1, order: 1 } }).toArray();

    const highest = existing.reduce((max, m) => {
      const n = Number(/^Developer (\d+)$/.exec(m.slot || '')?.[1]);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    const member = {
      memberKey: `d${Date.now().toString(36)}`,
      slot: String(req.body?.slot || `Developer ${highest + 1}`).trim(),
      area: String(req.body?.area || '—').trim(),
      name: String(req.body?.name || '').trim(),
      order: existing.reduce((max, m) => Math.max(max, m.order ?? 0), -1) + 1,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('team').insertOne(member);
    delete member._id;
    res.status(201).json(member);
  } catch (err) { next(err); }
});

/**
 * Removing a row.
 *
 * Soft delete, always. Log entries and saved snapshots reference memberKey, and
 * the page already warns that removing a row keeps its logged updates - hard
 * deleting would orphan that history. The last active member cannot be removed,
 * or nothing could be attributed to anyone.
 */
router.delete('/team/:memberKey', async (req, res, next) => {
  try {
    const db = await getDb();
    const active = await db.collection('team').countDocuments({ active: true });
    if (active <= 1) {
      return res.status(409).json({ error: 'At least one developer is needed.' });
    }

    const result = await db.collection('team').findOneAndUpdate(
      { memberKey: req.params.memberKey, active: true },
      { $set: { active: false, updatedAt: new Date() } },
      { returnDocument: 'after', projection: PROJECTION },
    );
    if (!result) return res.status(404).json({ error: `No active roster member "${req.params.memberKey}".` });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * "Reset my updates".
 *
 * In the page this cleared the whole of localStorage, which was safe only
 * because that storage held one reader's work. Against a shared database the
 * same gesture would wipe everyone's, so it is scoped to one member: their
 * tracking is cleared and their log entries removed, and everyone else's stay
 * exactly as they are.
 */
router.post('/team/:memberKey/reset', async (req, res, next) => {
  try {
    const { memberKey } = req.params;
    const db = await getDb();

    const cleared = await db.collection('testcases').updateMany(
      { 'tracking.byMemberKey': memberKey },
      { $set: { tracking: null } },
    );
    const pulled = await db.collection('testcases').updateMany(
      { 'history.byMemberKey': memberKey },
      { $pull: { history: { byMemberKey: memberKey } } },
    );
    const edits = await db.collection('testcases').updateMany(
      { 'edits.byMemberKey': memberKey },
      { $set: { edits: null } },
    );

    res.json({
      memberKey,
      trackingCleared: cleared.modifiedCount,
      editsCleared: edits.modifiedCount,
      casesWithLogEntriesRemoved: pulled.modifiedCount,
    });
  } catch (err) { next(err); }
});
