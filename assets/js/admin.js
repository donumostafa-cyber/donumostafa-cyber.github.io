

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var API = 'https://api.github.com';
  var ED = null;

  var ALL = window.POSTS || [];
  var MANUAL = window.__MANUAL_POSTS ? window.__MANUAL_POSTS.slice() : null;
  var rating = 0;

  
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {  }
    return null;
  }

  
  function log(msg, kind) {
    var el = $('log');
    el.classList.add('show');
    var line = document.createElement('div');
    if (kind) line.className = kind;
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
  function clearLog() { $('log').textContent = ''; $('log').classList.remove('show'); }

  
  function toB64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function fromB64(b64) {
    var bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  
  function siteBase() {
    var c = cfg();
    if (!c.owner) return '/';
    var owner = c.owner.toLowerCase();
    return 'https://' + owner + '.github.io/' +
      (c.repo.toLowerCase() === owner + '.github.io' ? '' : c.repo + '/');
  }

  
  function rawBase() {
    var c = cfg();
    return 'https://raw.githubusercontent.com/' + c.owner + '/' + c.repo + '/' +
      (c.branch || 'main') + '/';
  }

  
  function previewImages() {
    var c = cfg();
    if (!c.owner || !c.repo) return;
    var base = rawBase();
    Array.prototype.slice.call(ED.querySelectorAll('img')).forEach(function (img) {
      if (img.getAttribute('data-src')) return;
      var s = img.getAttribute('src') || '';
      var path = '';
      if (s.indexOf('/assets/') === 0) path = s.slice(1);
      else if (s.indexOf('../../assets/') === 0) path = s.slice(6);
      if (!path) return;
      img.setAttribute('data-src', s);
      img.src = base + path;
    });
  }

  var STATIC_PAGES = ['', 'archive/', 'library/', 'poetry/', 'timeline/', 'timeline/ladysusantimeline/'];

  function xmlEsc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  function firstImage(html) {
    var m = String(html).match(/<img[^>]*src="([^"]+)"/i);
    return m ? m[1] : '';
  }

  function sitemapXML(list) {
    var base = siteBase();
    var urls = STATIC_PAGES.map(function (pg) {
      return '  <url><loc>' + xmlEsc(base + pg) + '</loc></url>';
    });
    list.forEach(function (post) {
      urls.push('  <url><loc>' + xmlEsc(base + post.url) + '</loc><lastmod>' + post.date + '</lastmod></url>');
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') + '\n</urlset>\n';
  }

  
  function writeAux() {
    var path = 'sitemap.xml';
    return getFile(path).then(function (f) {
      return putFile(path, toB64(sitemapXML(ALL)), f && f.sha, 'تحديث ' + path);
    }).then(function () { log('    ✓ ' + path, 'ok'); });
  }

  
  function cfg() {
    return {
      owner: $('ghOwner').value.trim(),
      repo: $('ghRepo').value.trim(),
      branch: $('ghBranch').value.trim() || 'main',
      token: $('ghToken').value.trim()
    };
  }

  function gh(path, options) {
    var c = cfg();
    options = options || {};
    return fetch(API + path, {
      method: options.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + c.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (r) {
      if (r.status === 404) return null;
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data && data.message) || ('خطأ ' + r.status));
        return data;
      });
    });
  }

  
  function filePath(url) {
    return /\.html$/.test(url) ? url : url.replace(/\/?$/, '/') + 'index.html';
  }

  function getFile(path) {
    var c = cfg();
    return gh('/repos/' + c.owner + '/' + c.repo + '/contents/' + path +
      '?ref=' + encodeURIComponent(c.branch)).then(function (d) {
      if (!d) return null;
      return { sha: d.sha, text: fromB64(d.content) };
    });
  }

  function delFile(path, sha, message) {
    var c = cfg();
    return gh('/repos/' + c.owner + '/' + c.repo + '/contents/' + path, {
      method: 'DELETE',
      body: { message: message, sha: sha, branch: c.branch }
    });
  }

  function listDir(path) {
    var c = cfg();
    return gh('/repos/' + c.owner + '/' + c.repo + '/contents/' + path +
      '?ref=' + encodeURIComponent(c.branch)).then(function (d) {
      return Array.isArray(d) ? d : [];
    });
  }

  function putFile(path, contentB64, sha, message) {
    var c = cfg();
    return gh('/repos/' + c.owner + '/' + c.repo + '/contents/' + path, {
      method: 'PUT',
      body: { message: message, content: contentB64, branch: c.branch, sha: sha || undefined }
    });
  }

  
  var savedRange = null;

  function saveSel() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var r = sel.getRangeAt(0);
      if (ED.contains(r.commonAncestorContainer)) savedRange = r.cloneRange();
    }
  }

  function restoreSel() {
    ED.focus();
    if (!savedRange) return false;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }

  function hasSelection() {
    var sel = window.getSelection();
    return sel && sel.rangeCount && !sel.getRangeAt(0).collapsed;
  }

  
  function cmd(name, val) {
    try { return document.execCommand(name, false, val === undefined ? null : val); }
    catch (e) { return false; }
  }

  function exec(name, val) {
    restoreSel();
    cmd(name, val);
    saveSel();
    updateToolbar();
  }

  
  function currentBlock() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var n = sel.getRangeAt(0).startContainer;
    while (n && n !== ED) {
      if (n.nodeType === 1 && /^(P|H2|H3|H4|LI|BLOCKQUOTE|DIV)$/.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  }

  function setAlign(dir) {
    restoreSel();
    var b = currentBlock();
    if (!b) { exec(dir === 'center' ? 'justifyCenter' : dir === 'left' ? 'justifyLeft' : 'justifyRight'); return; }
    b.classList.remove('ta-right', 'ta-center', 'ta-left');
    b.style.textAlign = '';
    if (dir !== 'right') b.classList.add('ta-' + dir);
    saveSel();
    updateToolbar();
  }

  function setBlock(tag) {
    restoreSel();
    cmd('formatBlock', tag);
    saveSel();
    updateToolbar();
  }

  function setQuote(kind) {
    restoreSel();
    var b = currentBlock();
    if (b && b.tagName === 'BLOCKQUOTE') {
      
      if (b.classList.contains(kind)) { cmd('formatBlock', 'p'); saveSel(); return; }
      b.className = kind;
      saveSel();
      updateToolbar();
      return;
    }
    cmd('formatBlock', 'blockquote');
    var q = currentBlock();
    if (q && q.tagName === 'BLOCKQUOTE') q.className = kind;
    saveSel();
    updateToolbar();
    setCite();          
  }

  
  function wrapSelection(builder) {
    if (!restoreSel() || !hasSelection()) return false;
    var sel = window.getSelection();
    var range = sel.getRangeAt(0);
    var frag = range.extractContents();
    var wrapper = builder();
    wrapper.appendChild(frag);
    range.insertNode(wrapper);

    
    var r = document.createRange();
    r.selectNodeContents(wrapper);
    sel.removeAllRanges();
    sel.addRange(r);
    saveSel();
    return true;
  }

  function stripSpans(root, test) {
    Array.prototype.slice.call(root.querySelectorAll('span,font')).forEach(function (sp) {
      if (test && !test(sp)) return;
      var parent = sp.parentNode;
      while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
      parent.removeChild(sp);
    });
  }

  function applyColor(hex) {
    if (!restoreSel() || !hasSelection()) {
      log('حدّد النص الذي تريد تلوينه أولًا.', 'err');
      return;
    }
    if (!hex || hex === 'none') {
      
      var sel = window.getSelection();
      var range = sel.getRangeAt(0);
      var frag = range.extractContents();
      var box = document.createElement('span');
      box.appendChild(frag);
      stripSpans(box, function (sp) { return sp.style && sp.style.color; });
      var out = document.createDocumentFragment();
      while (box.firstChild) out.appendChild(box.firstChild);
      range.insertNode(out);
      saveSel();
      return;
    }
    wrapSelection(function () {
      var sp = document.createElement('span');
      sp.style.color = hex;
      return sp;
    });
  }

  
  var BASE_FS = 19.5;                 
  var FS_STEP = 2, FS_MIN = 12, FS_MAX = 48;

  function sizedSpan(sp) {
    return /fs-(sm|lg|xl)/.test(sp.className) || (sp.style && sp.style.fontSize);
  }

  function applySize(dir) {
    if (!restoreSel() || !hasSelection()) {
      log('حدّد النص الذي تريد تغيير حجمه أولًا.', 'err');
      return;
    }
    var sel = window.getSelection();
    var range = sel.getRangeAt(0);

    
    var probeNode = range.commonAncestorContainer;
    if (probeNode.nodeType === 3) probeNode = probeNode.parentNode;
    var cur = parseFloat(window.getComputedStyle(probeNode).fontSize) || BASE_FS;
    var px = Math.round(cur) + dir * FS_STEP;
    if (px < FS_MIN) { px = FS_MIN; log('هذا أصغر حجم متاح.', 'dim'); }
    if (px > FS_MAX) { px = FS_MAX; log('هذا أكبر حجم متاح.', 'dim'); }

    
    for (;;) {
      var anc = range.commonAncestorContainer;
      if (anc.nodeType === 3) anc = anc.parentNode;
      if (!anc || anc === ED || !ED.contains(anc) ||
          anc.tagName !== 'SPAN' || !sizedSpan(anc)) break;
      var pr = document.createRange();
      pr.selectNodeContents(anc);
      if (range.compareBoundaryPoints(Range.START_TO_START, pr) <= 0 &&
          range.compareBoundaryPoints(Range.END_TO_END, pr) >= 0) {
        range.selectNode(anc);
      } else break;
    }

    var frag = range.extractContents();
    var box = document.createElement('span');
    box.appendChild(frag);
    stripSpans(box, sizedSpan);

    if (Math.abs(px - BASE_FS) < 1.2) {         
      var out = document.createDocumentFragment();
      while (box.firstChild) out.appendChild(box.firstChild);
      range.insertNode(out);
      var host = range.commonAncestorContainer;
      (host.nodeType === 1 ? host : host.parentNode).normalize();   
    } else {
      box.style.fontSize = px + 'px';
      range.insertNode(box);
      var r = document.createRange();
      r.selectNodeContents(box);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    Array.prototype.slice.call(ED.querySelectorAll('span')).forEach(function (sp) {
      if (sizedSpan(sp) && !sp.textContent && !sp.querySelector('img')) {
        sp.parentNode.removeChild(sp);
      }
    });
    saveSel();
    updateToolbar();
  }

  function clearFormatting() {
    if (!restoreSel() || !hasSelection()) return;
    cmd('removeFormat');
    var sel = window.getSelection();
    var range = sel.getRangeAt(0);
    var frag = range.extractContents();
    var box = document.createElement('span');
    box.appendChild(frag);
    stripSpans(box);
    var out = document.createDocumentFragment();
    while (box.firstChild) out.appendChild(box.firstChild);
    range.insertNode(out);
    saveSel();
    updateToolbar();
  }

  
  function quoteAncestor() {
    var n = currentBlock();
    while (n && n !== ED && n.tagName !== 'BLOCKQUOTE') n = n.parentNode;
    return (n && n.tagName === 'BLOCKQUOTE') ? n : null;
  }

  function arDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; });
  }

  function setCite(preset) {
    restoreSel();
    var q = quoteAncestor();
    if (!q) { log('ضع المؤشر داخل اقتباس أولًا، ثم اضغط «المصدر / الصفحة».', 'err'); return; }

    var existing = q.querySelector('cite');
    var val = prompt('المصدر أو رقم الصفحة (اتركه فارغًا لحذفه):',
      existing ? existing.textContent : (preset || 'ص '));
    if (val === null) return;
    val = arDigits(val.trim());

    if (!val) { if (existing) existing.parentNode.removeChild(existing); saveSel(); return; }
    if (!existing) { existing = document.createElement('cite'); q.appendChild(existing); }
    existing.textContent = val;
    saveSel();
  }

  
  function openPoemModal() {
    saveSel();                         
    $('poemModal').classList.add('open');
    $('poemText').focus();
  }

  function closePoemModal() {
    $('poemModal').classList.remove('open');
  }

  function doInsertPoem() {
    var lines = $('poemText').value.split('\n')
      .map(function (l) { return l.trim(); })
      .filter(Boolean);
    if (!lines.length) {
      log('اكتب الأبيات أولًا: الصدر في سطر والعجز في السطر الذي يليه.', 'err');
      return;
    }

    
    var rows = [];
    for (var k = 0; k < lines.length; k += 2) {
      rows.push(lines[k + 1]
        ? '<span class="sadr">' + esc(lines[k]) + '</span><span class="ajuz">' + esc(lines[k + 1]) + '</span>'
        : '<span class="sadr single">' + esc(lines[k]) + '</span>');
    }
    var html = '<blockquote class="poem">' + rows.join('') + '</blockquote><p><br></p>';

    
    restoreSel();
    var range = null;
    var sel = window.getSelection();
    if (sel && sel.rangeCount && ED.contains(sel.getRangeAt(0).startContainer)) {
      range = sel.getRangeAt(0);
      var blk = range.startContainer;
      while (blk && blk.parentNode !== ED) blk = blk.parentNode;
      if (blk && blk !== ED) {
        range = document.createRange();
        range.setStartAfter(blk);
        range.collapse(true);
      }
    } else {
      range = document.createRange();
      range.selectNodeContents(ED);
      range.collapse(false);            
    }

    var holder = document.createElement('div');
    holder.innerHTML = html;
    var nodes = Array.prototype.slice.call(holder.childNodes);
    nodes.forEach(function (n) {
      range.insertNode(n);
      range.setStartAfter(n);
      range.collapse(true);
    });
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    saveSel();
    $('poemText').value = '';           
    closePoemModal();
  }

  
  function insertImageByURL() {
    saveSel();
    var url = prompt('رابط الصورة المباشر (ينتهي عادة بـ .jpg أو .png أو .webp):', 'https://');
    if (url === null) return;
    url = url.trim();
    if (url === 'https://' || !/^https?:\/\/.+/i.test(url)) {
      log('الرابط غير صالح — يجب أن يبدأ بـ https ويشير إلى صورة مباشرة.', 'err');
      return;
    }
    var alt = prompt('وصف الصورة بجملة قصيرة (يظهر لمحركات البحث وقارئ الشاشة):', '');
    if (alt === null) return;

    restoreSel();
    var tag = '<img src="' + esc(url) + '" alt="' + esc(alt.trim()) +
      '" loading="lazy" decoding="async">';
    var ok = cmd('insertHTML', tag + '<p><br></p>');
    if (!ok) {
      var img = document.createElement('img');
      img.src = url; img.alt = alt.trim();
      ED.appendChild(img);
      ED.appendChild(document.createElement('p'));
    }
    saveSel();
    log('أُدرجت صورة الرابط. إن لم تظهر في المحرر فالموقع المصدر يمنع الربط المباشر.', 'ok');
  }

  
  function updateToolbar() {
    var b = currentBlock();
    var tag = b ? b.tagName.toLowerCase() : 'p';
    var qcls = b && b.tagName === 'BLOCKQUOTE' ? b.className : '';

    Array.prototype.slice.call(document.querySelectorAll('#tools button')).forEach(function (btn) {
      var on = false;
      if (btn.dataset.block) on = (btn.dataset.block === tag);
      else if (btn.dataset.cmd && /bold|italic|underline/.test(btn.dataset.cmd)) {
        try { on = document.queryCommandState(btn.dataset.cmd); } catch (e) {}
      } else if (btn.dataset.quote) on = (qcls.indexOf(btn.dataset.quote) !== -1);
      else if (btn.dataset.align) {
        var a = b ? (b.classList.contains('ta-center') ? 'center'
          : b.classList.contains('ta-left') ? 'left' : 'right') : 'right';
        on = (btn.dataset.align === a);
      }
      btn.classList.toggle('on', !!on);
    });
  }

  
  var CTX = [
    { label: 'عنوان', act: function () { setBlock('h2'); } },
    { label: 'عنوان أصغر', act: function () { setBlock('h3'); } },
    { label: 'نص عادي', act: function () { setBlock('p'); } },
    { sep: true },
    { label: 'عريض', act: function () { exec('bold'); } },
    { label: 'مائل', act: function () { exec('italic'); } },
    { label: 'لون النص', act: function () { $('colorPick').click(); } },
    { sep: true },
    { label: 'رابط', act: function () { addLink(); } },
    { label: 'صورة من الجهاز', act: function () { $('imgInput').click(); } },
    { label: 'صورة برابط', act: function () { insertImageByURL(); } },
    { sep: true },
    { label: 'اقتباس مميّز', act: function () { setQuote('pullquote'); } },
    { label: 'اقتباس بسيط', act: function () { setQuote('quote-plain'); } },
    { label: 'المصدر / الصفحة', act: function () { setCite(); } },
    { label: 'أبيات شعر', act: function () { openPoemModal(); } },
    { sep: true },
    { label: 'وسط الصفحة', act: function () { setAlign('center'); } },
    { label: 'إلى اليمين', act: function () { setAlign('right'); } },
    { label: 'أزل التنسيق', act: function () { clearFormatting(); } }
  ];

  function buildCtx() {
    var m = $('ctxMenu');
    m.innerHTML = '';
    CTX.forEach(function (item) {
      if (item.sep) { m.appendChild(document.createElement('hr')); return; }
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.label;
      b.addEventListener('click', function () { hideCtx(); item.act(); });
      m.appendChild(b);
    });
  }
  function showCtx(x, y) {
    var m = $('ctxMenu');
    m.classList.add('show');
    var w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
  }
  function hideCtx() { $('ctxMenu').classList.remove('show'); }

  
  var KEEP = { P: 1, H2: 1, H3: 1, H4: 1, STRONG: 1, EM: 1, U: 1, S: 1, UL: 1, OL: 1,
               LI: 1, BLOCKQUOTE: 1, A: 1, IMG: 1, BR: 1, HR: 1, CITE: 1, SPAN: 1 };
  var RENAME = { B: 'STRONG', I: 'EM', DIV: 'P', H1: 'H2', H5: 'H4', H6: 'H4',
                 STRIKE: 'S', DEL: 'S', FONT: 'SPAN' };
  var BLOCKS = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
                 UL: 1, OL: 1, BLOCKQUOTE: 1, HR: 1, IMG: 1, PRE: 1, TABLE: 1 };
  var CLASS_OK = /^(ta-(right|center|left)|fs-(sm|lg|xl)|pullquote|quote-plain|bayt-line|poem|bayt-row|single|sadr|ajuz|word)$/;
  var FONT_SIZE = { '1': 'fs-sm', '2': 'fs-sm', '3': '', '4': 'fs-lg', '5': 'fs-lg', '6': 'fs-xl', '7': 'fs-xl' };

  function toHex(c) {
    if (!c) return '';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
    var m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (!m) return '';
    return '#' + [1, 2, 3].map(function (i) {
      return ('0' + parseInt(m[i], 10).toString(16)).slice(-2);
    }).join('').toLowerCase();
  }

  function keptClasses(el) {
    var out = [];
    var ta = el.style && el.style.textAlign;
    if (ta === 'center') out.push('ta-center');
    else if (ta === 'left') out.push('ta-left');
    else if (ta === 'right') out.push('ta-right');
    (el.getAttribute('class') || '').split(/\s+/).forEach(function (k) {
      if (CLASS_OK.test(k) && out.indexOf(k) === -1) out.push(k);
    });
    if (el.tagName === 'FONT') {
      var fs = FONT_SIZE[el.getAttribute('size')];
      if (fs && out.indexOf(fs) === -1) out.push(fs);
    }
    return out;
  }

  function cleanNode(node, out) {
    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (child.nodeType === 3) { out.push(esc(child.nodeValue)); return; }
      if (child.nodeType !== 1) return;

      var tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;

      var color = toHex((child.style && child.style.color) || child.getAttribute('color'));
      var fsz = '';
      var fsRaw = child.style && child.style.fontSize;
      if (fsRaw && /^\d+(\.\d+)?px$/.test(fsRaw)) {
        var fsv = Math.round(parseFloat(fsRaw));
        if (fsv >= 12 && fsv <= 48) fsz = fsv + 'px';
      }
      var classes = keptClasses(child);
      if (RENAME[tag]) tag = RENAME[tag];

      if (tag === 'BR') { out.push('<br>'); return; }
      if (tag === 'HR') { out.push('<hr>'); return; }

      if (tag === 'IMG') {
        var src = child.getAttribute('data-src') || child.getAttribute('src') || '';
        if (!src || src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return;
        var ia = '<img src="' + esc(src) + '" alt="' + esc(child.getAttribute('alt') || '') + '"';
        var iw = parseInt(child.getAttribute('width'), 10);
        var ih = parseInt(child.getAttribute('height'), 10);
        if (iw > 0 && ih > 0) ia += ' width="' + iw + '" height="' + ih + '"';
        out.push(ia + ' loading="lazy" decoding="async">');
        return;
      }

      if (!KEEP[tag]) { cleanNode(child, out); return; }

      
      if (tag === 'SPAN' && !color && !fsz && !classes.length) { cleanNode(child, out); return; }

      var attrs = '';
      if (tag === 'A') {
        var href = child.getAttribute('href') || '';
        if (!href) { cleanNode(child, out); return; }
        attrs += ' href="' + esc(href) + '"';
        if (/^https?:/i.test(href)) attrs += ' target="_blank" rel="noopener"';
      }
      if (tag === 'BLOCKQUOTE' && !classes.length) classes.push('pullquote');
      if (classes.length) attrs += ' class="' + classes.join(' ') + '"';
      var styles = [];
      if (color) styles.push('color:' + color);
      if (fsz) styles.push('font-size:' + fsz);
      if (styles.length) attrs += ' style="' + styles.join(';') + '"';

      var inner = [];
      cleanNode(child, inner);
      var content = inner.join('');
      if (!content.replace(/<br>|\s|&nbsp;/g, '') && tag !== 'IMG') return;
      out.push('<' + tag.toLowerCase() + attrs + '>' + content + '</' + tag.toLowerCase() + '>');
    });
  }

  function editorHTML() {
    var out = [], buf = [];
    function one(node) { var acc = []; cleanNode({ childNodes: [node] }, acc); return acc.join(''); }
    function flush() {
      var s = buf.join('').trim();
      buf = [];
      if (s && s.replace(/<br>|&nbsp;|\s/g, '')) out.push('<p>' + s + '</p>');
    }
    Array.prototype.forEach.call(ED.childNodes, function (n) {
      if (n.nodeType === 1 && BLOCKS[n.tagName]) { flush(); out.push(one(n)); }
      else buf.push(one(n));
    });
    flush();
    return out.join('')
      .replace(/<p>\s*<\/p>/g, '')
      .replace(/\s+/g, ' ')
      .replace(/> </g, '>\n<')
      .trim();
  }

  function plainText(h) {
    var d = document.createElement('div');
    d.innerHTML = String(h).replace(/<(?:br|cite|\/p|\/h2|\/h3|\/h4|\/li|\/cite|\/blockquote)[^>]*>/g, ' ');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو',
                   'أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  function arNum(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; });
  }
  function arabicDate(iso) {
    var p = iso.split('-');
    return arNum(parseInt(p[2], 10)) + ' ' + AR_MONTHS[parseInt(p[1], 10) - 1] + ' ' + arNum(p[0]);
  }
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

  function makeSlug() {
    var title = $('fTitle').value.trim();
    var date = $('fDate').value || today();
    var latin = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    var base = date.slice(0, 7) + '-' + (latin || 'tadwina');
    var used = ALL.map(function (p) { return p.url; });
    var slug = base, n = 2;
    while (used.indexOf('posts/' + slug + '/') !== -1) { slug = base + '-' + n; n++; }
    return slug;
  }

  function autoExcerpt() {
    var t = plainText(editorHTML());
    if (t.length <= 165) return t;
    var cut = t.slice(0, 165), sp = cut.lastIndexOf(' ');
    return (sp > 60 ? cut.slice(0, sp) : cut).replace(/[،.\s]+$/, '') + '…';
  }

  function factsHTML(d, indent) {
    var f = [];
    if (d.author) f.push('<div class="fact"><span class="k">المؤلف</span><span class="v">' + esc(d.author) + '</span></div>');
    if (d.pages) f.push('<div class="fact"><span class="k">الصفحات</span><span class="v">' + arNum(d.pages) + '</span></div>');
    if (d.rating) f.push('<div class="fact"><span class="k">التقييم</span><span class="v stars">' + stars(d.rating) + '</span></div>');
    if (!f.length) return '';
    var pad = indent || '';
    return pad + '<div class="book-facts">\n' + f.map(function (x) { return pad + '  ' + x; }).join('\n') + '\n' + pad + '</div>';
  }

  function renderHead() {
    var d = fields();
    $('headPreview').innerHTML =
      '<span class="tag">' + esc(d.tag || 'تصنيف') + '</span>' +
      '<h1>' + esc(d.title || 'عنوان التدوينة') + '</h1>' +
      '<div class="article-meta">' + metaLine(d) + '</div>' +
      factsHTML(d);
  }

  function metaLine(d) {
    return (d.publisher ? esc(d.publisher) + ' | ' : '') + arabicDate(d.date);
  }

  function fields() {
    return {
      title: $('fTitle').value.trim(),
      date: $('fDate').value || today(),
      tag: $('fTag').value.trim() || 'تدوينة',
      author: $('fAuthor').value.trim(),
      publisher: $('fPublisher').value.trim(),
      pages: $('fPages').value.trim(),
      rating: rating
    };
  }

  function setRating(n) {
    rating = n;
    Array.prototype.slice.call(document.querySelectorAll('#ratingPick button')).forEach(function (b) {
      b.classList.toggle('on', Number(b.dataset.v) <= n);
    });
    renderHead();
  }

  
  function pageHTML(d) {
    var facts = factsHTML(d, '      ');
    var base = siteBase();
    var pageURL = base + d.url;
    var img = firstImage(d.body);
    var ogImg = img ? (/^https?:/i.test(img) ? img : base + img.replace(/^\//, '')) : '';
    if (!ogImg) ogImg = base + 'assets/img/og-cover.png';   
    return '<!doctype html>\n' +
'<html lang="ar" dir="rtl">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
'<title>' + esc(d.title) + ' | خالد الحمدان</title>\n' +
'<meta name="description" content="' + esc(d.excerpt.slice(0, 150)) + '">\n' +
'<link rel="canonical" href="' + esc(pageURL) + '">\n' +
'<meta property="og:site_name" content="خالد الحمدان — مدونة قراءات">\n' +
'<meta property="og:type" content="article">\n' +
'<meta property="og:title" content="' + esc(d.title) + '">\n' +
'<meta property="og:description" content="' + esc(d.excerpt.slice(0, 150)) + '">\n' +
'<meta property="og:url" content="' + esc(pageURL) + '">\n' +
'<meta property="og:locale" content="ar_AR">\n' +
'<meta property="article:published_time" content="' + esc(d.date) + '">\n' +
'<meta property="og:image" content="' + esc(ogImg) + '">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta name="theme-color" content="#fdfaf4">\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'<link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&amp;family=Aref+Ruqaa:wght@400;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;family=Noto+Naskh+Arabic:wght@400;500;600;700&amp;display=swap" rel="stylesheet">\n' +
'<link rel="stylesheet" href="../../assets/css/site.css">\n' +
'<link rel="stylesheet" href="../../assets/css/blog.css">\n' +
'</head>\n\n' +
'<body data-root="../../" data-page="blog">\n' +
'<header id="siteHeader"></header>\n\n' +
'<main class="wrap">\n' +
'  <article class="sheet">\n' +
'    <div class="article-head">\n' +
'      <span class="tag">' + esc(d.tag) + '</span>\n' +
'      <h1>' + esc(d.title) + '</h1>\n' +
'      <div class="article-meta">' + metaLine(d) + '</div>\n' +
(facts ? facts + '\n' : '') +
'    </div>\n\n' +
'    <div class="prose">\n' +
'<!--PROSE-START-->\n' + d.body + '\n<!--PROSE-END-->\n' +
'    </div>\n\n' +
'    <div class="article-nav">\n' +
'      <a class="btn btn-ghost" href="../../">← عودة إلى المدونة</a>\n' +
'      <a class="btn btn-ghost" href="../../archive/">كل التدوينات</a>\n' +
'    </div>\n' +
'  </article>\n' +
'\n' +
'  <section class="sheet comments-card" id="commentsCard">\n' +
'    <h2>التعليقات</h2>\n' +
'    <div id="comments"></div>\n' +
'  </section>\n' +
'</main>\n\n' +
'<footer id="siteFooter"></footer>\n' +
'<script src="../../assets/js/site.js"></script>\n' +
'<script src="../../assets/js/comments.js"></script>\n' +
'</body>\n' +
'</html>\n';
  }

  function jsStr(s) {
    return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ') + "'";
  }

  function entryLines(p) {
    var s = '  {\n' +
      '    title: ' + jsStr(p.title) + ',\n' +
      '    date: ' + jsStr(p.date) + ',\n' +
      '    tag: ' + jsStr(p.tag) + ',\n' +
      '    url: ' + jsStr(p.url) + ',\n';
    if (p.image) s += '    image: ' + jsStr(p.image) + ',\n';
    if (p.author) s += '    author: ' + jsStr(p.author) + ',\n';
    if (p.pages) s += '    pages: ' + jsStr(p.pages) + ',\n';
    if (p.rating) s += '    rating: ' + p.rating + ',\n';
    if (p.publisher) s += '    publisher: ' + jsStr(p.publisher) + ',\n';
    if (p.labels && p.labels.length) s += '    labels: [' + p.labels.map(jsStr).join(', ') + '],\n';
    return s + '    excerpt: ' + jsStr(p.excerpt) + '\n  },\n';
  }

  function postsJS(list) {
    return '/* ============================================================\n' +
      '   فهرس التدوينات.\n' +
      '   يُحدَّث تلقائيًا من لوحة الكتابة (admin.html)،\n' +
      '   ويمكن تحريره يدويًا بنفس الصيغة.\n' +
      '   ============================================================ */\n\n' +
      'window.POSTS = [\n' + list.map(entryLines).join('') + '];\n';
  }

  function bloggerJS(list) {
    return '/* فهرس التدوينات المنقولة من Blogger — تُحدّثه أداة الاستيراد. */\n\n' +
      'window.POSTS = (window.POSTS || []).concat([\n' + list.map(entryLines).join('') + ']);\n';
  }

  
  function publish() {
    clearLog();
    var c = cfg();
    if (!c.owner || !c.repo || !c.token) {
      log('أكمل بيانات الاتصال أولًا (افتح «الاتصال بالمستودع»).', 'err');
      $('settingsPanel').open = true;
      return;
    }

    var f = fields();
    var body = editorHTML();
    if (!f.title) { log('العنوان فارغ.', 'err'); return; }
    if (!body) { log('التدوينة فارغة.', 'err'); return; }

    var slug = ($('fSlug').value.trim() || makeSlug()).replace(/[^a-z0-9-]/g, '');
    $('fSlug').value = slug;

    var data = {
      title: f.title, date: f.date, tag: f.tag,
      author: f.author, pages: f.pages, rating: f.rating, publisher: f.publisher,
      excerpt: $('fExcerpt').value.trim() || autoExcerpt(),
      url: 'posts/' + slug + '/',
      image: firstImage(body),           
      body: body
    };

    var btn = $('publishBtn');
    btn.disabled = true;
    btn.textContent = 'جارٍ النشر…';
    log('١ / ٤  أرفع صفحة التدوينة…', 'dim');

    getFile(filePath(data.url))
      .then(function (existing) {
        return putFile(filePath(data.url), toB64(pageHTML(data)), existing && existing.sha,
          (existing ? 'تعديل: ' : 'تدوينة جديدة: ') + data.title);
      })
      .then(function () {
        log('    ✓ ' + filePath(data.url), 'ok');
        log('٢ / ٤  أحدّث فهرس التدوينات…', 'dim');

        if (!MANUAL) {
          throw new Error('لم أستطع تمييز تدويناتك عن المنقولة من Blogger. ' +
            'رُفعت صفحة التدوينة، لكنّي لم أحدّث الفهرس حتى لا أمسح شيئًا. ' +
            'أعد تحميل الصفحة وحاول مرة أخرى.');
        }
        var manual = MANUAL.slice();
        var imported = ALL.slice(manual.length);
        var entry = {
          title: data.title, date: data.date, tag: data.tag, url: data.url,
          author: data.author, pages: data.pages, rating: data.rating,
          publisher: data.publisher, image: data.image,
          labels: [data.tag], excerpt: data.excerpt
        };

        var inImported = imported.some(function (p) { return p.url === data.url; });
        var target = inImported ? imported : manual;
        var idx = -1;
        target.forEach(function (p, i) { if (p.url === data.url) idx = i; });
        if (idx === -1) target.unshift(entry); else target[idx] = entry;
        target.sort(function (a, b) { return b.date.localeCompare(a.date); });

        var before = inImported ? ALL.slice(manual.length).length : MANUAL.length;
        var after = target.length;
        var expected = before + (idx === -1 ? 1 : 0);
        if (after !== expected) {
          throw new Error('توقّفت: الفهرس الجديد فيه ' + after + ' تدوينة والمتوقع ' +
            expected + '. لم أكتب شيئًا حفاظًا على تدويناتك.');
        }

        var path = inImported ? 'assets/data/posts-blogger.js' : 'assets/data/posts.js';
        var text = inImported ? bloggerJS(imported) : postsJS(manual);

        ALL = manual.concat(imported);
        MANUAL = manual;

        return getFile(path).then(function (file) {
          return putFile(path, toB64(text), file && file.sha, 'تحديث فهرس التدوينات');
        }).then(function () { return path; });
      })
      .then(function (path) {
        log('    ✓ ' + path, 'ok');
        log('٣ / ٤  أحدّث خريطة الموقع…', 'dim');
        return writeAux();
      })
      .then(function () {
        log('٤ / ٤  تمّ. سيظهر الموقع محدَّثًا خلال دقيقة تقريبًا.', 'ok');
        log('    ' + siteBase() + data.url, 'dim');
        store('kr_draft', null);
        $('draftInfo').textContent = '';
        refreshPicker();
      })
      .catch(function (err) {
        log('توقّف: ' + err.message, 'err');
        if (/Bad credentials|401/.test(err.message)) log('الرمز غير صحيح أو انتهت صلاحيته.', 'err');
        else if (/Not Found|404/.test(err.message)) log('تحقّق من اسم المستخدم والمستودع وصلاحية Contents.', 'err');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'انشر على الموقع';
      });
  }

  
  function deletePost() {
    var url = $('postPicker').value;
    if (!url) { log('اختر التدوينة التي تريد حذفها من قائمة «ماذا تكتب؟».', 'err'); return; }

    var meta = null;
    ALL.forEach(function (p) { if (p.url === url) meta = p; });
    if (!meta) return;

    if (!confirm('سيُحذف نهائيًا:\n\n«' + meta.title + '»\n\n' +
        'الصفحة وصورها وسطرها في الفهرس. لا يمكن التراجع من هنا.\nأتريد المتابعة؟')) return;

    var withImages = confirm('أحذف صور هذه التدوينة أيضًا من assets/img/posts/ ؟\n\n' +
      'اضغط «إلغاء» لإبقائها.');

    var slug = url.replace('posts/', '').replace(/\/$|\.html$/, '');
    var btn = $('deleteBtn');
    btn.disabled = true;
    btn.textContent = 'جارٍ الحذف…';

    clearLog();
    log('١ / ٤  أحذف صفحة التدوينة…', 'dim');

    getFile(filePath(url))
      .then(function (f) {
        if (!f) { log('    (الصفحة محذوفة أصلًا)', 'dim'); return null; }
        return delFile(filePath(url), f.sha, 'حذف: ' + meta.title);
      })
      .then(function () {
        log('    ✓ ' + filePath(url), 'ok');
        if (!withImages) return;
        log('٢ / ٤  أحذف الصور…', 'dim');
        return listDir('assets/img/posts').then(function (files) {
          var mine = files.filter(function (f) { return f.name.indexOf(slug + '-') === 0; });
          if (!mine.length) { log('    (لا صور لهذه التدوينة)', 'dim'); return; }
          return mine.reduce(function (chain, f) {
            return chain.then(function () {
              return delFile(f.path, f.sha, 'حذف صورة: ' + f.name)
                .then(function () { log('    ✓ ' + f.name, 'ok'); });
            });
          }, Promise.resolve());
        });
      })
      .then(function () {
        log('٣ / ٤  أحدّث فهرس التدوينات…', 'dim');
        if (!MANUAL) throw new Error('لم أستطع تمييز التدوينات؛ لم أحدّث الفهرس.');

        var manual = MANUAL.slice();
        var imported = ALL.slice(manual.length);
        var inImported = imported.some(function (p) { return p.url === url; });
        var target = inImported ? imported : manual;
        var before = target.length;
        var after = target.filter(function (p) { return p.url !== url; });

        if (after.length !== before - 1) {
          throw new Error('توقّفت: لم أجد التدوينة في الفهرس مرة واحدة بالضبط.');
        }

        if (inImported) imported = after; else manual = after;
        ALL = manual.concat(imported);
        MANUAL = manual;

        var path = inImported ? 'assets/data/posts-blogger.js' : 'assets/data/posts.js';
        var text = inImported ? bloggerJS(imported) : postsJS(manual);
        return getFile(path).then(function (file) {
          return putFile(path, toB64(text), file && file.sha, 'حذف من الفهرس: ' + meta.title);
        }).then(function () { return path; });
      })
      .then(function (path) {
        log('    ✓ ' + path, 'ok');
        log('٤ / ٤  أحدّث خريطة الموقع…', 'dim');
        return writeAux();
      })
      .then(function () {
        log('تمّ الحذف. ستختفي من الموقع خلال دقيقة تقريبًا.', 'ok');
        newPost();
        refreshPicker();
      })
      .catch(function (err) { log('توقّف: ' + err.message, 'err'); })
      .then(function () {
        btn.textContent = 'احذف التدوينة';
        btn.disabled = !$('postPicker').value;
      });
  }

  
  function refreshPicker() {
    var sel = $('postPicker');
    sel.innerHTML = '<option value="">— تدوينة جديدة —</option>';
    ALL.slice().sort(function (a, b) { return b.date.localeCompare(a.date); })
      .forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.url;
        o.textContent = p.date + ' · ' + p.title;
        sel.appendChild(o);
      });
    var tags = [];
    ALL.forEach(function (p) {
      (p.labels || [p.tag]).forEach(function (t) {
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
    });
    $('tagList').innerHTML = tags.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('');
  }

  function openPost(url) {
    if (!url) { newPost(); return; }
    var meta = null;
    ALL.forEach(function (p) { if (p.url === url) meta = p; });
    if (!meta) return;

    clearLog();
    log('أفتح التدوينة…', 'dim');

    getFile(filePath(url)).then(function (f) {
      if (!f) { log('لم أجد الملف في المستودع.', 'err'); return; }
      var m = f.text.match(/<!--PROSE-START-->([\s\S]*?)<!--PROSE-END-->/);
      if (!m) m = f.text.match(/<div class="prose">([\s\S]*?)<\/div>\s*<div class="article-nav">/);
      if (!m) { log('تعذّر العثور على نص التدوينة داخل الصفحة.', 'err'); return; }

      $('fTitle').value = meta.title;
      $('fDate').value = meta.date;
      $('fTag').value = meta.tag;
      $('fAuthor').value = meta.author || '';
      $('fPublisher').value = meta.publisher || '';
      $('fPages').value = meta.pages || '';
      setRating(meta.rating || 0);
      $('fSlug').value = url.replace('posts/', '').replace(/\/$|\.html$/, '');
      $('fExcerpt').value = meta.excerpt || '';
      ED.innerHTML = m[1].trim();
      previewImages();
      renderHead();
      updateCount();
      log('✓ جاهزة للتعديل. النشر سيستبدل الصفحة القديمة.', 'ok');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) {
      log('تعذّر الفتح: ' + e.message + ' — تحقّق من الاتصال بالمستودع.', 'err');
    });
  }

  function newPost() {
    ['fTitle', 'fTag', 'fSlug', 'fExcerpt', 'fAuthor', 'fPages'].forEach(function (id) { $(id).value = ''; });
    $('fPublisher').value = 'خالد الحمدان';
    $('fDate').value = today();
    setRating(0);
    ED.innerHTML = '<p><br></p>';
    $('postPicker').value = '';
    renderHead();
    updateCount();
  }

  
  function shrink(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        
        var data = canvas.toDataURL('image/webp', quality);
        var webp = data.indexOf('data:image/webp') === 0;
        if (!webp) data = canvas.toDataURL('image/jpeg', quality);
        resolve({ b64: data.split(',')[1], w: cw, h: ch, ext: webp ? 'webp' : 'jpg' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذّرت قراءة الصورة')); };
      img.src = url;
    });
  }

  function uploadImage(file) {
    var c = cfg();
    if (!c.token || !c.owner || !c.repo) {
      log('أكمل بيانات الاتصال قبل رفع الصور (افتح «الاتصال بالمستودع»).', 'err');
      $('settingsPanel').open = true;
      return;
    }

    var alt = prompt('وصف الصورة بجملة قصيرة (يظهر لمحركات البحث وقارئ الشاشة،\nويظهر للقارئ إن تعطّل تحميل الصورة):', '');
    if (alt === null) return;            
    alt = alt.trim();

    var slug = $('fSlug').value.trim() || makeSlug();
    $('fSlug').value = slug;
    var stamp = slug + '-' + Date.now().toString(36);

    clearLog();
    log('أُصغّر الصورة… (' + Math.round(file.size / 1024) + ' كيلوبايت)', 'dim');

    shrink(file, 1600, 0.85)
      .then(function (out) {
        var name = stamp + '.' + out.ext;
        var path = 'assets/img/posts/' + name;
        log('    ' + out.w + '×' + out.h + ' · ' + Math.round(out.b64.length * 0.75 / 1024) +
            ' كيلوبايت · ' + out.ext.toUpperCase(), 'dim');
        log('أرفعها…', 'dim');
        return putFile(path, out.b64, null, 'صورة: ' + name).then(function () { return { out: out, path: path }; });
      })
      .then(function (r) {
        log('✓ رُفعت: /' + r.path, 'ok');
        restoreSel();
        var display = rawBase() + r.path;   
        var tag = '<img src="' + esc(display) + '" data-src="/' + r.path +
          '" alt="' + esc(alt) + '" width="' + r.out.w +
          '" height="' + r.out.h + '" loading="lazy" decoding="async">';
        var ok = cmd('insertHTML', tag + '<p><br></p>');
        if (!ok) {                       
          var img = document.createElement('img');
          img.src = display;
          img.setAttribute('data-src', '/' + r.path);
          img.alt = alt;
          img.width = r.out.w;
          img.height = r.out.h;
          ED.appendChild(img);
          ED.appendChild(document.createElement('p'));
        }
        saveSel();
        log('✓ أُدرجت في مكان المؤشر.' + (alt ? '' : ' (بلا وصف — يمكنك إضافته لاحقًا)'), 'ok');
      })
      .catch(function (e) {
        log('تعذّر رفع الصورة: ' + e.message, 'err');
        if (/too large|413/i.test(e.message)) log('جرّب صورة أصغر.', 'err');
      });
  }

  function addLink() {
    saveSel();
    var url = prompt('الرابط:', 'https://');
    if (!url) return;
    restoreSel();
    if (hasSelection()) cmd('createLink', url);
    else cmd('insertHTML',
      '<a href="' + esc(url) + '">' + esc(url) + '</a>');
    saveSel();
  }

  
  function saveDraft() {
    var f = fields();
    store('kr_draft', JSON.stringify({
      title: f.title, date: f.date, tag: f.tag, author: f.author,
      pages: f.pages, rating: f.rating, publisher: f.publisher, slug: $('fSlug').value,
      excerpt: $('fExcerpt').value, body: ED.innerHTML
    }));
    $('draftInfo').textContent = 'حُفظت المسودة ' + new Date().toLocaleTimeString('ar-KW');
  }

  function loadDraft() {
    var raw = store('kr_draft');
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      if (!d.title && !d.body) return;
      $('fTitle').value = d.title || '';
      $('fDate').value = d.date || today();
      $('fTag').value = d.tag || '';
      $('fAuthor').value = d.author || '';
      $('fPages').value = d.pages || '';
      $('fPublisher').value = d.publisher || 'خالد الحمدان';
      setRating(d.rating || 0);
      $('fSlug').value = d.slug || '';
      $('fExcerpt').value = d.excerpt || '';
      ED.innerHTML = d.body || '<p><br></p>';
      previewImages();
      $('draftInfo').textContent = 'استُعيدت مسودة محفوظة';
    } catch (e) {}
  }

  function updateCount() {
    var n = ($('fExcerpt').value || autoExcerpt()).length;
    $('excerptCount').textContent = '· ' + n + ' حرفًا';
  }

  function setConn(ok, text) {
    $('connState').innerHTML = '<span class="status-dot ' + (ok ? 'on' : 'off') + '"></span>' +
      '<span class="muted">' + esc(text) + '</span>';
  }

  
  function init() {
    ED = $('editor');

    ['ghOwner', 'ghRepo', 'ghBranch'].forEach(function (id) {
      $(id).value = store('kr_' + id) || $(id).value;
      $(id).addEventListener('input', function () { store('kr_' + id, $(id).value); });
    });
    $('ghToken').value = store('kr_token') || '';
    $('rememberToken').checked = store('kr_remember') !== 'no';
    $('ghToken').addEventListener('input', function () {
      if ($('rememberToken').checked) store('kr_token', $('ghToken').value);
    });
    $('rememberToken').addEventListener('change', function () {
      store('kr_remember', this.checked ? 'yes' : 'no');
      store('kr_token', this.checked ? $('ghToken').value : null);
    });
    $('forgetBtn').addEventListener('click', function () {
      store('kr_token', null);
      $('ghToken').value = '';
      setConn(false, 'مُسح الرمز');
    });

    $('testBtn').addEventListener('click', function () {
      clearLog();
      var c = cfg();
      if (!c.owner || !c.repo || !c.token) { log('أكمل الحقول أولًا.', 'err'); return; }
      log('أتحقّق…', 'dim');
      gh('/repos/' + c.owner + '/' + c.repo).then(function (d) {
        if (!d) throw new Error('لم أجد المستودع');
        log('✓ متصل بـ ' + d.full_name, 'ok');
        if (d.default_branch !== c.branch) {
          log('تنبيه: الفرع الافتراضي «' + d.default_branch + '» يخالف المكتوب.', 'err');
        }
        setConn(true, 'متصل');
        $('settingsPanel').open = false;
        refreshPicker();
      }).catch(function (e) { log('فشل: ' + e.message, 'err'); setConn(false, 'غير متصل'); });
    });

    
    $('tools').addEventListener('mousedown', function (e) {
      if (e.target.closest('button,input')) e.preventDefault();   
    });
    $('tools').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.block) setBlock(b.dataset.block);
      else if (b.dataset.cmd) exec(b.dataset.cmd);
      else if (b.hasAttribute('data-step')) applySize(Number(b.dataset.step));
      else if (b.hasAttribute('data-color')) applyColor(b.dataset.color);
      else if (b.dataset.align) setAlign(b.dataset.align);
      else if (b.dataset.quote) setQuote(b.dataset.quote);
    });
    $('colorPick').addEventListener('input', function () { applyColor(this.value); });
    $('linkBtn').addEventListener('click', addLink);
    $('citeBtn').addEventListener('click', function () { setCite(); });
    $('baytBtn').addEventListener('click', openPoemModal);
    $('imgUrlBtn').addEventListener('click', insertImageByURL);
    $('poemInsertBtn').addEventListener('click', doInsertPoem);
    $('poemCancelBtn').addEventListener('click', closePoemModal);
    $('poemModal').addEventListener('click', function (e) {
      if (e.target === this) closePoemModal();      
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePoemModal();
    });
    $('clearFmtBtn').addEventListener('click', clearFormatting);
    $('imgBtn').addEventListener('click', function () { saveSel(); $('imgInput').click(); });
    $('imgInput').addEventListener('change', function () {
      if (this.files && this.files[0]) uploadImage(this.files[0]);
      this.value = '';
    });

    
    ['keyup', 'mouseup', 'input'].forEach(function (ev) {
      ED.addEventListener(ev, function () { saveSel(); updateToolbar(); });
    });
    ED.addEventListener('input', updateCount);
    ED.addEventListener('blur', saveSel);
    
    ED.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var n = sel.getRangeAt(0).startContainer;
      var bq = null;
      while (n && n !== ED) {
        if (n.nodeType === 1 && n.tagName === 'BLOCKQUOTE') bq = n;
        n = n.parentNode;
      }
      if (!bq || !ED.contains(bq)) return;
      e.preventDefault();
      var p = document.createElement('p');
      p.innerHTML = '<br>';
      bq.parentNode.insertBefore(p, bq.nextSibling);
      var r = document.createRange();
      r.setStart(p, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      saveSel();
      updateToolbar();
    });

    ED.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      cmd('insertText', t);
    });

    
    buildCtx();
    ED.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      saveSel();
      showCtx(e.clientX, e.clientY);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#ctxMenu')) hideCtx();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideCtx(); });
    window.addEventListener('scroll', hideCtx, true);

    
    ['fTitle', 'fTag', 'fAuthor', 'fPages', 'fDate', 'fPublisher'].forEach(function (id) {
      $(id).addEventListener('input', renderHead);
    });
    $('fTitle').addEventListener('blur', function () {
      if (!$('fSlug').value.trim()) $('fSlug').value = makeSlug();
    });
    $('fExcerpt').addEventListener('input', updateCount);
    $('ratingPick').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setRating(Number(b.dataset.v) === rating ? 0 : Number(b.dataset.v));
    });
    $('ratingClear').addEventListener('click', function () { setRating(0); });

    $('postPicker').addEventListener('change', function () {
      $('deleteBtn').disabled = !this.value;
      openPost(this.value);
    });
    $('deleteBtn').addEventListener('click', deletePost);
    $('publishBtn').addEventListener('click', publish);
    $('saveDraftBtn').addEventListener('click', saveDraft);
    $('clearBtn').addEventListener('click', function () {
      if (confirm('سيُمسح ما في المحرر. أتريد المتابعة؟')) {
        store('kr_draft', null);
        $('draftInfo').textContent = '';
        newPost();
        clearLog();
      }
    });

    setInterval(function () {
      if ($('fTitle').value.trim() || ED.textContent.trim()) saveDraft();
    }, 30000);
    window.addEventListener('beforeunload', function () {
      if (ED.textContent.trim()) saveDraft();
    });

    
    try { cmd('defaultParagraphSeparator', 'p'); } catch (e) {}
    try { cmd('styleWithCSS', true); } catch (e) {}

    $('fDate').value = today();
    ED.innerHTML = '<p><br></p>';
    refreshPicker();
    loadDraft();
    renderHead();
    updateCount();
    updateToolbar();

    if (store('kr_token') && store('kr_ghOwner')) setConn(false, 'اضغط «تحقّق من الاتصال»');
    else $('settingsPanel').open = true;
  }

  init();
})();