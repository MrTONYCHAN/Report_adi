import express from 'express';
import { getDb } from '../db.js';

export const router = express.Router();

/**
 * Live updates.
 *
 * This is the point of the migration. Until now every reader's work was
 * invisible to every other reader, because it never left the browser it was
 * typed in. One change stream over the three collections is fanned out to every
 * open page here, so a status click on one screen lands on all of them.
 *
 * Because the update log lives inside the testcases documents rather than in a
 * collection of its own, this single stream drives the rows, the progress line
 * and section 03 together - there is no second subscription to keep in step.
 *
 * One stream is shared by every client rather than one per connection: change
 * streams hold a cursor on the server, and a page left open in a dozen tabs
 * should not open a dozen of them.
 */

const clients = new Set();
let watching = null;      // the shared ChangeStream, once started
let available = true;     // false once we know change streams cannot be used

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    // A client that has gone away without closing cleanly will throw here;
    // dropping it is the whole of the cleanup needed.
    try { res.write(frame); } catch { clients.delete(res); }
  }
}

async function startWatching() {
  if (watching || !available) return;

  const db = await getDb();
  const stream = db.watch(
    [{ $match: { 'ns.coll': { $in: ['testcases', 'team', 'versions'] } } }],
    // The page re-renders a row from the document, so send the whole thing
    // rather than the diff; at this size that is cheaper than reconciling.
    { fullDocument: 'updateLookup' },
  );
  watching = stream;

  stream.on('change', (change) => {
    const doc = change.fullDocument;
    if (doc) delete doc._id;
    broadcast('change', {
      collection: change.ns?.coll,
      operation: change.operationType,
      document: doc ?? null,
      at: new Date().toISOString(),
    });
  });

  stream.on('error', (err) => {
    // A dropped stream must not take the API down with it. Clients are told to
    // fall back to polling, and the next connection retries.
    console.error('Change stream error, live updates paused:', err.message);
    broadcast('degraded', { reason: err.message });
    watching = null;
    stream.close().catch(() => {});
  });
}

router.get('/stream', async (req, res, next) => {
  try {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Proxies that buffer will hold the whole stream and deliver nothing.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    clients.add(res);
    res.write(`event: hello\ndata: ${JSON.stringify({ live: available })}\n\n`);

    // Comment frames keep idle proxies from closing the connection.
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* dropped on next broadcast */ }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });

    try {
      await startWatching();
    } catch (err) {
      // Change streams need a replica set. Atlas is one, but a standalone
      // mongod is not, and that is worth saying plainly rather than looking
      // like the page is simply not updating.
      available = false;
      console.error('Live updates unavailable, clients should poll:', err.message);
      res.write(`event: degraded\ndata: ${JSON.stringify({ reason: err.message })}\n\n`);
    }
  } catch (err) { next(err); }
});

export async function closeStream() {
  for (const res of clients) {
    try { res.end(); } catch { /* already gone */ }
  }
  clients.clear();
  if (watching) {
    await watching.close().catch(() => {});
    watching = null;
  }
}
