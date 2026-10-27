// Deletes the database so the next start begins from a clean seed. Stop the server first.
const fs = require('fs');
const path = require('path');
const base = process.env.DB_FILE || path.join(__dirname, '..', 'carepoint.db');
let removed = 0;
for (const f of [base, base + '-wal', base + '-shm']) {
  try { fs.unlinkSync(f); removed++; } catch (e) { /* not there */ }
}
console.log(removed ? 'Database deleted. It is recreated on the next start.' : 'No database file found.');
