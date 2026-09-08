import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getDb, closeDb } from './db.js';
import { router as testcases } from './api/testcases.js';
import { router as team } from './api/team.js';
import { router as versions } from './api/versions.js';
import { router as stream, closeStream } from './api/stream.js';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const app = express();

app.use(express.json({ limit: '1mb' }));

// Serves the existing static report unchanged.
app.use(express.static(root, { extensions: ['html'] }));

app.get('/api/health', async (_req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const [team_, cases, vers] = await Promise.all([
      db.collection('team').countDocuments({ active: true }),
      db.collection('testcases').countDocuments(),
      db.collection('versions').countDocuments(),
    ]);
    res.json({ ok: true, db: db.databaseName, team: team_, testcases: cases, versions: vers });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use('/api', team);
app.use('/api', testcases);
app.use('/api', versions);
app.use('/api', stream);

app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

// One place to turn a thrown error into a response, so every route above can
// just pass it on rather than repeating the same try/catch shape.
app.use('/api', (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`Report_adi API listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await closeStream();
      await closeDb();
      process.exit(0);
    });
  });
}
