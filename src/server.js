import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getDb, closeDb } from './db.js';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const app = express();

app.use(express.json({ limit: '1mb' }));

// Serves the existing static report unchanged.
app.use(express.static(root, { extensions: ['html'] }));

app.get('/api/health', async (_req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ ok: true, db: db.databaseName });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// Example collection: an append-only record of who opened the report and when.
// Replace or add collections here as the page's needs become clear.
app.post('/api/events', async (req, res) => {
  try {
    const db = await getDb();
    const doc = {
      type: String(req.body?.type || 'unknown'),
      detail: req.body?.detail ?? null,
      at: new Date(),
    };
    const { insertedId } = await db.collection('events').insertOne(doc);
    res.status(201).json({ id: insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events', async (_req, res) => {
  try {
    const db = await getDb();
    const events = await db
      .collection('events')
      .find({}, { sort: { at: -1 }, limit: 100 })
      .toArray();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`Report_adi API listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  });
}
