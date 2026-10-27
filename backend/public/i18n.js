// Shared helpers: translations, HTML escaping and a small fetch wrapper.
(function () {
  var I18N = {
    en: {
      back: 'Back', continue: 'Continue', signOut: 'Sign out', loading: 'Loading', km: 'km', min: 'min', optional: 'optional',
      // sign in
      sideTitle: 'Know your turn before you reach the hospital.',
      side1: 'Take a token from your phone instead of standing in a line.',
      side2: 'See which number is being served and how many people are ahead of you.',
      side3: 'Get a reminder when your turn is close.',
      signInTitle: 'Sign in', signInLead: 'Enter your mobile number to book a token or check your queue.',
      idLabel: 'Mobile number', idPlaceholder: '10-digit mobile number',
      idHint: 'Doctors and administrators can enter their user ID here.',
      otpTitle: 'Verify your number', otpLead: 'Enter the 4-digit code sent to',
      otpDemo: 'Demo mode: no SMS is sent. Your code is', verify: 'Verify and continue',
      resendIn: 'Resend code in', seconds: 's', resend: 'Resend code', changeNumber: 'Use a different number',
      codeIncomplete: 'Enter all 4 digits.',
      doctorSignIn: 'Doctor sign in', adminSignIn: 'Administrator sign in',
      userId: 'User ID', password: 'Password', signInBtn: 'Sign in', otherId: 'Use a different ID',
      boardLink: 'Waiting-room display',
      // patient flow
      stepHospital: 'Hospital', stepDepartment: 'Department', stepDoctor: 'Doctor', stepDetails: 'Details', stepToken: 'Token',
      hospitalTitle: 'Select a hospital', hospitalLead: 'The nearest hospitals are listed first.',
      searchPh: 'Search by hospital or department', noHospital: 'No hospital matches your search.',
      deptTitle: 'Select a department', deptLead: 'Departments available at',
      doctorTitle: 'Select a doctor', noDoctors: 'No doctors are listed for this department yet.',
      available: 'Available', busy: 'With a patient', leave: 'Not available today',
      detailsTitle: 'Patient details', detailsLead: 'The doctor will see this before your consultation.',
      fullName: 'Full name', age: 'Age', gender: 'Gender', select: 'Select', male: 'Male', female: 'Female', other: 'Other',
      reason: 'Reason for visit', reasonPh: 'For example: knee pain', visitType: 'Visit type',
      newPatient: 'New patient', followUp: 'Follow-up', getToken: 'Get token',
      formIncomplete: 'Enter the name, age and gender to continue.',
      // queue
      queueTitle: 'Your token', tokenLabel: 'Token', nowServing: 'Now serving', ahead: 'People ahead of you',
      estWait: 'Estimated wait', hospital: 'Hospital', doctor: 'Doctor', department: 'Department',
      statusWaiting: 'Waiting', statusProgress: 'With the doctor',
      yourTurn: 'It is your turn. Please go to the doctor\'s room.',
      almost: 'Your turn is close. {n} ahead of you. Please be at the hospital.',
      nextUp: 'You are next. Please be ready.',
      live: 'Live updates on', refresh: 'Refresh', cancelToken: 'Cancel token',
      cancelConfirm: 'Cancel this token? You will lose your place in the queue.',
      // end states
      thankTitle: 'Thank you for visiting', thankLead: 'Your consultation is complete.',
      rateTitle: 'How was your visit?', rateCommentPh: 'Add a comment (optional)', sendFeedback: 'Send feedback',
      feedbackThanks: 'Thank you. Your feedback has been recorded.', finish: 'Done',
      missedTitle: 'You missed your turn',
      missedLead: 'The doctor called your number but you were not there. You can book a new token.',
      bookAgain: 'Book a new token',
    },
    hi: {
      back: 'वापस', continue: 'आगे बढ़ें', signOut: 'साइन आउट', loading: 'लोड हो रहा है', km: 'किमी', min: 'मिनट', optional: 'वैकल्पिक',
      sideTitle: 'अस्पताल पहुँचने से पहले अपनी बारी जानें।',
      side1: 'लाइन में लगने की जगह अपने फ़ोन से टोकन लें।',
      side2: 'देखें कि कौन सा नंबर चल रहा है और आपसे पहले कितने लोग हैं।',
      side3: 'बारी पास आने पर रिमाइंडर पाएँ।',
      signInTitle: 'साइन इन करें', signInLead: 'टोकन बुक करने या अपनी कतार देखने के लिए मोबाइल नंबर डालें।',
      idLabel: 'मोबाइल नंबर', idPlaceholder: '10 अंकों का मोबाइल नंबर',
      idHint: 'डॉक्टर और एडमिनिस्ट्रेटर यहाँ अपनी यूज़र आईडी डाल सकते हैं।',
      otpTitle: 'अपना नंबर वेरिफ़ाई करें', otpLead: 'इस नंबर पर भेजा गया 4 अंकों का कोड डालें:',
      otpDemo: 'डेमो मोड: SMS नहीं भेजा जाता। आपका कोड है', verify: 'वेरिफ़ाई करके आगे बढ़ें',
      resendIn: 'कोड दोबारा भेजें:', seconds: 'सेकंड', resend: 'कोड दोबारा भेजें', changeNumber: 'दूसरा नंबर इस्तेमाल करें',
      codeIncomplete: 'सभी 4 अंक डालें।',
      doctorSignIn: 'डॉक्टर साइन इन', adminSignIn: 'एडमिनिस्ट्रेटर साइन इन',
      userId: 'यूज़र आईडी', password: 'पासवर्ड', signInBtn: 'साइन इन', otherId: 'दूसरी आईडी इस्तेमाल करें',
      boardLink: 'वेटिंग-रूम डिस्प्ले',
      stepHospital: 'अस्पताल', stepDepartment: 'विभाग', stepDoctor: 'डॉक्टर', stepDetails: 'विवरण', stepToken: 'टोकन',
      hospitalTitle: 'अस्पताल चुनें', hospitalLead: 'सबसे नज़दीकी अस्पताल पहले दिखाए गए हैं।',
      searchPh: 'अस्पताल या विभाग से खोजें', noHospital: 'आपकी खोज से कोई अस्पताल नहीं मिला।',
      deptTitle: 'विभाग चुनें', deptLead: 'उपलब्ध विभाग:',
      doctorTitle: 'डॉक्टर चुनें', noDoctors: 'इस विभाग में अभी कोई डॉक्टर सूचीबद्ध नहीं है।',
      available: 'उपलब्ध', busy: 'मरीज़ के साथ', leave: 'आज उपलब्ध नहीं',
      detailsTitle: 'मरीज़ का विवरण', detailsLead: 'परामर्श से पहले डॉक्टर यह जानकारी देखेंगे।',
      fullName: 'पूरा नाम', age: 'उम्र', gender: 'लिंग', select: 'चुनें', male: 'पुरुष', female: 'महिला', other: 'अन्य',
      reason: 'आने का कारण', reasonPh: 'जैसे: घुटने में दर्द', visitType: 'विज़िट का प्रकार',
      newPatient: 'नया मरीज़', followUp: 'फ़ॉलो-अप', getToken: 'टोकन लें',
      formIncomplete: 'आगे बढ़ने के लिए नाम, उम्र और लिंग भरें।',
      queueTitle: 'आपका टोकन', tokenLabel: 'टोकन', nowServing: 'अभी चल रहा है', ahead: 'आपसे पहले',
      estWait: 'अनुमानित प्रतीक्षा', hospital: 'अस्पताल', doctor: 'डॉक्टर', department: 'विभाग',
      statusWaiting: 'प्रतीक्षा में', statusProgress: 'डॉक्टर के साथ',
      yourTurn: 'आपकी बारी है। कृपया डॉक्टर के कमरे में जाएँ।',
      almost: 'आपकी बारी पास है। आपसे पहले {n} लोग हैं। कृपया अस्पताल पहुँचें।',
      nextUp: 'अगली बारी आपकी है। कृपया तैयार रहें।',
      live: 'लाइव अपडेट चालू', refresh: 'रिफ़्रेश', cancelToken: 'टोकन रद्द करें',
      cancelConfirm: 'यह टोकन रद्द करें? कतार में आपकी जगह चली जाएगी।',
      thankTitle: 'आने के लिए धन्यवाद', thankLead: 'आपका परामर्श पूरा हो गया है।',
      rateTitle: 'आपका अनुभव कैसा रहा?', rateCommentPh: 'टिप्पणी जोड़ें (वैकल्पिक)', sendFeedback: 'फ़ीडबैक भेजें',
      feedbackThanks: 'धन्यवाद। आपका फ़ीडबैक दर्ज हो गया है।', finish: 'हो गया',
      missedTitle: 'आपकी बारी निकल गई',
      missedLead: 'डॉक्टर ने आपका नंबर बुलाया पर आप मौजूद नहीं थे। आप नया टोकन ले सकते हैं।',
      bookAgain: 'नया टोकन लें',
    },
  };

  var lang = 'en';
  try { lang = localStorage.getItem('lang') || 'en'; } catch (e) { /* storage blocked */ }
  if (!I18N[lang]) lang = 'en';
  document.documentElement.lang = lang;

  window.t = function (key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  };
  window.getLang = function () { return lang; };
  window.onLangChange = null;

  function syncSwitch(el) {
    Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-l') === lang ? 'true' : 'false');
    });
  }
  window.mountLangSwitch = function (el) {
    el.className = 'seg';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Language');
    el.innerHTML = '<button type="button" data-l="en">EN</button><button type="button" data-l="hi">हिंदी</button>';
    syncSwitch(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      lang = b.getAttribute('data-l');
      try { localStorage.setItem('lang', lang); } catch (err) { /* ignore */ }
      document.documentElement.lang = lang;
      syncSwitch(el);
      if (typeof window.onLangChange === 'function') window.onLangChange();
    });
  };

  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  window.api = async function (method, url, body) {
    try {
      var res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      var data = null;
      try { data = await res.json(); } catch (e) { /* empty body */ }
      return { ok: res.ok, status: res.status, data: data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'Cannot reach the server. Check that it is running.' } };
    }
  };
})();
