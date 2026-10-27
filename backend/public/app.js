// Patient flow: hospital -> department -> doctor -> details -> live token.
(function () {
  var app = document.getElementById('app');
  var signout = document.getElementById('signout');
  var socket = typeof io === 'function' ? io() : null;

  var state = {
    hospitals: null, hospital: null, department: null, doctor: null,
    search: '', form: { name: '', age: '', gender: '', reason: '', visit_type: 'New patient' },
    token: null, rating: 0, comment: '', rated: false,
  };
  var current = null;       // function that draws the current screen (re-run on language change)
  var poll = null;

  function go(fn) { clearInterval(poll); current = fn; fn(); window.scrollTo(0, 0); }
  window.onLangChange = function () { signout.textContent = t('signOut'); if (current) current(); };
  mountLangSwitch(document.getElementById('lang'));
  signout.textContent = t('signOut');
  signout.addEventListener('click', async function () { await api('POST', '/api/patient/logout'); location.href = '/'; });

  // ---------- small view helpers
  var STEPS = ['stepHospital', 'stepDepartment', 'stepDoctor', 'stepDetails', 'stepToken'];
  function stepper(i) {
    return '<ol class="stepper" aria-label="Progress">' + STEPS.map(function (k, n) {
      var cls = n < i ? 'done' : n === i ? 'current' : '';
      return '<li class="' + cls + '"' + (n === i ? ' aria-current="step"' : '') + '><span class="n">' + (n + 1) + '</span><span class="t">' + esc(t(k)) + '</span></li>';
    }).join('') + '</ol>';
  }
  function option(id, selected, inner, disabled) {
    return '<button type="button" class="option" role="radio" aria-checked="' + (selected ? 'true' : 'false') + '"' +
      (disabled ? ' aria-disabled="true"' : '') + ' data-id="' + esc(id) + '"><span class="radio"></span>' + inner + '</button>';
  }
  function skeleton() { return '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; }
  function initials(name) {
    return name.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  }
  function selectable(container, onPick) {
    container.addEventListener('click', function (e) {
      var b = e.target.closest('.option');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      Array.prototype.forEach.call(container.querySelectorAll('.option'), function (o) { o.setAttribute('aria-checked', o === b ? 'true' : 'false'); });
      onPick(b.getAttribute('data-id'));
    });
  }

  // ---------- 1. hospital
  async function viewHospitals() {
    app.innerHTML = stepper(0) + '<h1 class="title">' + esc(t('hospitalTitle')) + '</h1><p class="lead">' + esc(t('hospitalLead')) + '</p><div class="mt">' + skeleton() + '</div>';
    if (!state.hospitals) {
      var r = await api('GET', '/api/hospitals');
      if (!r.ok) { app.innerHTML += '<div class="alert alert-bad">' + esc(r.data.error) + '</div>'; return; }
      state.hospitals = r.data;
    }
    app.innerHTML =
      stepper(0) +
      '<h1 class="title">' + esc(t('hospitalTitle')) + '</h1><p class="lead">' + esc(t('hospitalLead')) + '</p>' +
      '<div class="field mt"><input class="input" id="q" type="search" placeholder="' + esc(t('searchPh')) + '" value="' + esc(state.search) + '" aria-label="' + esc(t('searchPh')) + '"></div>' +
      '<div class="options cols-2" id="list" role="radiogroup"></div>' +
      '<p class="empty hide" id="none">' + esc(t('noHospital')) + '</p>' +
      '<div class="actions"><button class="btn btn-primary" id="next" disabled>' + esc(t('continue')) + '</button></div>';
    var list = document.getElementById('list'), next = document.getElementById('next');
    function paint() {
      var q = state.search.toLowerCase().trim();
      var rows = state.hospitals.filter(function (h) {
        return !q || h.name.toLowerCase().indexOf(q) >= 0 || h.departments.some(function (d) { return d.toLowerCase().indexOf(q) >= 0; });
      });
      document.getElementById('none').classList.toggle('hide', rows.length > 0);
      list.innerHTML = rows.map(function (h) {
        return option(h.id, state.hospital && state.hospital.id === h.id,
          '<span class="main"><span class="name">' + esc(h.name) + '</span><span class="meta">' + esc(h.departments.join(', ')) + '</span></span>' +
          '<span class="side num">' + h.distance_km + ' ' + esc(t('km')) + '<br>\u2605 ' + h.rating + '</span>');
      }).join('');
      next.disabled = !(state.hospital && rows.some(function (h) { return h.id === state.hospital.id; }));
    }
    paint();
    document.getElementById('q').addEventListener('input', function (e) { state.search = e.target.value; paint(); });
    selectable(list, function (id) {
      state.hospital = state.hospitals.filter(function (h) { return String(h.id) === id; })[0];
      state.department = null; state.doctor = null;
      next.disabled = false;
    });
    next.onclick = function () { go(viewDepartments); };
  }

  // ---------- 2. department
  function viewDepartments() {
    app.innerHTML =
      stepper(1) +
      '<h1 class="title">' + esc(t('deptTitle')) + '</h1><p class="lead">' + esc(t('deptLead')) + ' ' + esc(state.hospital.name) + '</p>' +
      '<div class="options cols-2 mt" id="list" role="radiogroup">' +
        state.hospital.departments.map(function (d) {
          return option(d, state.department === d, '<span class="main"><span class="name">' + esc(d) + '</span></span>');
        }).join('') +
      '</div>' +
      '<div class="actions"><button class="btn btn-secondary" id="back">' + esc(t('back')) + '</button>' +
      '<button class="btn btn-primary" id="next"' + (state.department ? '' : ' disabled') + '>' + esc(t('continue')) + '</button></div>';
    selectable(document.getElementById('list'), function (id) {
      state.department = id; state.doctor = null;
      document.getElementById('next').disabled = false;
    });
    document.getElementById('back').onclick = function () { go(viewHospitals); };
    document.getElementById('next').onclick = function () { go(viewDoctors); };
  }

  // ---------- 3. doctor
  async function viewDoctors() {
    app.innerHTML = stepper(2) + '<h1 class="title">' + esc(t('doctorTitle')) + '</h1><p class="lead">' + esc(state.hospital.name) + ' \u00B7 ' + esc(state.department) + '</p><div class="mt">' + skeleton() + '</div>';
    var r = await api('GET', '/api/hospitals/' + state.hospital.id + '/doctors');
    if (!r.ok) { app.innerHTML += '<div class="alert alert-bad">' + esc(r.data.error) + '</div>'; return; }
    var docs = r.data.filter(function (d) { return d.department === state.department; });
    app.innerHTML =
      stepper(2) +
      '<h1 class="title">' + esc(t('doctorTitle')) + '</h1><p class="lead">' + esc(state.hospital.name) + ' \u00B7 ' + esc(state.department) + '</p>' +
      (docs.length
        ? '<div class="options mt" id="list" role="radiogroup">' + docs.map(function (d) {
            var badge = d.status === 'available' ? 'badge-ok' : d.status === 'busy' ? 'badge-warn' : 'badge-bad';
            return option(d.id, state.doctor && state.doctor.id === d.id,
              '<span class="avatar">' + esc(initials(d.name)) + '</span>' +
              '<span class="main"><span class="name">' + esc(d.name) + '</span><span class="meta">' + esc(d.department) + '</span></span>' +
              '<span class="side"><span class="badge ' + badge + '">' + esc(t(d.status === 'busy' ? 'busy' : d.status === 'leave' ? 'leave' : 'available')) + '</span></span>',
              d.status === 'leave');
          }).join('') + '</div>'
        : '<p class="empty">' + esc(t('noDoctors')) + '</p>') +
      '<div class="actions"><button class="btn btn-secondary" id="back">' + esc(t('back')) + '</button>' +
      '<button class="btn btn-primary" id="next"' + (state.doctor ? '' : ' disabled') + '>' + esc(t('continue')) + '</button></div>';
    var list = document.getElementById('list');
    if (list) selectable(list, function (id) {
      state.doctor = docs.filter(function (d) { return String(d.id) === id; })[0];
      document.getElementById('next').disabled = false;
    });
    document.getElementById('back').onclick = function () { go(viewDepartments); };
    document.getElementById('next').onclick = function () { go(viewDetails); };
  }

  // ---------- 4. patient details
  function viewDetails() {
    var f = state.form;
    function sel(value, key) { return '<option value="' + esc(value) + '"' + (f.gender === value ? ' selected' : '') + '>' + esc(t(key)) + '</option>'; }
    app.innerHTML =
      stepper(3) +
      '<h1 class="title">' + esc(t('detailsTitle')) + '</h1>' +
      '<p class="lead">' + esc(state.doctor.name) + ' \u00B7 ' + esc(state.department) + ' \u00B7 ' + esc(state.hospital.name) + '</p>' +
      '<form id="f" class="panel mt" novalidate><div class="panel-body">' +
        '<p class="muted" style="margin-bottom:18px">' + esc(t('detailsLead')) + '</p>' +
        '<div class="field"><label for="name">' + esc(t('fullName')) + '</label><input class="input" id="name" autocomplete="name" maxlength="60" value="' + esc(f.name) + '"></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label for="age">' + esc(t('age')) + '</label><input class="input" id="age" inputmode="numeric" maxlength="3" value="' + esc(f.age) + '"></div>' +
          '<div class="field"><label for="gender">' + esc(t('gender')) + '</label><select class="input" id="gender">' +
            '<option value="">' + esc(t('select')) + '</option>' + sel('Male', 'male') + sel('Female', 'female') + sel('Other', 'other') + '</select></div>' +
        '</div>' +
        '<div class="field"><label for="reason">' + esc(t('reason')) + ' <span class="opt">(' + esc(t('optional')) + ')</span></label><input class="input" id="reason" maxlength="200" placeholder="' + esc(t('reasonPh')) + '" value="' + esc(f.reason) + '"></div>' +
        '<div class="field"><label for="visit">' + esc(t('visitType')) + '</label><select class="input" id="visit">' +
          '<option value="New patient"' + (f.visit_type === 'New patient' ? ' selected' : '') + '>' + esc(t('newPatient')) + '</option>' +
          '<option value="Follow-up"' + (f.visit_type === 'Follow-up' ? ' selected' : '') + '>' + esc(t('followUp')) + '</option></select></div>' +
        '<div id="err" class="alert alert-bad hide" role="alert"></div>' +
      '</div></form>' +
      '<div class="actions"><button class="btn btn-secondary" id="back">' + esc(t('back')) + '</button>' +
      '<button class="btn btn-primary" id="submit">' + esc(t('getToken')) + '</button></div>';

    function read() {
      f.name = document.getElementById('name').value.trim();
      f.age = document.getElementById('age').value.trim();
      f.gender = document.getElementById('gender').value;
      f.reason = document.getElementById('reason').value.trim();
      f.visit_type = document.getElementById('visit').value;
    }
    ['name', 'age', 'gender', 'reason', 'visit'].forEach(function (id) { document.getElementById(id).addEventListener('change', read); });
    document.getElementById('back').onclick = function () { read(); go(viewDoctors); };
    function submit(e) {
      if (e) e.preventDefault();
      read();
      var err = document.getElementById('err');
      if (!f.name || !f.age || !f.gender) { err.textContent = t('formIncomplete'); err.classList.remove('hide'); return; }
      var btn = document.getElementById('submit');
      btn.disabled = true;
      api('POST', '/api/tokens', {
        doctor_id: state.doctor.id, name: f.name, age: f.age, gender: f.gender, reason: f.reason, visit_type: f.visit_type,
      }).then(function (r) {
        if (!r.ok) { btn.disabled = false; err.textContent = r.data.error; err.classList.remove('hide'); return; }
        state.token = r.data;
        state.rating = 0; state.comment = ''; state.rated = false;
        go(viewQueue);
      });
    }
    document.getElementById('f').addEventListener('submit', submit);
    document.getElementById('submit').onclick = submit;
  }

  // ---------- 5. live token
  function subscribe() { if (socket && state.token) socket.emit('subscribe', state.token.doctor_id); }
  if (socket) {
    socket.on('connect', subscribe);
    socket.on('queue:update', function () { if (current === viewQueue) refresh(); });
  }

  async function refresh() {
    if (!state.token) return;
    var r = await api('GET', '/api/tokens/' + state.token.token_id + '/status');
    if (r.status === 401) { location.href = '/'; return; }
    if (!r.ok) return;
    state.token = r.data;
    if (r.data.status === 'completed') return go(viewThanks);
    if (r.data.status === 'no_show') return go(viewMissed);
    if (r.data.status === 'cancelled') { state.token = null; return go(viewHospitals); }
    viewQueue(true);
  }

  function viewQueue(isRefresh) {
    var k = state.token;
    if (!isRefresh) { current = viewQueue; subscribe(); clearInterval(poll); poll = setInterval(refresh, 15000); }
    document.title = (k.status === 'in_progress' ? '\u25CF ' : '') + 'CarePoint';
    var notice = '';
    if (k.status === 'in_progress') notice = '<div class="alert alert-ok" role="status"><strong>' + esc(t('yourTurn')) + '</strong></div>';
    else if (k.ahead === 0) notice = '<div class="alert alert-warn" role="status">' + esc(t('nextUp')) + '</div>';
    else if (k.ahead <= 2) notice = '<div class="alert alert-warn" role="status">' + esc(t('almost', { n: k.ahead })) + '</div>';
    var badge = k.status === 'in_progress' ? '<span class="badge badge-ok">' + esc(t('statusProgress')) + '</span>' : '<span class="badge badge-info">' + esc(t('statusWaiting')) + '</span>';
    var waiting = k.status === 'waiting';
    app.innerHTML =
      stepper(4) +
      '<h1 class="title">' + esc(t('queueTitle')) + '</h1>' + notice +
      '<section class="panel mt" aria-live="polite">' +
        '<div class="token"><div><div class="token-label">' + esc(t('tokenLabel')) + '</div><div class="token-no">' + k.token_no + '</div></div>' + badge + '</div>' +
        '<dl class="kv">' +
          '<div class="kv-row"><dt>' + esc(t('nowServing')) + '</dt><dd class="num">' + (k.current_serving || '\u2013') + '</dd></div>' +
          (waiting ? '<div class="kv-row"><dt>' + esc(t('ahead')) + '</dt><dd class="num">' + k.ahead + '</dd></div>' +
                     '<div class="kv-row"><dt>' + esc(t('estWait')) + '</dt><dd class="num">' + (k.est_wait_minutes ? '~' + k.est_wait_minutes + ' ' + esc(t('min')) : '\u2013') + '</dd></div>' : '') +
          '<div class="kv-row"><dt>' + esc(t('hospital')) + '</dt><dd>' + esc(k.hospital_name) + '</dd></div>' +
          '<div class="kv-row"><dt>' + esc(t('department')) + '</dt><dd>' + esc(k.department) + '</dd></div>' +
          '<div class="kv-row"><dt>' + esc(t('doctor')) + '</dt><dd>' + esc(k.doctor_name) + '</dd></div>' +
        '</dl>' +
      '</section>' +
      '<div class="row between wrap mt"><span class="muted"><span class="dot"></span>' + esc(t('live')) + '</span>' +
        '<span class="row"><button class="btn btn-secondary btn-sm" id="refresh">' + esc(t('refresh')) + '</button>' +
        (waiting ? '<button class="btn btn-danger btn-sm" id="cancel">' + esc(t('cancelToken')) + '</button>' : '') + '</span></div>';
    document.getElementById('refresh').onclick = refresh;
    var cancel = document.getElementById('cancel');
    if (cancel) cancel.onclick = async function () {
      if (!confirm(t('cancelConfirm'))) return;
      var r = await api('POST', '/api/tokens/' + k.token_id + '/cancel');
      if (r.ok) { state.token = null; document.title = 'CarePoint'; go(viewHospitals); }
    };
  }

  // ---------- end states
  function resetTrip() {
    state.token = null; state.hospital = null; state.department = null; state.doctor = null;
    state.form = { name: '', age: '', gender: '', reason: '', visit_type: 'New patient' };
    document.title = 'CarePoint';
  }

  function viewThanks() {
    var k = state.token;
    document.title = 'CarePoint';
    var rating = '<div class="seg" role="radiogroup" aria-label="' + esc(t('rateTitle')) + '">' + [1, 2, 3, 4, 5].map(function (n) {
      return '<button type="button" role="radio" aria-checked="' + (state.rating === n ? 'true' : 'false') + '" data-n="' + n + '" style="width:44px">' + n + '</button>';
    }).join('') + '</div>';
    app.innerHTML =
      '<div style="text-align:center;margin-top:8px">' +
        '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="22" stroke="#17702F" stroke-width="2"/><path d="M14 25l7 7 13-15" stroke="#17702F" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<h1 class="title" style="margin-top:14px">' + esc(t('thankTitle')) + '</h1><p class="lead">' + esc(t('thankLead')) + '</p>' +
      '</div>' +
      '<section class="panel mt"><dl class="kv">' +
        '<div class="kv-row"><dt>' + esc(t('tokenLabel')) + '</dt><dd class="num">' + k.token_no + '</dd></div>' +
        '<div class="kv-row"><dt>' + esc(t('hospital')) + '</dt><dd>' + esc(k.hospital_name) + '</dd></div>' +
        '<div class="kv-row"><dt>' + esc(t('doctor')) + '</dt><dd>' + esc(k.doctor_name) + '</dd></div>' +
        '<div class="kv-row"><dt>' + esc(t('department')) + '</dt><dd>' + esc(k.department) + '</dd></div>' +
      '</dl></section>' +
      '<section class="panel mt"><div class="panel-body">' +
        (state.rated
          ? '<div class="alert alert-ok" style="margin-top:0">' + esc(t('feedbackThanks')) + '</div>'
          : '<p class="section-title" style="margin-bottom:12px">' + esc(t('rateTitle')) + '</p>' + rating +
            '<div class="field mt-s"><input class="input" id="comment" maxlength="200" placeholder="' + esc(t('rateCommentPh')) + '" value="' + esc(state.comment) + '"></div>' +
            '<div id="err" class="alert alert-bad hide" role="alert"></div>' +
            '<button class="btn btn-secondary" id="send"' + (state.rating ? '' : ' disabled') + '>' + esc(t('sendFeedback')) + '</button>') +
      '</div></section>' +
      '<div class="actions"><button class="btn btn-primary" id="done">' + esc(t('finish')) + '</button></div>';
    Array.prototype.forEach.call(app.querySelectorAll('[data-n]'), function (b) {
      b.onclick = function () {
        state.rating = Number(b.getAttribute('data-n'));
        state.comment = document.getElementById('comment').value;
        viewThanks();
      };
    });
    var send = document.getElementById('send');
    if (send) send.onclick = async function () {
      var comment = document.getElementById('comment').value.trim();
      var r = await api('POST', '/api/tokens/' + k.token_id + '/feedback', { rating: state.rating, comment: comment });
      if (r.ok || r.status === 409) { state.rated = true; viewThanks(); }
      else { var err = document.getElementById('err'); err.textContent = r.data.error; err.classList.remove('hide'); }
    };
    document.getElementById('done').onclick = function () { resetTrip(); go(viewHospitals); };
  }

  function viewMissed() {
    document.title = 'CarePoint';
    app.innerHTML =
      '<h1 class="title">' + esc(t('missedTitle')) + '</h1>' +
      '<div class="alert alert-warn">' + esc(t('missedLead')) + '</div>' +
      '<div class="actions"><button class="btn btn-primary" id="again">' + esc(t('bookAgain')) + '</button></div>';
    document.getElementById('again').onclick = function () { resetTrip(); go(viewHospitals); };
  }

  // ---------- start: restore a live token after a page reload, otherwise start booking
  (async function start() {
    var r = await api('GET', '/api/patient/active-token');
    if (r.status === 401) { location.href = '/'; return; }
    if (r.ok && r.data.token) { state.token = r.data.token; go(viewQueue); }
    else go(viewHospitals);
  })();
})();
