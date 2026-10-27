// End-to-end API test. Starts the server on a temporary database and walks through
// every role. Run with: npm test
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 3111;
const BASE = `http://localhost:${PORT}`;
const DB_FILE = path.join(os.tmpdir(), `carepoint-test-${Date.now()}.db`);

let passed = 0, failed = 0;
function check(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.log(`  FAIL ${label} ${extra}`); }
}

class Client {
  constructor() { this.cookie = ''; }
  async call(method, url, body) {
    const res = await fetch(BASE + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch (e) { /* not json */ }
    return { status: res.status, data };
  }
  get(u) { return this.call('GET', u); }
  post(u, b) { return this.call('POST', u, b || {}); }
}

async function patientLogin(mobile) {
  const c = new Client();
  const o = await c.post('/api/send-otp', { mobile });
  const v = await c.post('/api/verify-otp', { mobile, otp: o.data.demo_otp });
  return { c, ok: v.status === 200, v };
}
const form = (doctor_id, name, extra = {}) => ({ doctor_id, name, age: 30, gender: 'Male', reason: 'cough', visit_type: 'New patient', ...extra });

async function main() {
  const server = spawn('node', ['--no-warnings', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, DB_FILE }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((r) => setTimeout(r, 1500));

  try {
    console.log('identify');
    const anon = new Client();
    check('mobile number is a patient', (await anon.post('/api/identify', { identifier: '9876543210' })).data.type === 'patient');
    check('sharma is a doctor', (await anon.post('/api/identify', { identifier: 'sharma' })).data.type === 'doctor');
    check('admin is an admin', (await anon.post('/api/identify', { identifier: 'admin' })).data.type === 'admin');
    check('garbage is rejected', (await anon.post('/api/identify', { identifier: 'xx' })).status === 400);

    console.log('patient sign in');
    const bad = new Client();
    const o = await bad.post('/api/send-otp', { mobile: '9000000000' });
    const wrong = o.data.demo_otp === '0000' ? '1111' : '0000';
    check('wrong otp rejected', (await bad.post('/api/verify-otp', { mobile: '9000000000', otp: wrong })).status === 400);
    check('booking without sign in is 401', (await anon.post('/api/tokens', form(1, 'X'))).status === 401);

    console.log('booking');
    const p1 = await patientLogin('9000000001');
    const p2 = await patientLogin('9000000002');
    const p3 = await patientLogin('9000000003');
    check('patients signed in', p1.ok && p2.ok && p3.ok);
    check('invalid age rejected', (await p1.c.post('/api/tokens', form(1, 'Asha', { age: 200 }))).status === 400);
    check('invalid gender rejected', (await p1.c.post('/api/tokens', form(1, 'Asha', { gender: 'x' }))).status === 400);
    const t1 = (await p1.c.post('/api/tokens', form(1, 'Asha Rawat', { reason: 'knee pain' }))).data;
    const t2 = (await p2.c.post('/api/tokens', form(1, 'Bharat Singh'))).data;
    const t3 = (await p3.c.post('/api/tokens', form(1, 'Chitra Joshi'))).data;
    check('token numbers are 1,2,3', t1.token_no === 1 && t2.token_no === 2 && t3.token_no === 3, JSON.stringify([t1.token_no, t2.token_no, t3.token_no]));
    check('people ahead are 0,1,2', t1.ahead === 0 && t2.ahead === 1 && t3.ahead === 2);
    check('estimated wait uses doctor average (8 min x 2)', t3.est_wait_minutes === 16, String(t3.est_wait_minutes));
    check('second live token is blocked', (await p1.c.post('/api/tokens', form(2, 'Asha'))).status === 409);
    check('active token is restored after reload', (await p1.c.get('/api/patient/active-token')).data.token.token_no === 1);
    check('another patient cannot read my token', (await p2.c.get(`/api/tokens/${t1.token_id}/status`)).status === 404);

    console.log('doctor');
    const d = new Client();
    check('wrong password rejected', (await d.post('/api/doctor/login', { username: 'sharma', password: 'nope' })).status === 401);
    check('patient session cannot use doctor routes', (await p1.c.get('/api/doctor/queue-summary')).status === 401);
    check('doctor signs in', (await d.post('/api/doctor/login', { username: 'sharma', password: 'sharma123' })).status === 200);
    let sum = (await d.get('/api/doctor/queue-summary')).data;
    check('queue shows 3 waiting with names and reasons', sum.queue.length === 3 && sum.queue[0].name === 'Asha Rawat' && sum.queue[0].reason === 'knee pain');
    check('no current patient yet', sum.current_patient === null && sum.stats.waiting === 3);
    let r = (await d.post('/api/doctor/next')).data;
    check('next calls token 1', r.called === 1 && r.serving === 1);
    sum = (await d.get('/api/doctor/queue-summary')).data;
    check('token 1 is with the doctor', sum.current_patient.token_no === 1 && sum.queue.length === 2);
    check('patient 1 sees "in progress"', (await p1.c.get(`/api/tokens/${t1.token_id}/status`)).data.status === 'in_progress');
    check('patient 3 now has 1 ahead', (await p3.c.get(`/api/tokens/${t3.token_id}/status`)).data.ahead === 1);
    r = (await d.post('/api/doctor/next')).data;
    check('next finishes token 1 and calls 2', r.called === 2);
    const s1 = (await p1.c.get(`/api/tokens/${t1.token_id}/status`)).data;
    check('patient 1 is completed', s1.status === 'completed');

    console.log('feedback and cancel');
    check('rating needs a completed token', (await p2.c.post(`/api/tokens/${t2.token_id}/feedback`, { rating: 5 })).status === 409);
    check('rating saved', (await p1.c.post(`/api/tokens/${t1.token_id}/feedback`, { rating: 5, comment: 'quick' })).status === 200);
    check('duplicate rating blocked', (await p1.c.post(`/api/tokens/${t1.token_id}/feedback`, { rating: 4 })).status === 409);
    check('rating outside 1..5 rejected', (await p1.c.post(`/api/tokens/${t1.token_id}/feedback`, { rating: 9 })).status === 400);
    check('waiting token can be cancelled', (await p3.c.post(`/api/tokens/${t3.token_id}/cancel`)).status === 200);
    check('in-progress token cannot be cancelled', (await p2.c.post(`/api/tokens/${t2.token_id}/cancel`)).status === 409);

    console.log('queue edge cases');
    await d.post('/api/doctor/next');
    check('next on an empty queue keeps the serving number', (await d.post('/api/doctor/next')).data.serving === 2);
    const late = await patientLogin('9000000004');
    const t4 = (await late.c.post('/api/tokens', form(1, 'Late Booker'))).data;
    check('a late booking after an empty queue is still served', t4.token_no === 4 && t4.ahead === 0);
    check('next reaches the late booking', (await d.post('/api/doctor/next')).data.called === 4);

    console.log('no-show and blocking (trigger)');
    const flaky = await patientLogin('9000000005');
    for (let i = 0; i < 3; i++) {
      await flaky.c.post('/api/tokens', form(1, 'Flaky Patient'));
      await d.post('/api/doctor/next'); // finishes the previous patient and calls this one
      check(`missed appointment ${i + 1} recorded`, (await d.post('/api/doctor/no-show')).status === 200);
    }
    const again = new Client();
    const o2 = await again.post('/api/send-otp', { mobile: '9000000005' });
    check('patient is blocked after 3 no-shows', (await again.post('/api/verify-otp', { mobile: '9000000005', otp: o2.data.demo_otp })).status === 403);

    console.log('doctor status');
    check('invalid status rejected', (await d.post('/api/doctor/status', { status: 'asleep' })).status === 400);
    check('status updated', (await d.post('/api/doctor/status', { status: 'leave' })).status === 200);
    const p6 = await patientLogin('9000000006');
    check('cannot book a doctor on leave', (await p6.c.post('/api/tokens', form(1, 'Someone'))).status === 409);
    await d.post('/api/doctor/status', { status: 'available' });

    console.log('public board');
    const board = (await anon.get('/api/board')).data;
    check('board lists every doctor', board.length === 6 && board.find((b) => b.doctor_name === 'Dr. Sharma').serving >= 4);

    console.log('hospital admin');
    const a = new Client();
    check('doctor session cannot open admin routes', (await d.get('/api/hospitaladmin/dashboard')).status === 401);
    check('admin wrong password rejected', (await a.post('/api/hospitaladmin/login', { username: 'admin', password: 'x' })).status === 401);
    check('admin signs in', (await a.post('/api/hospitaladmin/login', { username: 'admin', password: 'admin123' })).status === 200);
    const dash = (await a.get('/api/hospitaladmin/dashboard')).data;
    check('overview counts', dash.overview.hospitals === 3 && dash.overview.doctors === 6 && dash.overview.tokens_today >= 7);
    check('analytics grouped per hospital', dash.analytics.perHospital.length === 3 && dash.analytics.doctors.length === 6);
    check('average rating computed from feedback', dash.overview.avg_rating === 5);
    const newDoc = { hospital_id: 2, name: 'Dr. Kapoor', department: 'Cardiology', username: 'kapoor', password: 'kapoor123', avg_consult_minutes: 12 };
    check('short password rejected', (await a.post('/api/hospitaladmin/doctors', { ...newDoc, password: '123' })).status === 400);
    check('admin creates a doctor (new department too)', (await a.post('/api/hospitaladmin/doctors', newDoc)).status === 200);
    check('duplicate user id rejected', (await a.post('/api/hospitaladmin/doctors', newDoc)).status === 409);
    const hosp2 = (await anon.get('/api/hospitals')).data.find((h) => h.id === 2);
    check('hospital now offers Cardiology', hosp2.departments.includes('Cardiology'));
    const k = new Client();
    check('new doctor can sign in', (await k.post('/api/doctor/login', { username: 'kapoor', password: 'kapoor123' })).status === 200);
    check('new doctor has an empty queue', (await k.get('/api/doctor/queue-summary')).data.queue.length === 0);

    console.log('html escaping data');
    const xss = await patientLogin('9000000007');
    await xss.c.post('/api/tokens', form(5, '<img src=x onerror=alert(1)>'));
    const k2 = new Client();
    await k2.post('/api/doctor/login', { username: 'bisht', password: 'bisht123' });
    check('server stores the raw text (pages escape it on output)', (await k2.get('/api/doctor/queue-summary')).data.queue[0].name.startsWith('<img'));
  } finally {
    server.kill();
    for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) { try { fs.unlinkSync(f); } catch (e) { /* ignore */ } }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
