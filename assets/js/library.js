

(function () {
  var books = window.BOOKS || [];

  var readGrid = document.getElementById('readGrid');
  var unreadGrid = document.getElementById('unreadGrid');
  var readSection = document.getElementById('readSection');
  var unreadSection = document.getElementById('unreadSection');
  var searchInput = document.getElementById('searchInput');
  var shelfFilter = document.getElementById('shelfFilter');
  var authorFilter = document.getElementById('authorFilter');
  var ratingFilter = document.getElementById('ratingFilter');
  var yearFilter = document.getElementById('yearFilter');
  var sortSelect = document.getElementById('sortSelect');
  var resetBtn = document.getElementById('resetFilters');
  var resultNote = document.getElementById('resultNote');
  var modal = document.getElementById('bookModal');

  
  function coverCandidates(book, olSize) {
    var list = [];
    if (book.cover) list.push(book.cover);
    var saved = window.COVERS && window.COVERS[book.id];
    if (saved) list.push(saved);
    if (book.isbn) {
      list.push('https://covers.openlibrary.org/b/isbn/' + book.isbn + '-' + (olSize || 'M') + '.jpg?default=false');
    }
    return list;
  }

  
  function buildCover(wrap, book, olSize, cls) {
    var candidates = coverCandidates(book, olSize);
    var i = 0;

    function attempt() {
      if (i >= candidates.length) {
        wrap.innerHTML = '<div class="cover-fallback">' + escapeHtml(book.title) + '</div>';
        return;
      }
      var img = document.createElement('img');
      img.className = cls || 'book-cover';
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.referrerPolicy = 'no-referrer';
      img.alt = 'غلاف ' + book.title;
      img.addEventListener('error', function () { i++; attempt(); });
      wrap.innerHTML = '';
      wrap.appendChild(img);
      img.src = candidates[i];
    }

    attempt();
  }

  function stars(rating) {
    var r = Number(rating || 0);
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  function parseDate(value) {
    if (!value) return 0;
    var d = new Date(value.replace(/\//g, '-'));
    return isNaN(d) ? 0 : d.getTime();
  }

  function readYear(value) {
    if (!value) return '';
    var m = String(value).match(/^(\d{4})/);
    return m ? m[1] : '';
  }

  function formatDate(value) {
    if (!value) return '—';
    var d = new Date(value.replace(/\//g, '-'));
    if (isNaN(d)) return value;
    return new Intl.DateTimeFormat('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ar-KW').format(value || 0);
  }

  function shelfArabic(value) {
    return value === 'read' ? 'مقروء'
      : value === 'currently-reading' ? 'أقرأه الآن'
      : value === 'to-read' ? 'أرغب في قراءته'
      : value || '—';
  }

  function goodreadsURL(book) {
    if (book.goodreads) return book.goodreads;
    if (book.id) return 'https://www.goodreads.com/book/show/' + book.id;
    return '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch];
    });
  }

  
  function fillFilterOptions() {
    var byAuthor = {};
    var years = {};
    books.forEach(function (b) {
      if (b.author) byAuthor[b.author] = (byAuthor[b.author] || 0) + 1;
      var y = readYear(b.dateRead);
      if (y) years[y] = true;
    });

    Object.keys(byAuthor)
      .sort(function (a, b) { return byAuthor[b] - byAuthor[a] || a.localeCompare(b, 'ar'); })
      .forEach(function (name) {
        var o = document.createElement('option');
        o.value = name;
        o.textContent = name + ' (' + formatNumber(byAuthor[name]) + ')';
        authorFilter.appendChild(o);
      });

    Object.keys(years).sort().reverse().forEach(function (y) {
      var o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      yearFilter.appendChild(o);
    });
  }

  function updateStats() {
    var readBooks = books.filter(function (b) { return b.shelf === 'read'; });
    var unreadBooks = books.filter(function (b) { return b.shelf !== 'read'; });
    var rated = readBooks.filter(function (b) { return b.rating > 0; });
    var avg = rated.length ? rated.reduce(function (s, b) { return s + b.rating; }, 0) / rated.length : 0;
    document.getElementById('statBooks').textContent = formatNumber(books.length);
    document.getElementById('statRead').textContent = formatNumber(readBooks.length);
    document.getElementById('statUnread').textContent = formatNumber(unreadBooks.length);
    document.getElementById('statRating').textContent = avg.toFixed(1);
  }

  
  var DEFAULTS = { q: '', shelf: 'all', author: 'all', rating: 'all', year: 'all', sort: 'date-desc' };

  function currentState() {
    return {
      q: searchInput.value.trim(),
      shelf: shelfFilter.value,
      author: authorFilter.value,
      rating: ratingFilter.value,
      year: yearFilter.value,
      sort: sortSelect.value
    };
  }

  function writeHash() {
    var st = currentState();
    var params = new URLSearchParams();
    Object.keys(st).forEach(function (k) {
      if (st[k] !== DEFAULTS[k]) params.set(k, st[k]);
    });
    var h = params.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }

  function readHash() {
    if (!location.hash) return;
    var params = new URLSearchParams(location.hash.slice(1));
    if (params.has('q')) searchInput.value = params.get('q');
    ['shelf', 'author', 'rating', 'year', 'sort'].forEach(function (k) {
      if (!params.has(k)) return;
      var el = { shelf: shelfFilter, author: authorFilter, rating: ratingFilter,
                 year: yearFilter, sort: sortSelect }[k];
      var v = params.get(k);
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].value === v) { el.value = v; break; }
      }
    });
  }

  
  function currentBooks() {
    var st = currentState();
    var q = st.q.toLowerCase();

    var list = books.filter(function (book) {
      var hay = (book.title + ' ' + book.author + ' ' + (book.publisher || '')).toLowerCase();
      if (q && hay.indexOf(q) === -1) return false;
      if (st.shelf !== 'all' && book.shelf !== st.shelf) return false;
      if (st.author !== 'all' && book.author !== st.author) return false;
      if (st.rating !== 'all' && Number(book.rating) !== Number(st.rating)) return false;
      if (st.year !== 'all' && readYear(book.dateRead) !== st.year) return false;
      return true;
    });

    var sort = st.sort;
    list.sort(function (a, b) {
      if (sort === 'date-desc') return parseDate(b.dateRead) - parseDate(a.dateRead);
      if (sort === 'date-asc') return parseDate(a.dateRead) - parseDate(b.dateRead);
      if (sort === 'rating-desc') return b.rating - a.rating || a.title.localeCompare(b.title, 'ar');
      if (sort === 'pages-desc') return (b.pages || 0) - (a.pages || 0);
      if (sort === 'title') return a.title.localeCompare(b.title, 'ar');
      return 0;
    });
    return list;
  }

  function createCard(book) {
    var article = document.createElement('article');
    article.className = 'book-card';
    article.tabIndex = 0;

    article.innerHTML =
      '<div class="book-cover-wrap"></div>' +
      '<div>' +
        '<h3 class="book-title">' + escapeHtml(book.title) + '</h3>' +
        '<div class="book-author">' + escapeHtml(book.author) + '</div>' +
        '<div class="stars" aria-label="التقييم ' + book.rating + ' من 5">' + stars(book.rating) + '</div>' +
        '<div class="book-meta">' +
          (book.dateRead ? '<span>' + formatDate(book.dateRead) + '</span>' : '') +
          '<span>' + shelfArabic(book.shelf) + '</span>' +
        '</div>' +
      '</div>';

    buildCover(article.querySelector('.book-cover-wrap'), book, 'M', 'book-cover');

    article.addEventListener('click', function () { openModal(book); });
    article.addEventListener('keydown', function (e) { if (e.key === 'Enter') openModal(book); });
    return article;
  }

  function render() {
    var st = currentState();
    var list = currentBooks();
    var readBooks = list.filter(function (b) { return b.shelf === 'read'; });
    var unreadBooks = list.filter(function (b) { return b.shelf !== 'read'; });

    resultNote.textContent = 'يظهر ' + formatNumber(list.length) + ' من أصل ' + formatNumber(books.length) + ' كتابًا';
    document.getElementById('readCount').textContent = formatNumber(readBooks.length) + ' كتابًا';
    document.getElementById('unreadCount').textContent = formatNumber(unreadBooks.length) + ' كتابًا';

    
    readSection.style.display = (st.shelf !== 'all' && st.shelf !== 'read') ? 'none' : '';
    unreadSection.style.display = (st.shelf === 'read') ? 'none' : '';

    fillGrid(readGrid, readBooks);
    fillGrid(unreadGrid, unreadBooks);
    writeHash();
  }

  function fillGrid(target, items) {
    target.innerHTML = '';
    if (!items.length) {
      target.innerHTML = '<div class="empty">لا توجد كتب مطابقة. جرّب كلمة بحث أخرى أو اضغط «مسح الفلاتر».</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    items.forEach(function (book) { frag.appendChild(createCard(book)); });
    target.appendChild(frag);
  }

  function resetFilters() {
    searchInput.value = '';
    shelfFilter.value = 'all';
    authorFilter.value = 'all';
    ratingFilter.value = 'all';
    yearFilter.value = 'all';
    sortSelect.value = 'date-desc';
    render();
  }

  var lastFocused = null;

  function openModal(book) {
    lastFocused = document.activeElement;
    buildCover(document.getElementById('modalCoverWrap'), book, 'L', 'modal-cover');
    document.getElementById('modalTitle').textContent = book.title;
    document.getElementById('modalAuthor').textContent = book.author;
    document.getElementById('modalStars').textContent = stars(book.rating);
    document.getElementById('modalDetails').innerHTML =
      '<div><strong>الحالة:</strong> ' + shelfArabic(book.shelf) + '</div>' +
      '<div><strong>تاريخ القراءة:</strong> ' + formatDate(book.dateRead) + '</div>' +
      '<div><strong>عدد الصفحات:</strong> ' + (book.pages ? formatNumber(book.pages) : '—') + '</div>' +
      '<div><strong>سنة النشر:</strong> ' + (book.year || '—') + '</div>' +
      '<div><strong>الناشر:</strong> ' + escapeHtml(book.publisher || '—') + '</div>';
    document.getElementById('modalReview').textContent = book.review || 'لا توجد مراجعة مسجلة لهذا الكتاب.';
    var gr = goodreadsURL(book);
    var link = document.getElementById('modalLink');
    link.href = gr || '#';
    link.style.display = gr ? '' : 'none';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.getElementById('modalClose').focus();
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  document.getElementById('modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  [searchInput, shelfFilter, authorFilter, ratingFilter, yearFilter, sortSelect].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  resetBtn.addEventListener('click', resetFilters);

  fillFilterOptions();
  readHash();
  updateStats();
  render();
})();
