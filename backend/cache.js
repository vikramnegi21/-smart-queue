// Cache-aside layer for "now serving". Redis is optional: if it is not running,
// every read falls through to the database and the app keeps working.
const Redis = require('ioredis');
const db = require('./db');

let redis = null;
let up = false;

try {
  redis = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true, retryStrategy: () => null, maxRetriesPerRequest: 1 });
  redis.on('error', () => { up = false; });
  redis.on('ready', async () => {
    up = true;
    // The database is the source of truth. Drop any cached numbers left over from an earlier run
    // so a fresh or restored database can never be shown with a stale "now serving".
    try {
      const stale = await redis.keys('serving:*');
      if (stale.length) await redis.del(stale);
    } catch (e) { /* ignore */ }
    console.log('[cache] Redis connected: "now serving" is cached');
  });
  redis.on('end', () => { up = false; });
  redis.connect().catch(() => console.log('[cache] Redis not running: reading from the database directly'));
} catch (e) {
  up = false;
}

const key = (doctorId) => `serving:${db.today()}:${doctorId}`;

async function getServing(doctorId) {
  if (up) {
    try {
      const hit = await redis.get(key(doctorId));
      if (hit !== null) return { value: parseInt(hit, 10), source: 'redis' };
    } catch (e) { /* fall through to the database */ }
  }
  const value = db.getServing(doctorId);
  if (up) {
    try { await redis.set(key(doctorId), value, 'EX', 86400); } catch (e) { /* ignore */ }
  }
  return { value, source: 'database' };
}

// The database is already updated by the caller; this refreshes the cached copy.
async function setServing(doctorId, value) {
  if (!up) return;
  try { await redis.set(key(doctorId), value, 'EX', 86400); } catch (e) { /* ignore */ }
}

module.exports = { getServing, setServing, isUp: () => up };
