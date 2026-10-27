// Data layer. All SQL lives here; the rest of the app never builds a query.
// Uses Node's built-in SQLite (node:sqlite), so there is nothing to compile or install.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'carepoint.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8'));

// ------------------------------------------------------------------ helpers
const pad = (n) => String(n).padStart(2, '0');
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const one = (sql, ...p) => db.prepare(sql).get(...p) || null;
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

// Rows from node:sqlite have a null prototype; copy them into plain objects.
const plain = (r) => (r ? { ...r } : null);
const plainAll = (rows) => rows.map((r) => ({ ...r }));

// ------------------------------------------------------------------ seed
function seed() {
  if (one('SELECT COUNT(*) AS c FROM hospitals').c > 0) return;
  const hash = (pw) => bcrypt.hashSync(pw, 8);
  tx(() => {
    const hospitals = [
      ['Sunrise Multispecialty', 1.8, 4.6, ['Orthopedics', 'ENT', 'General medicine']],
      ['City Care Hospital', 2.6, 4.3, ['Orthopedics', 'General medicine']],
      ['Govt District Hospital', 3.9, 3.9, ['General medicine', 'Pediatrics']],
    ];
    const hid = {};
    for (const [name, km, rating, depts] of hospitals) {
      hid[name] = Number(run('INSERT INTO hospitals (name, distance_km, rating) VALUES (?,?,?)', name, km, rating).lastInsertRowid);
      for (const d of depts) {
        run('INSERT OR IGNORE INTO departments (name) VALUES (?)', d);
        const dep = one('SELECT department_id FROM departments WHERE name = ?', d);
        run('INSERT INTO hospital_departments (hospital_id, department_id) VALUES (?,?)', hid[name], dep.department_id);
      }
    }
    const doctors = [
      ['Sunrise Multispecialty', 'Dr. Sharma', 'Orthopedics', 'sharma', 8],
      ['Sunrise Multispecialty', 'Dr. Mehta', 'ENT', 'mehta', 6],
      ['Sunrise Multispecialty', 'Dr. Rao', 'General medicine', 'rao', 7],
      ['City Care Hospital', 'Dr. Verma', 'Orthopedics', 'verma', 10],
      ['Govt District Hospital', 'Dr. Bisht', 'General medicine', 'bisht', 7],
      ['Govt District Hospital', 'Dr. Joshi', 'Pediatrics', 'joshi', 9],
    ];
    for (const [h, name, dept, user, avg] of doctors) {
      const dep = one('SELECT department_id FROM departments WHERE name = ?', dept);
      run(
        `INSERT INTO doctors (hospital_id, department_id, name, username, password_hash, avg_consult_minutes)
         VALUES (?,?,?,?,?,?)`,
        hid[h], dep.department_id, name, user, hash(user + '123'), avg
      );
    }
    run('INSERT INTO admins (name, username, password_hash) VALUES (?,?,?)', 'Hospital Admin', 'admin', hash('admin123'));
  });
}
seed();

// Tokens from a previous day can never be served; close them so they do not
// block the "one live token per patient" rule.
function expireStaleTokens() {
  run(`UPDATE tokens SET status = 'cancelled'
        WHERE token_date < ? AND status IN ('waiting', 'in_progress')`, today());
}
expireStaleTokens();

// ------------------------------------------------------------------ hospitals
const DOCTOR_COLS = `d.doctor_id AS id, d.hospital_id, d.name, dep.name AS department,
                     d.status, d.avg_consult_minutes, h.name AS hospital_name`;
const DOCTOR_FROM = `FROM doctors d
                     JOIN departments dep ON dep.department_id = d.department_id
                     JOIN hospitals   h   ON h.hospital_id     = d.hospital_id`;

function getHospitals() {
  const rows = all(`
    SELECT h.hospital_id AS id, h.name, h.distance_km, h.rating,
           GROUP_CONCAT(dep.name, ',') AS departments
      FROM hospitals h
      JOIN hospital_departments hd ON hd.hospital_id = h.hospital_id
      JOIN departments dep         ON dep.department_id = hd.department_id
     GROUP BY h.hospital_id
     ORDER BY h.distance_km`);
  return rows.map((r) => ({ ...r, departments: r.departments.split(',') }));
}
const getHospital = (id) => plain(one('SELECT hospital_id AS id, name FROM hospitals WHERE hospital_id = ?', id));

// ------------------------------------------------------------------ doctors
const getDoctorsByHospital = (hid) =>
  plainAll(all(`SELECT ${DOCTOR_COLS} ${DOCTOR_FROM} WHERE d.hospital_id = ? ORDER BY dep.name, d.name`, hid));
const getDoctor = (id) => plain(one(`SELECT ${DOCTOR_COLS} ${DOCTOR_FROM} WHERE d.doctor_id = ?`, id));
const getDoctorAuth = (username) =>
  plain(one(`SELECT ${DOCTOR_COLS}, d.password_hash ${DOCTOR_FROM} WHERE d.username = ?`, username));
const getAllDoctors = () =>
  plainAll(all(`SELECT ${DOCTOR_COLS}, d.username ${DOCTOR_FROM} ORDER BY h.name, dep.name, d.name`));
const setDoctorStatus = (id, status) => run('UPDATE doctors SET status = ? WHERE doctor_id = ?', status, id);

function addDoctor({ hospital_id, name, department, username, password, avg_consult_minutes }) {
  return tx(() => {
    run('INSERT OR IGNORE INTO departments (name) VALUES (?)', department);
    const dep = one('SELECT department_id FROM departments WHERE name = ?', department);
    run('INSERT OR IGNORE INTO hospital_departments (hospital_id, department_id) VALUES (?,?)', hospital_id, dep.department_id);
    const r = run(
      `INSERT INTO doctors (hospital_id, department_id, name, username, password_hash, avg_consult_minutes)
       VALUES (?,?,?,?,?,?)`,
      hospital_id, dep.department_id, name, username, bcrypt.hashSync(password, 8), avg_consult_minutes
    );
    return getDoctor(Number(r.lastInsertRowid));
  });
}

const isUsernameTaken = (u) =>
  !!(one('SELECT 1 AS x FROM doctors WHERE username = ?', u) || one('SELECT 1 AS x FROM admins WHERE username = ?', u));
const getAdminAuth = (username) => plain(one('SELECT admin_id AS id, name, password_hash FROM admins WHERE username = ?', username));
const getAdmin = (id) => plain(one('SELECT admin_id AS id, name FROM admins WHERE admin_id = ?', id));

// ------------------------------------------------------------------ patients and OTP
const getPatient = (id) => plain(one('SELECT patient_id AS id, mobile, no_show_count, is_blocked FROM patients WHERE patient_id = ?', id));
function getOrCreatePatient(mobile) {
  let p = one('SELECT patient_id AS id, mobile, no_show_count, is_blocked FROM patients WHERE mobile = ?', mobile);
  if (!p) {
    run('INSERT INTO patients (mobile, created_at) VALUES (?, ?)', mobile, Date.now());
    p = one('SELECT patient_id AS id, mobile, no_show_count, is_blocked FROM patients WHERE mobile = ?', mobile);
  }
  return plain(p);
}
const setOtp = (mobile, code, expires) =>
  run(`INSERT INTO otps (mobile, code, expires_at, attempts) VALUES (?,?,?,0)
       ON CONFLICT(mobile) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`, mobile, code, expires);
const getOtp = (mobile) => plain(one('SELECT code, expires_at, attempts FROM otps WHERE mobile = ?', mobile));
const bumpOtpAttempts = (mobile) => run('UPDATE otps SET attempts = attempts + 1 WHERE mobile = ?', mobile);
const deleteOtp = (mobile) => run('DELETE FROM otps WHERE mobile = ?', mobile);

// ------------------------------------------------------------------ tokens
const TOKEN_SELECT = `
  SELECT t.token_id, t.token_no, t.token_date, t.patient_id, t.doctor_id, t.patient_name, t.age, t.gender,
         t.reason, t.visit_type, t.status, t.created_at,
         d.name AS doctor_name, d.status AS doctor_status, d.avg_consult_minutes,
         dep.name AS department, h.hospital_id, h.name AS hospital_name
    FROM tokens t
    JOIN doctors d       ON d.doctor_id = t.doctor_id
    JOIN departments dep ON dep.department_id = d.department_id
    JOIN hospitals h     ON h.hospital_id = d.hospital_id`;

const getToken = (id) => plain(one(`${TOKEN_SELECT} WHERE t.token_id = ?`, id));
const getActiveTokenForPatient = (pid) =>
  plain(one(`${TOKEN_SELECT} WHERE t.patient_id = ? AND t.status IN ('waiting','in_progress') ORDER BY t.token_id DESC`, pid));

function createToken({ patient_id, doctor_id, name, age, gender, reason, visit_type }) {
  const date = today();
  return tx(() => {
    // The next number is computed inside the same transaction as the insert, so two
    // patients booking at the same moment can never receive the same number.
    const r = run(
      `INSERT INTO tokens (token_no, token_date, patient_id, doctor_id, patient_name, age, gender, reason, visit_type, created_at)
       VALUES ((SELECT COALESCE(MAX(token_no), 0) + 1 FROM tokens WHERE doctor_id = ? AND token_date = ?),
               ?,?,?,?,?,?,?,?,?)`,
      doctor_id, date, date, patient_id, doctor_id, name, age, gender, reason || null, visit_type, Date.now()
    );
    return getToken(Number(r.lastInsertRowid));
  });
}

// Highest token number called so far today = "now serving".
const getServing = (doctorId, date = today()) =>
  one(`SELECT COALESCE(MAX(token_no), 0) AS n FROM tokens
        WHERE doctor_id = ? AND token_date = ? AND status IN ('in_progress','completed','no_show')`, doctorId, date).n;

const countAhead = (doctorId, date, tokenNo) =>
  one(`SELECT COUNT(*) AS n FROM tokens
        WHERE doctor_id = ? AND token_date = ? AND status = 'waiting' AND token_no < ?`, doctorId, date, tokenNo).n;

// Finish whoever is with the doctor, then call the next waiting token in order.
function callNext(doctorId, { noShow = false } = {}) {
  const date = today();
  return tx(() => {
    run(`UPDATE tokens SET status = ?
          WHERE doctor_id = ? AND token_date = ? AND status = 'in_progress'`,
        noShow ? 'no_show' : 'completed', doctorId, date);
    const next = one(`SELECT token_id FROM tokens
                       WHERE doctor_id = ? AND token_date = ? AND status = 'waiting'
                       ORDER BY token_no LIMIT 1`, doctorId, date);
    if (next) run(`UPDATE tokens SET status = 'in_progress' WHERE token_id = ?`, next.token_id);
    return { serving: getServing(doctorId, date), called: next ? getToken(next.token_id) : null };
  });
}

function cancelToken(tokenId, patientId) {
  return run(`UPDATE tokens SET status = 'cancelled'
               WHERE token_id = ? AND patient_id = ? AND status = 'waiting'`, tokenId, patientId).changes > 0;
}

const getCurrentPatient = (doctorId) =>
  plain(one(`${TOKEN_SELECT} WHERE t.doctor_id = ? AND t.token_date = ? AND t.status = 'in_progress'`, doctorId, today()));
const getQueue = (doctorId, limit = 15) =>
  plainAll(all(`${TOKEN_SELECT} WHERE t.doctor_id = ? AND t.token_date = ? AND t.status = 'waiting'
                ORDER BY t.token_no LIMIT ?`, doctorId, today(), limit));

function doctorTodayStats(doctorId) {
  return plain(one(
    `SELECT SUM(status = 'waiting')   AS waiting,
            SUM(status = 'completed') AS seen,
            SUM(status = 'no_show')   AS no_show,
            ROUND(AVG(CASE WHEN status = 'completed' AND called_at IS NOT NULL AND completed_at IS NOT NULL
                           THEN (completed_at - called_at) / 60000.0 END), 1) AS avg_consult_min
       FROM tokens WHERE doctor_id = ? AND token_date = ?`, doctorId, today()));
}

function addFeedback(tokenId, rating, comment) {
  run(`INSERT INTO feedback (token_id, rating, comment, created_at) VALUES (?,?,?,?)`, tokenId, rating, comment || null, Date.now());
}
const getFeedback = (tokenId) => plain(one('SELECT rating, comment FROM feedback WHERE token_id = ?', tokenId));

// ------------------------------------------------------------------ board and analytics
const getBoard = () => plainAll(all('SELECT * FROM v_doctor_board ORDER BY hospital_name, department, doctor_name'));

function adminOverview() {
  const d = today();
  return plain(one(
    `SELECT (SELECT COUNT(*) FROM hospitals) AS hospitals,
            (SELECT COUNT(*) FROM doctors)   AS doctors,
            (SELECT COUNT(*) FROM tokens WHERE token_date = ?) AS tokens_today,
            (SELECT COUNT(*) FROM tokens WHERE token_date = ? AND status = 'waiting') AS waiting_now,
            (SELECT COUNT(*) FROM tokens WHERE token_date = ? AND status = 'completed') AS completed_today,
            (SELECT ROUND(AVG(rating), 1) FROM feedback) AS avg_rating`, d, d, d));
}

function adminAnalytics() {
  const d = today();
  const perHospital = plainAll(all(
    `SELECT h.name AS hospital, COUNT(t.token_id) AS tokens,
            COALESCE(SUM(t.status = 'completed'), 0) AS completed
       FROM hospitals h
       LEFT JOIN doctors d ON d.hospital_id = h.hospital_id
       LEFT JOIN tokens t  ON t.doctor_id = d.doctor_id AND t.token_date = ?
      GROUP BY h.hospital_id ORDER BY tokens DESC, h.name`, d));
  const hourly = plainAll(all(
    `SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour, COUNT(*) AS tokens
       FROM tokens WHERE token_date = ? GROUP BY hour ORDER BY hour`, d));
  const doctors = plainAll(all(
    `SELECT d.name AS doctor, dep.name AS department, h.name AS hospital,
            COUNT(t.token_id) AS tokens,
            COALESCE(SUM(t.status = 'completed'), 0) AS completed,
            ROUND(AVG(CASE WHEN t.status = 'completed' AND t.called_at IS NOT NULL
                           THEN (t.completed_at - t.called_at) / 60000.0 END), 1) AS avg_consult_min,
            ROUND((SELECT AVG(f.rating) FROM feedback f JOIN tokens tt ON tt.token_id = f.token_id
                    WHERE tt.doctor_id = d.doctor_id), 1) AS avg_rating
       FROM doctors d
       JOIN departments dep ON dep.department_id = d.department_id
       JOIN hospitals h     ON h.hospital_id = d.hospital_id
       LEFT JOIN tokens t   ON t.doctor_id = d.doctor_id AND t.token_date = ?
      GROUP BY d.doctor_id ORDER BY tokens DESC, d.name`, d));
  return { perHospital, hourly, doctors };
}

const recentTokens = (limit = 8) =>
  plainAll(all(`${TOKEN_SELECT} ORDER BY t.token_id DESC LIMIT ?`, limit));

module.exports = {
  today, expireStaleTokens,
  getHospitals, getHospital,
  getDoctorsByHospital, getDoctor, getDoctorAuth, getAllDoctors, setDoctorStatus, addDoctor,
  isUsernameTaken, getAdminAuth, getAdmin,
  getPatient, getOrCreatePatient, setOtp, getOtp, bumpOtpAttempts, deleteOtp,
  getToken, getActiveTokenForPatient, createToken, getServing, countAhead, callNext, cancelToken,
  getCurrentPatient, getQueue, doctorTodayStats, addFeedback, getFeedback,
  getBoard, adminOverview, adminAnalytics, recentTokens,
};
