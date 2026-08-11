

(function () {
  var NAV = [
    { id: 'blog',     label: 'الرئيسية',        href: '' },
    { id: 'archive',  label: 'كل التدوينات',    href: 'archive/' },
    { id: 'library',  label: 'مكتبتي',          href: 'library/' },
    { id: 'poetry',   label: 'منسّق الشعر',     href: 'poetry/' },
    { id: 'timeline', label: 'الخطوط الزمنية',  href: 'timeline/' }
  ];

  
  var EXTRA = [];

  var root = document.body.dataset.root || '';
  var page = document.body.dataset.page || '';

  
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  
  function imgSrc(src) {
    return /^(https?:)?\//.test(src) ? src : root + src;
  }

  function link(item) {
    var active = item.id === page ? ' class="is-active" aria-current="page"' : '';
    return '<a href="' + root + item.href + '"' + active + '>' + item.label + '</a>';
  }

  var brand =
    '<a class="brand" href="' + (root || './') + '">' +
      '<span class="seal" aria-hidden="true">خ</span>' +
      '<span>' +
        '<span class="brand-name">خالد الحمدان</span><br>' +
        '<span class="brand-tag">KhalidReads</span>' +
      '</span>' +
    '</a>';

  var header = document.getElementById('siteHeader');
  if (header) {
    header.className = 'site-header';
    header.innerHTML =
      '<div class="wrap header-inner">' + brand +
        '<nav class="nav" aria-label="أقسام الموقع">' + NAV.map(link).join('') + '</nav>' +
        '<button class="menu-btn" id="menuBtn" aria-expanded="false" ' +
          'aria-controls="siteDrawer" aria-label="القائمة"><span></span></button>' +
      '</div>';

    
    var veil = document.createElement('div');
    veil.className = 'drawer-veil';
    veil.id = 'drawerVeil';

    var drawer = document.createElement('nav');
    drawer.className = 'drawer';
    drawer.id = 'siteDrawer';
    drawer.setAttribute('aria-label', 'قائمة الموقع');
    drawer.innerHTML =
      '<div class="drawer-top">' + brand + '</div>' +
      NAV.concat(EXTRA).map(link).join('') +
      '<div class="drawer-foot">KHALIDREADS</div>';

    document.body.appendChild(veil);
    document.body.appendChild(drawer);

    var btn = document.getElementById('menuBtn');
    function setDrawer(open) {
      drawer.classList.toggle('open', open);
      veil.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    }
    btn.addEventListener('click', function () {
      setDrawer(btn.getAttribute('aria-expanded') !== 'true');
    });
    veil.addEventListener('click', function () { setDrawer(false); });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) setDrawer(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setDrawer(false);
    });

    
    var lastY = window.pageYOffset, ticking = false;
    function onScroll() {
      var y = window.pageYOffset;
      if (drawer.classList.contains('open')) { lastY = y; ticking = false; return; }
      if (Math.abs(y - lastY) > 6) {
        header.classList.toggle('is-hidden', y > lastY && y > 90);
        lastY = y;
      }
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
    }, { passive: true });
  }

  var footer = document.getElementById('siteFooter');
  if (footer) {
    footer.className = 'site-footer';
    footer.innerHTML =
      '<div class="wrap footer-inner">' +
        '<span class="seal sm" aria-hidden="true">خ</span>' +
        '<span>مدونة قراءات وأمور جانبية · ' + new Date().getFullYear() + '</span>' +
        '<span class="footer-links">' +
          NAV.concat(EXTRA).map(function (i) {
            return '<a href="' + root + i.href + '">' + i.label + '</a>';
          }).join('') +
        '</span>' +
      '</div>';
  }

  
  var activeLabel = '';
  var query = '';

  
  function haystack(p) {
    return [p.title, p.excerpt, p.tag, p.author, p.publisher]
      .concat(p.labels || []).join(' ').toLowerCase();
  }

  window.renderPosts = function (targetId, limit) {
    var el = document.getElementById(targetId);
    if (!el || !window.POSTS) return;
    var list = window.POSTS.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date);
    });
    if (activeLabel) {
      list = list.filter(function (p) {
        return (p.labels || [p.tag]).indexOf(activeLabel) !== -1;
      });
    }
    if (query) {
      var words = query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(function (p) {
        var h = haystack(p);
        return words.every(function (w) { return h.indexOf(w) !== -1; });
      });
    }
    if (limit && !query) list = list.slice(0, limit);   
    var note = document.getElementById(targetId + 'Count');
    if (note) note.textContent = (query || activeLabel) ? list.length + ' تدوينة' : '';
    if (!list.length) {
      el.innerHTML = '<p class="muted">' +
        (query ? 'لا تدوينة تطابق «' + esc(query) + '».' : 'لا توجد تدوينات في هذا التصنيف بعد.') +
        '</p>';
      return;
    }
    el.innerHTML = list.map(function (p) {
      var stars = p.rating
        ? '<span class="post-stars">' + '★'.repeat(p.rating) + '☆'.repeat(5 - p.rating) + '</span>'
        : '';
      var byline = [];
      if (p.author) byline.push(esc(p.author));
      if (p.pages) byline.push(p.pages + ' صفحة');

      
      var thumb = p.image
        ? '<div class="post-thumb"><img src="' + esc(imgSrc(p.image)) + '" alt="" loading="lazy" decoding="async"></div>'
        : '';

      return '<article class="post-item">' +
        '<a class="post-link' + (thumb ? ' has-thumb' : '') + '" href="' + root + p.url + '">' +
          '<div class="post-text">' +
            '<div class="post-date">' + formatDate(p.date) + stars + '</div>' +
            '<h3 class="post-title">' + esc(p.title) + '</h3>' +
            (byline.length ? '<div class="post-byline">' + byline.join(' · ') + '</div>' : '') +
            '<p class="post-excerpt">' + esc(p.excerpt) + '</p>' +
            '<span class="tag">' + esc(p.tag) + '</span>' +
          '</div>' + thumb +
        '</a></article>';
    }).join('');

    
    Array.prototype.slice.call(el.querySelectorAll('.post-thumb img')).forEach(function (im) {
      im.addEventListener('error', function () {
        var link = im.closest('.post-link');
        if (link) link.classList.remove('has-thumb');
        var t = im.closest('.post-thumb');
        if (t && t.parentNode) t.parentNode.removeChild(t);
      });
    });
  };

  
  window.renderLabelFilter = function (barId, targetId) {
    var bar = document.getElementById(barId);
    if (!bar || !window.POSTS) return;

    var labels = [];
    window.POSTS.forEach(function (p) {
      (p.labels || [p.tag]).forEach(function (l) {
        if (l && labels.indexOf(l) === -1) labels.push(l);
      });
    });
    labels.sort(function (a, b) { return a.localeCompare(b, 'ar'); });

    function paint() {
      bar.innerHTML =
        '<button class="chip' + (activeLabel ? '' : ' is-active') + '" data-label="">الكل</button>' +
        labels.map(function (l) {
          return '<button class="chip' + (activeLabel === l ? ' is-active' : '') +
            '" data-label="' + esc(l) + '">' + esc(l) + '</button>';
        }).join('');
    }

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      activeLabel = b.dataset.label;
      paint();
      window.renderPosts(targetId);
    });

    paint();
  };

  
  window.bindSearch = function (inputId, targetId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var timer = null;
    input.addEventListener('input', function () {
      var v = this.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        query = v.trim();
        window.renderPosts(targetId);
      }, 120);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        this.value = '';
        query = '';
        window.renderPosts(targetId);
      }
    });
  };

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return new Intl.DateTimeFormat('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  }
  window.formatArabicDate = formatDate;

  
  (function () {
    var prose = document.querySelector('.prose');
    if (!prose || prose.isContentEditable) return;

    var box = null, boxImg = null, closeBtn = null, lastFocus = null;

    function build() {
      box = document.createElement('div');
      box.className = 'img-lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'عرض الصورة مكبّرة');
      boxImg = document.createElement('img');
      boxImg.alt = '';
      closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'lb-close';
      closeBtn.setAttribute('aria-label', 'إغلاق');
      closeBtn.textContent = '×';
      box.appendChild(boxImg);
      box.appendChild(closeBtn);
      document.body.appendChild(box);
      box.addEventListener('click', close);              
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
      });
    }

    function open(img) {
      if (!box) build();
      lastFocus = document.activeElement;
      boxImg.src = img.currentSrc || img.src;
      boxImg.alt = img.alt || '';
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function close() {
      if (!box || !box.classList.contains('open')) return;
      box.classList.remove('open');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    prose.addEventListener('click', function (e) {
      var img = e.target.closest('img');
      if (!img || e.target.closest('a')) return;
      if (img.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      open(img);
    });
  })();
})();
