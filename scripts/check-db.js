// Standalone connection test: node --env-file=.env scripts/check-db.js
import process from 'node:process';
import { getDb, closeDb } from '../src/db.js';

try {
  const db = await getDb();
  const ping = await db.command({ ping: 1 });
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  console.log(`Connected to database "${db.databaseName}" (ping ok: ${ping.ok === 1})`);
  console.log(names.length ? `Collections: ${names.join(', ')}` : 'Collections: (none yet)');
} catch (err) {
  console.error('Connection failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
