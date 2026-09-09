import process from 'node:process';
import dns from 'node:dns';
import { MongoClient, ServerApiVersion } from 'mongodb';

// mongodb+srv:// needs an SRV lookup, and Node resolves that with its own
// resolver rather than the OS stub. On this machine Node inherits only
// 127.0.0.1, where nothing is listening, so the lookup fails with ECONNREFUSED
// even though Windows resolves the record fine. Point it at real resolvers when
// that is all we have; MONGODB_DNS_SERVERS overrides the default pair.
const configured = (process.env.MONGODB_DNS_SERVERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const onlyLoopback = dns
  .getServers()
  .every((s) => s.startsWith('127.') || s === '::1');

// Never on a managed platform. Vercel's resolver is the one that can reach the
// cluster, and replacing it with a public pair breaks name resolution instead
// of fixing it. This workaround exists for one developer machine.
const managed = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
if (managed) {
  // leave Node's resolvers alone
} else if (configured.length) {
  dns.setServers(configured);
} else if (onlyLoopback) {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
}

// One client per process. The driver pools connections internally, so this is
// created once and shared by every request rather than reconnecting per call.
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecateErrors: true },
});

let connected = null;

export async function getDb() {
  if (!connected) {
    connected = client.connect();
  }
  await connected;
  return client.db(process.env.MONGODB_DB || 'report_adi');
}

export async function closeDb() {
  if (connected) {
    await connected;
    await client.close();
    connected = null;
  }
}
