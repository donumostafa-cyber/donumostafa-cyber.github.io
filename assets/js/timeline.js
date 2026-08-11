

(function () {
  var DATA = window.LETTERS || [];
  var TOTAL = DATA.length;

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  };

  var state = {
    search: '', sender: '', recipient: '', place: '',
    sortKey: 'id', sortDir: 1,
    maxId: TOTAL, activeCharacter: ''
  };

  var normalizeName = function (n) {
    return {
      'الليدي سوزان فيرنن': 'الليدي سوزان',
      'السيدة كاثرين فيرنن': 'السيدة فيرنن',
      'أمها الليدي دي كورسي': 'الليدي دي كورسي',
      'الآنسة فريدريكا فيرنن': 'فريدريكا'
    }[n] || n;
  };

  var PROFILES = {
    'الليدي سوزان': ['محور الرواية وصانعة المكائد', 'أرملة فاتنة وذكية، تستعمل اللغة المهذبة لتغطية رغباتها وحساباتها، وتكشف رسائلها إلى السيدة جونسون الهوّة بين صورتها العامة وحقيقتها.'],
    'السيدة فيرنن': ['المراقِبة الأخلاقية للسرد', 'سِلفة الليدي سوزان، تنقل إلى أمها ما يجري في تشرشل، وتقاوم سحرها منذ البداية وتحاول حماية أخيها وفريدريكا.'],
    'السيدة جونسون': ['الصديقة والمرآة السرية', 'صديقة الليدي سوزان في لندن وشريكتها في الأسرار؛ تمنح القارئ المدخل الأوضح إلى خططها، ثم تتراجع عنها حين تشتد الفضيحة.'],
    'السيد دي كورسي': ['المعجب المتردد', 'شقيق كاثرين، يبدأ واثقًا من قدرته على كشف الليدي سوزان ثم يقع تحت تأثيرها، قبل أن تنكشف له الحقيقة في لندن.'],
    'الليدي دي كورسي': ['الأم الحذرة', 'أم كاثرين وريجنالد، تتلقى معظم تقارير تشرشل وتراقب من بعيد خطر الليدي سوزان على ابنها والعائلة.'],
    'فريدريكا': ['الابنة المحاصرة', 'ابنة الليدي سوزان الوديعة، تقاوم زواجًا مفروضًا عليها وتلجأ إلى ريجنالد طلبًا للحماية، ثم تجد استقرارها في تشرشل.'],
    'السير ريجينالد دي كورسي': ['الأب وسلطة العائلة', 'يحذر ابنه من الزواج بالليدي سوزان ويهدده بحرمانه من الميراث، ممثلًا صوت الخبرة والسلطة الأبوية.'],
    'السيد فيرنن': ['المضيف حسن النية', 'أخو زوج الليدي سوزان الراحل، يستقبلها في تشرشل بحسن نية ويجلب فريدريكا إلى البيت.']
  };

  
  function unique(key) {
    return Array.from(new Set(DATA.map(function (x) { return x[key]; })))
      .sort(function (a, b) { return a.localeCompare(b, 'ar'); });
  }
  function fillSelect(sel, key) {
    var el = $(sel);
    unique(key).forEach(function (v) {
      el.insertAdjacentHTML('beforeend', '<option value="' + esc(v) + '">' + esc(v) + '</option>');
    });
  }
  fillSelect('#senderFilter', 'sender');
  fillSelect('#recipientFilter', 'recipient');
  fillSelect('#placeFilter', 'place');

  $('#statLetters').textContent = TOTAL;
  $('#statSenders').textContent = unique('sender').length;
  $('#statRecipients').textContent = unique('recipient').length;
  $('#statPlaces').textContent = unique('place').length;
  $('#letterRange').max = TOTAL;
  $('#letterRange').value = TOTAL;

  
  function filtered() {
    var q = state.search.trim().toLocaleLowerCase('ar');
    return DATA.filter(function (x) {
      return x.id <= state.maxId
        && (!state.sender || x.sender === state.sender)
        && (!state.recipient || x.recipient === state.recipient)
        && (!state.place || x.place === state.place)
        && (!state.activeCharacter
            || normalizeName(x.sender) === state.activeCharacter
            || normalizeName(x.recipient) === state.activeCharacter)
        && (!q || [x.sender, x.subject, x.recipient, x.place].join(' ').toLocaleLowerCase('ar').indexOf(q) !== -1);
    }).sort(function (a, b) {
      var A = a[state.sortKey], B = b[state.sortKey];
      if (typeof A === 'string') return A.localeCompare(B, 'ar') * state.sortDir;
      return (A - B) * state.sortDir;
    });
  }

  function counts(rows, key) {
    var m = {};
    rows.forEach(function (x) { m[x[key]] = (m[x[key]] || 0) + 1; });
    return Object.entries(m).sort(function (a, b) {
      return b[1] - a[1] || a[0].localeCompare(b[0], 'ar');
    });
  }

  function renderChart(sel, arr, limit) {
    var el = $(sel);
    var top = arr.slice(0, limit || 8);
    var max = Math.max.apply(null, [1].concat(top.map(function (x) { return x[1]; })));
    el.innerHTML = top.map(function (row) {
      return '<div class="bar-row" title="' + esc(row[0]) + ': ' + row[1] + '">' +
        '<div class="bar-label">' + esc(row[0]) + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + (row[1] / max * 100) + '%"></div></div>' +
        '<div class="bar-val">' + row[1] + '</div></div>';
    }).join('');
  }

  
  function render() {
    var rows = filtered();
    $('#visibleCount').textContent = rows.length + ' رسالة';
    $('#empty').style.display = rows.length ? 'none' : 'block';

    $('#timeline').innerHTML = rows.map(function (x) {
      return '<article class="event" data-id="' + x.id + '">' +
        '<div class="event-head">' +
          '<span class="num">' + x.id + '</span>' +
          '<span class="person">' + esc(x.sender) + '</span>' +
          '<span class="arrow">←</span>' +
          '<span class="recipient">' + esc(x.recipient) + '</span>' +
          '<span class="place">' + esc(x.place) + '</span>' +
        '</div>' +
        '<p class="subject">' + esc(x.subject) + '</p>' +
        '<div class="event-meta">' +
          '<button class="mini-action" data-character="' + esc(normalizeName(x.sender)) + '">بطاقة المرسل</button>' +
          '<button class="mini-action" data-open-letter="' + x.id + '">تكبير الرسالة</button>' +
        '</div></article>';
    }).join('');

    $('#tbody').innerHTML = rows.map(function (x) {
      return '<tr><td>' + x.id + '</td><td><b>' + esc(x.sender) + '</b></td><td>' + esc(x.subject) +
        '</td><td>' + esc(x.recipient) + '</td><td>' + esc(x.place) + '</td></tr>';
    }).join('');

    renderChart('#senderChart', counts(rows, 'sender'));
    renderChart('#placeChart', counts(rows, 'place'));

    updateProgress();
    updatePhase();
  }

  function updateProgress() {
    var n = state.maxId || TOTAL;
    $('#letterRange').value = n;
    $('#rangeNumber').textContent = n + ' / ' + TOTAL;
    $('#storyProgressFill').style.width = (n / TOTAL * 100) + '%';
  }

  function updatePhase() {
    document.querySelectorAll('.phase').forEach(function (b) {
      b.classList.toggle('active', state.maxId >= Number(b.dataset.from) && state.maxId <= Number(b.dataset.to));
    });
  }

  
  function charStats(name) {
    var sent = DATA.filter(function (x) { return normalizeName(x.sender) === name; });
    var received = DATA.filter(function (x) { return normalizeName(x.recipient) === name; });
    return {
      sent: sent.length,
      received: received.length,
      places: new Set(sent.concat(received).map(function (x) { return x.place; })).size
    };
  }

  function showProfile(name, filter) {
    var p = PROFILES[name] || ['شخصية في شبكة المراسلات', 'تظهر هذه الشخصية في تبادل الرسائل أو في مسار الأحداث، ويكشف حضورها جانبًا من شبكة العلاقات في الرواية.'];
    var st = charStats(name);
    var initial = name.replace(/^(الليدي|السيدة|السيد|السير|الآنسة)\s+/, '').trim().charAt(0) || '•';

    $('#profilePanel').innerHTML =
      '<div class="profile-monogram">' + esc(initial) + '</div>' +
      '<h3>' + esc(name) + '</h3>' +
      '<div class="profile-role">' + esc(p[0]) + '</div>' +
      '<p>' + esc(p[1]) + '</p>' +
      '<div class="profile-stats">' +
        '<div class="profile-stat"><b>' + st.sent + '</b><span>أرسلت</span></div>' +
        '<div class="profile-stat"><b>' + st.received + '</b><span>استلمت</span></div>' +
        '<div class="profile-stat"><b>' + st.places + '</b><span>أماكن</span></div>' +
      '</div>' +
      (filter ? '<button class="clear-character" id="clearCharacter">عرض جميع الشخصيات</button>' : '');

    state.activeCharacter = filter ? name : '';
    document.querySelectorAll('.network-node').forEach(function (n) {
      n.classList.toggle('active', n.dataset.name === name);
    });
    if (filter) render();

    var c = $('#clearCharacter');
    if (c) c.onclick = function () {
      state.activeCharacter = '';
      document.querySelectorAll('.network-node').forEach(function (n) { n.classList.remove('active'); });
      showProfile('الليدي سوزان', false);
      render();
    };
  }

  function buildNetwork() {
    var map = new Map();
    DATA.forEach(function (x) {
      [normalizeName(x.sender), normalizeName(x.recipient)].forEach(function (n) {
        map.set(n, (map.get(n) || 0) + 1);
      });
    });
    var chars = Array.from(map).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 11);
    var names = chars.map(function (x) { return x[0]; });
    var w = 600, h = 500, cx = 300, cy = 250;
    var positions = {};
    names.forEach(function (n, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / names.length;
      var r = i % 2 ? 205 : 175;
      positions[n] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
    positions['الليدي سوزان'] = { x: cx, y: cy };

    var pairs = new Map();
    DATA.forEach(function (x) {
      var a = normalizeName(x.sender), b = normalizeName(x.recipient);
      if (names.indexOf(a) !== -1 && names.indexOf(b) !== -1) {
        var k = [a, b].sort().join('|');
        pairs.set(k, (pairs.get(k) || 0) + 1);
      }
    });

    var lines = '';
    pairs.forEach(function (v, k) {
      var parts = k.split('|'), A = positions[parts[0]], B = positions[parts[1]];
      lines += '<line class="network-line" x1="' + A.x + '" y1="' + A.y + '" x2="' + B.x + '" y2="' + B.y +
        '" stroke-width="' + (1 + Math.min(v, 6) * 0.45) + '"/>';
    });

    $('#network').innerHTML =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + lines + '</svg>' +
      chars.map(function (row) {
        var P = positions[row[0]], size = 10 + Math.min(row[1], 20) * 0.35;
        return '<button class="network-node" data-name="' + esc(row[0]) + '" style="left:' +
          (P.x / w * 100) + '%;top:' + (P.y / h * 100) + '%;font-size:' + size + 'px">' +
          esc(row[0]) + ' · ' + row[1] + '</button>';
      }).join('');

    document.querySelectorAll('.network-node').forEach(function (n) {
      n.onclick = function () { showProfile(n.dataset.name, true); };
    });
  }

  
  function openLetter(id) {
    var x = DATA.find(function (d) { return d.id === id; });
    if (!x) return;
    $('#drawerNum').textContent = 'الرسالة ' + x.id;
    $('#drawerTitle').textContent = x.sender;
    $('#drawerRoute').textContent = 'إلى ' + x.recipient + ' — من ' + x.place;
    $('#drawerSubject').textContent = x.subject;
    $('#drawerTags').innerHTML =
      '<span>' + esc(x.place) + '</span>' +
      '<span>' + esc(normalizeName(x.sender)) + '</span>' +
      '<span>' + esc(normalizeName(x.recipient)) + '</span>';
    $('#detailDrawer').classList.add('open');
  }

  
  document.addEventListener('click', function (e) {
    var char = e.target.closest('[data-character]');
    if (char) { showProfile(char.dataset.character, true); return; }
    var open = e.target.closest('[data-open-letter]');
    if (open) { openLetter(Number(open.dataset.openLetter)); return; }
    var event = e.target.closest('.event');
    if (event && !e.target.closest('button')) openLetter(Number(event.dataset.id));
  });

  $('#drawerClose').onclick = function () { $('#detailDrawer').classList.remove('open'); };
  $('#detailDrawer').onclick = function (e) {
    if (e.target.id === 'detailDrawer') e.currentTarget.classList.remove('open');
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $('#detailDrawer').classList.remove('open');
  });

  $('#search').addEventListener('input', function (e) { state.search = e.target.value; render(); });
  $('#senderFilter').addEventListener('change', function (e) { state.sender = e.target.value; render(); });
  $('#recipientFilter').addEventListener('change', function (e) { state.recipient = e.target.value; render(); });
  $('#placeFilter').addEventListener('change', function (e) { state.place = e.target.value; render(); });
  $('#letterRange').addEventListener('input', function (e) { state.maxId = Number(e.target.value); render(); });

  document.querySelectorAll('.phase').forEach(function (b) {
    b.addEventListener('click', function () {
      state.maxId = Number(b.dataset.to);
      render();
      $('#timelineSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('th[data-key]').forEach(function (th) {
    th.onclick = function () {
      var k = th.dataset.key;
      state.sortDir = state.sortKey === k ? -state.sortDir : 1;
      state.sortKey = k;
      render();
    };
  });

  $('#reset').onclick = function () {
    state = { search: '', sender: '', recipient: '', place: '', sortKey: 'id', sortDir: 1, maxId: TOTAL, activeCharacter: '' };
    $('#search').value = '';
    ['#senderFilter', '#recipientFilter', '#placeFilter'].forEach(function (s) { $(s).value = ''; });
    showProfile('الليدي سوزان', false);
    render();
  };

  buildNetwork();
  showProfile('الليدي سوزان', false);
  render();
})();
