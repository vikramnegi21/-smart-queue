const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const db = require('./db');
const cache = require('./cache');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DEMO_OTP = process.env.DEMO_OTP !== 'off'; // no SMS gateway: the code is returned to the page in demo mode

app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: 'carepoint.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------------ helpers
const attempts = new Map();
function rateLimited(key, max, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.resetAt < now) { a = { count: 0, resetAt: now + windowMs }; attempts.set(key, a); }
  a.count += 1;
  return a.count > max;
}
const fail = (res, code, message) => res.status(code).json({ error: message });
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function notify(doctorId) {
  io.to(`doctor:${doctorId}`).emit('queue:update', { doctor_id: doctorId });
  io.to('board').emit('board:update');
}

async function tokenView(t) {
  const { value: serving, source } = await cache.getServing(t.doctor_id);
  const ahead = t.status === 'waiting' ? db.countAhead(t.doctor_id, t.token_date, t.token_no) : 0;
  return {
    token_id: t.token_id, token_no: t.token_no, status: t.status,
    doctor_id: t.doctor_id, doctor_name: t.doctor_name, doctor_status: t.doctor_status,
    department: t.department, hospital_id: t.hospital_id, hospital_name: t.hospital_name,
    current_serving: serving, ahead,
    est_wait_minutes: ahead * t.avg_consult_minutes,
    served_from: source,
  };
}

// ------------------------------------------------------------------ one login box for everyone
app.post('/api/identify', (req, res) => {
  const id = str(req.body.identifier).toLowerCase();
  if (!id) return fail(res, 400, 'Enter your mobile number or user ID.');
  if (db.getDoctorAuth(id)) return res.json({ type: 'doctor' });
  if (db.getAdminAuth(id)) return res.json({ type: 'admin' });
  if (/^\d{10}$/.test(id)) return res.json({ type: 'patient' });
  return fail(res, 400, 'Enter a 10-digit mobile number or a valid user ID.');
});

// ------------------------------------------------------------------ patient auth (OTP)
app.post('/api/send-otp', (req, res) => {
  const mobile = str(req.body.mobile);
  if (!/^\d{10}$/.test(mobile)) return fail(res, 400, 'Enter a valid 10-digit mobile number.');
  if (rateLimited(`otp:${mobile}`, 5)) return fail(res, 429, 'Too many codes requested. Try again in a few minutes.');
  const code = String(Math.floor(1000 + Math.random() * 9000));
  db.setOtp(mobile, code, Date.now() + 5 * 60 * 1000);
  res.json({ ok: true, demo_otp: DEMO_OTP ? code : undefined });
});

app.post('/api/verify-otp', (req, res) => {
  const mobile = str(req.body.mobile);
  const code = str(req.body.otp);
  const row = db.getOtp(mobile);
  if (!row || row.expires_at < Date.now()) return fail(res, 400, 'This code has expired. Request a new one.');
  if (row.attempts >= 5) { db.deleteOtp(mobile); return fail(res, 429, 'Too many wrong attempts. Request a new code.'); }
  if (row.code !== code) { db.bumpOtpAttempts(mobile); return fail(res, 400, 'Incorrect code.'); }
  const patient = db.getOrCreatePatient(mobile);
  if (patient.is_blocked) return fail(res, 403, 'This number is blocked after repeated missed appointments. Please contact the hospital.');
  db.deleteOtp(mobile);
  req.session.patientId = patient.id;
  res.json({ ok: true });
});

function requirePatient(req, res, next) {
  if (!req.session.patientId) return fail(res, 401, 'Please sign in first.');
  next();
}

app.post('/api/patient/logout', (req, res) => {
  delete req.session.patientId;
  res.json({ ok: true });
});

// ------------------------------------------------------------------ catalogue
app.get('/api/hospitals', (req, res) => res.json(db.getHospitals()));
app.get('/api/hospitals/:id/doctors', (req, res) => res.json(db.getDoctorsByHospital(req.params.id)));

// ------------------------------------------------------------------ tokens (patient)
app.get('/api/patient/active-token', requirePatient, async (req, res) => {
  db.expireStaleTokens();
  const t = db.getActiveTokenForPatient(req.session.patientId);
  res.json({ token: t ? await tokenView(t) : null });
});

app.post('/api/tokens', requirePatient, async (req, res) => {
  db.expireStaleTokens();
  const pid = req.session.patientId;
  const patient = db.getPatient(pid);
  if (!patient || patient.is_blocked) return fail(res, 403, 'This number is blocked. Please contact the hospital.');

  const name = str(req.body.name);
  const age = Number.parseInt(req.body.age, 10);
  const gender = str(req.body.gender);
  const reason = str(req.body.reason).slice(0, 200);
  const visit_type = str(req.body.visit_type) || 'New patient';
  if (name.length < 2 || name.length > 60) return fail(res, 400, 'Enter the patient name (2 to 60 characters).');
  if (!Number.isInteger(age) || age < 0 || age > 120) return fail(res, 400, 'Enter a valid age.');
  if (!['Male', 'Female', 'Other'].includes(gender)) return fail(res, 400, 'Select a gender.');
  if (!['New patient', 'Follow-up'].includes(visit_type)) return fail(res, 400, 'Invalid visit type.');

  const doctor = db.getDoctor(req.body.doctor_id);
  if (!doctor) return fail(res, 404, 'Doctor not found.');
  if (doctor.status === 'leave') return fail(res, 409, `${doctor.name} is not available today.`);

  const live = db.getActiveTokenForPatient(pid);
  if (live) return fail(res, 409, `You already have an active token (#${live.token_no}). Finish or cancel it before booking another.`);

  try {
    const t = db.createToken({ patient_id: pid, doctor_id: doctor.id, name, age, gender, reason, visit_type });
    notify(doctor.id);
    res.json(await tokenView(t));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return fail(res, 409, 'You already have an active token.');
    throw e;
  }
});

async function ownToken(req, res) {
  const t = db.getToken(req.params.id);
  if (!t || t.patient_id !== req.session.patientId) { fail(res, 404, 'Token not found.'); return null; }
  return t;
}

app.get('/api/tokens/:id/status', requirePatient, async (req, res) => {
  const t = await ownToken(req, res);
  if (t) res.json(await tokenView(t));
});

app.post('/api/tokens/:id/cancel', requirePatient, async (req, res) => {
  const t = await ownToken(req, res);
  if (!t) return;
  if (!db.cancelToken(t.token_id, t.patient_id)) return fail(res, 409, 'Only a waiting token can be cancelled.');
  notify(t.doctor_id);
  res.json({ ok: true });
});

app.post('/api/tokens/:id/feedback', requirePatient, async (req, res) => {
  const t = await ownToken(req, res);
  if (!t) return;
  if (t.status !== 'completed') return fail(res, 409, 'Feedback is available after the consultation.');
  const rating = Number.parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) return fail(res, 400, 'Choose a rating from 1 to 5.');
  try {
    db.addFeedback(t.token_id, rating, str(req.body.comment).slice(0, 200));
  } catch (e) {
    return fail(res, 409, 'Feedback already submitted.');
  }
  res.json({ ok: true });
});

// ------------------------------------------------------------------ public board
app.get('/api/board', async (req, res) => {
  const rows = db.getBoard();
  const out = await Promise.all(rows.map(async (r) => ({ ...r, serving: (await cache.getServing(r.doctor_id)).value })));
  res.json(out);
});

// ------------------------------------------------------------------ doctor
app.post('/api/doctor/login', (req, res) => {
  const username = str(req.body.username).toLowerCase();
  if (rateLimited(`login:${username}:${req.ip}`, 8)) return fail(res, 429, 'Too many attempts. Try again later.');
  const d = db.getDoctorAuth(username);
  if (!d || !bcrypt.compareSync(String(req.body.password || ''), d.password_hash)) return fail(res, 401, 'Incorrect user ID or password.');
  req.session.doctorId = d.id;
  res.json({ ok: true });
});

app.post('/api/doctor/logout', (req, res) => {
  delete req.session.doctorId;
  res.json({ ok: true });
});

function requireDoctor(req, res, next) {
  if (!req.session.doctorId) return fail(res, 401, 'Please sign in first.');
  req.doctorId = req.session.doctorId;
  next();
}

app.get('/api/doctor/me', requireDoctor, (req, res) => {
  const d = db.getDoctor(req.doctorId);
  if (!d) return fail(res, 401, 'Please sign in first.');
  res.json({ id: d.id, name: d.name, department: d.department, hospital_name: d.hospital_name, status: d.status });
});

app.get('/api/doctor/queue-summary', requireDoctor, async (req, res) => {
  const id = req.doctorId;
  const d = db.getDoctor(id);
  const cur = db.getCurrentPatient(id);
  const stats = db.doctorTodayStats(id);
  const view = (t) => ({
    token_no: t.token_no, name: t.patient_name, age: t.age, gender: t.gender,
    reason: t.reason || '', visit_type: t.visit_type,
    waiting_minutes: Math.max(0, Math.round((Date.now() - t.created_at) / 60000)),
  });
  res.json({
    doctor: { id: d.id, name: d.name, department: d.department, hospital_name: d.hospital_name, status: d.status },
    current_serving: (await cache.getServing(id)).value,
    current_patient: cur ? view(cur) : null,
    queue: db.getQueue(id).map(view),
    stats: { waiting: stats.waiting || 0, seen: stats.seen || 0, no_show: stats.no_show || 0, avg_consult_min: stats.avg_consult_min },
  });
});

app.post('/api/doctor/next', requireDoctor, async (req, res) => {
  const r = db.callNext(req.doctorId);
  await cache.setServing(req.doctorId, r.serving);
  notify(req.doctorId);
  res.json({ ok: true, serving: r.serving, called: r.called ? r.called.token_no : null });
});

app.post('/api/doctor/no-show', requireDoctor, async (req, res) => {
  if (!db.getCurrentPatient(req.doctorId)) return fail(res, 409, 'There is no patient with you right now.');
  const r = db.callNext(req.doctorId, { noShow: true });
  await cache.setServing(req.doctorId, r.serving);
  notify(req.doctorId);
  res.json({ ok: true, serving: r.serving, called: r.called ? r.called.token_no : null });
});

app.post('/api/doctor/status', requireDoctor, (req, res) => {
  const status = str(req.body.status);
  if (!['available', 'busy', 'leave'].includes(status)) return fail(res, 400, 'Invalid status.');
  db.setDoctorStatus(req.doctorId, status);
  notify(req.doctorId);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ hospital admin
app.post('/api/hospitaladmin/login', (req, res) => {
  const username = str(req.body.username).toLowerCase();
  if (rateLimited(`login:${username}:${req.ip}`, 8)) return fail(res, 429, 'Too many attempts. Try again later.');
  const a = db.getAdminAuth(username);
  if (!a || !bcrypt.compareSync(String(req.body.password || ''), a.password_hash)) return fail(res, 401, 'Incorrect user ID or password.');
  req.session.adminId = a.id;
  res.json({ ok: true });
});

app.post('/api/hospitaladmin/logout', (req, res) => {
  delete req.session.adminId;
  res.json({ ok: true });
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return fail(res, 401, 'Please sign in first.');
  next();
}

app.get('/api/hospitaladmin/me', requireAdmin, (req, res) => {
  const a = db.getAdmin(req.session.adminId);
  if (!a) return fail(res, 401, 'Please sign in first.');
  res.json(a);
});

app.get('/api/hospitaladmin/dashboard', requireAdmin, (req, res) => {
  res.json({
    overview: db.adminOverview(),
    analytics: db.adminAnalytics(),
    recent: db.recentTokens(8).map((t) => ({
      token_no: t.token_no, patient: t.patient_name, status: t.status,
      hospital: t.hospital_name, doctor: t.doctor_name, department: t.department, created_at: t.created_at,
    })),
  });
});

app.get('/api/hospitaladmin/doctors', requireAdmin, (req, res) => res.json(db.getAllDoctors()));

app.post('/api/hospitaladmin/doctors', requireAdmin, (req, res) => {
  const hospital_id = Number.parseInt(req.body.hospital_id, 10);
  const name = str(req.body.name);
  const department = str(req.body.department);
  const username = str(req.body.username).toLowerCase();
  const password = String(req.body.password || '');
  const avg = Number.parseInt(req.body.avg_consult_minutes, 10) || 8;
  if (!db.getHospital(hospital_id)) return fail(res, 400, 'Select a hospital.');
  if (name.length < 2 || name.length > 60) return fail(res, 400, 'Enter the doctor name.');
  if (department.length < 2 || department.length > 40) return fail(res, 400, 'Enter a department.');
  if (!/^[a-z0-9_.-]{3,20}$/.test(username)) return fail(res, 400, 'User ID must be 3 to 20 characters: letters, numbers, dot, dash or underscore.');
  if (password.length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
  if (avg < 1 || avg > 60) return fail(res, 400, 'Average consultation time must be between 1 and 60 minutes.');
  if (db.isUsernameTaken(username)) return fail(res, 409, 'That user ID is already taken.');
  const d = db.addDoctor({ hospital_id, name, department, username, password, avg_consult_minutes: avg });
  res.json({ ok: true, doctor: d });
});

// ------------------------------------------------------------------ realtime
io.on('connection', (socket) => {
  socket.on('subscribe', (target) => {
    if (target === 'board') socket.join('board');
    else if (Number.isInteger(Number(target))) socket.join(`doctor:${Number(target)}`);
  });
});

// ------------------------------------------------------------------ fallbacks
app.use('/api', (req, res) => fail(res, 404, 'Not found.'));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CarePoint running on http://localhost:${PORT}`));
