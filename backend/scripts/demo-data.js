// Optional: fills today with sample patients so the dashboards are not empty.
// Run:  npm run demo-data      (safe to run once; it refuses to run twice)
require('../db');                                   // creates the schema and seeds hospitals/doctors
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, '..', 'carepoint.db'));
db.exec('PRAGMA foreign_keys = ON;');

if (db.prepare("SELECT COUNT(*) AS c FROM patients WHERE mobile LIKE '90000%'").get().c > 0) {
  console.log('Demo data is already present. Run "npm run reset" first if you want to start over.');
  process.exit(0);
}

const names = ['Aarav Sharma', 'Diya Patel', 'Rohan Mehta', 'Ananya Singh', 'Kabir Verma', 'Ishita Joshi', 'Vihaan Rawat', 'Meera Nair',
  'Arjun Bisht', 'Saanvi Gupta', 'Aditya Negi', 'Kavya Rao', 'Reyansh Das', 'Priya Kapoor', 'Dev Malhotra', 'Navya Iyer', 'Yash Chauhan',
  'Tara Bhatt', 'Harsh Pandey', 'Riya Thakur', 'Neel Saxena', 'Pooja Kulkarni', 'Samar Khan', 'Isha Rana', 'Kunal Joshi', 'Mitali Sen',
  'Omkar Patil', 'Sneha Menon', 'Tanay Arora', 'Zoya Ali', 'Veer Chopra'];
const reasons = ['Knee pain', 'Fever and cough', 'Ear ache', 'Routine check-up', 'Back pain', 'Skin rash', 'Follow-up after surgery', 'Headache', 'Stomach pain', 'Sore throat', ''];
const plan = { 1: 8, 2: 5, 3: 6, 4: 4, 5: 5, 6: 3 };   // doctor_id -> tokens today
const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const at = (hour, minute) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute).getTime();

const insertPatient = db.prepare('INSERT INTO patients (mobile, created_at) VALUES (?, ?)');
const insertToken = db.prepare(`INSERT INTO tokens
  (token_no, token_date, patient_id, doctor_id, patient_name, age, gender, reason, visit_type, status, created_at, called_at, completed_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insertFeedback = db.prepare('INSERT INTO feedback (token_id, rating, comment, created_at) VALUES (?,?,?,?)');

let n = 0, seq = 0;
db.exec('BEGIN');
try {
for (const [doctorId, count] of Object.entries(plan)) {
  const done = Math.floor(count * 0.6);
  for (let i = 1; i <= count; i++) {
    const p = insertPatient.run('90000' + String(++seq).padStart(5, '0'), Date.now());
    const created = at(9 + Math.floor(i * 6 / count), (i * 11) % 60);
    let status = 'waiting', called = null, finished = null;
    if (i <= done) {
      status = (i === 2 && count > 4) ? 'no_show' : 'completed';
      called = created + 25 * 60000;
      finished = called + (6 + (i % 5) * 2) * 60000;
    }
    const t = insertToken.run(i, date, Number(p.lastInsertRowid), Number(doctorId), names[n % names.length], 18 + (n * 7) % 60,
      n % 3 === 0 ? 'Female' : n % 3 === 1 ? 'Male' : 'Other', reasons[n % reasons.length] || null,
      i % 4 === 0 ? 'Follow-up' : 'New patient', status, created, called, finished);
    if (status === 'completed' && i % 2 === 1) insertFeedback.run(Number(t.lastInsertRowid), 3 + ((i + n) % 3), null, finished);
    n++;
  }
}
db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); throw e; }
console.log(`Added ${n} sample tokens for today. Doctors now have patients waiting.`);
