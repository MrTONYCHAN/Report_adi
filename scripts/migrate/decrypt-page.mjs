// Recovers the plaintext review document from the encrypted index.html in this
// repository, so the migration can run on a machine that does not have the
// private source checked out.
//
//   ACCESS_CODE=... node scripts/migrate/decrypt-page.mjs [-o out.html]
//   node scripts/migrate/decrypt-page.mjs --code <code>        (avoid: shell history)
//
// This mirrors exactly what the page does in the browser at index.html:733-763
// - PBKDF2-SHA256 over the access code with the page's salt and iteration
// count, then AES-256-GCM with the page's IV. Node puts the GCM auth tag in a
// separate call, where WebCrypto expects it appended to the ciphertext, so the
// trailing 16 bytes are split off here.
//
// The decrypted document is the input to extract-source.mjs. It is written
// outside the repository by default: it is the readable review, and the entire
// point of this repository is that it holds nothing readable.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

const CODE = process.env.ACCESS_CODE || flag('--code');
const PAGE = flag('-i') || path.join(process.cwd(), 'index.html');
const OUT = flag('-o') || path.join(path.dirname(process.cwd()), 'ADIGRAMS_GOLIVE_READINESS.decrypted.html');

if (!CODE) {
  console.error('No access code. Set ACCESS_CODE in the environment:');
  console.error('\n  PowerShell:  $env:ACCESS_CODE = "..."; node scripts/migrate/decrypt-page.mjs');
  console.error('  bash:        ACCESS_CODE=... node scripts/migrate/decrypt-page.mjs\n');
  console.error('Prefer the environment over --code so the code stays out of shell history.');
  process.exit(1);
}

if (!fs.existsSync(PAGE)) {
  console.error(`${PAGE} not found.`);
  process.exit(1);
}

const html = fs.readFileSync(PAGE, 'utf8');

const grab = (re, what) => {
  const m = html.match(re);
  if (!m) {
    console.error(`Could not find ${what} in ${PAGE}. Is this the published page?`);
    process.exit(1);
  }
  return m[1];
};

const payload = Buffer.from(grab(/var PAYLOAD = "([^"]+)"/, 'PAYLOAD'), 'base64');
const salt = Buffer.from(grab(/var SALT = "([^"]+)"/, 'SALT'), 'base64');
const iv = Buffer.from(grab(/var IV = "([^"]+)"/, 'IV'), 'base64');
const iterations = Number(grab(/var ITER = (\d+)/, 'ITER'));

console.log(`Reading ${PAGE}`);
console.log(`  PBKDF2-SHA256, ${iterations.toLocaleString()} iterations, ${salt.length}-byte salt`);
console.log(`  AES-256-GCM, ${iv.length}-byte IV, ${payload.length.toLocaleString()} bytes of ciphertext`);
process.stdout.write('  deriving key... ');

const started = Date.now();
const key = crypto.pbkdf2Sync(Buffer.from(CODE, 'utf8'), salt, iterations, 32, 'sha256');
console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`);

// WebCrypto appends the 16-byte GCM tag to the ciphertext; Node wants it apart.
const tag = payload.subarray(payload.length - 16);
const body = payload.subarray(0, payload.length - 16);

let plaintext;
try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
} catch {
  // GCM authentication failing is the only signal there is, and it means the
  // code was wrong - exactly as the page reports it.
  console.error('\nThat code is not correct.');
  process.exit(1);
}

const text = plaintext.toString('utf8');
fs.writeFileSync(OUT, text);

const rows = (text.match(/<td class="id">/g) || []).length;
console.log(`  decrypted   ${text.length.toLocaleString()} characters, ${rows} id cells`);
console.log(`\nWrote ${OUT}`);
console.log('This file is the readable review. Keep it out of this repository.');
