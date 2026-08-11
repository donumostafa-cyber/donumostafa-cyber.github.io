

(function () {
  var $ = function (id) { return document.getElementById(id); };

  var poemInput = $('poemInput');
  var titleInput = $('title');
  var poetInput = $('poetInput');
  var bahrInput = $('bahrInput');
  var bgColor = $('bgColor');
  var textColor = $('textColor');
  var accentColor = $('accentColor');
  var fontSize = $('fontSize');
  var titleFontSize = $('titleFontSize');
  var poetFontSize = $('poetFontSize');
  var bahrFontSize = $('bahrFontSize');
  var fontFamily = $('fontFamily');
  var numberVerses = $('numberVerses');
  var startNumber = $('startNumber');
  var separator = $('separator');
  var previewPages = $('previewPages');
  var fontSample = $('fontSample');

  var VERSES_PER_PAGE = 13;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function wordsHTML(text) {
    return text.trim().split(/\s+/).filter(Boolean).map(function (w) {
      return '<span class="word">' + esc(w) + '</span>';
    }).join('');
  }

  function getVerses() {
    var lines = poemInput.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var verses = [];
    for (var i = 0; i < lines.length; i += 2) {
      verses.push({ right: lines[i] || '', left: lines[i + 1] || '' });
    }
    return verses;
  }

  function buildVerse(v, index) {
    var bayt = document.createElement('div');
    bayt.className = 'bayt';
    bayt.style.fontSize = fontSize.value + 'px';

    var showNo = numberVerses.value === 'on';
    var verseNo = Number(startNumber.value || 1) + index;

    bayt.innerHTML =
      '<div class="verse-number">' + (showNo ? verseNo : '') + '</div>' +
      '<div class="sadr">' + wordsHTML(v.right) + '</div>' +
      '<div class="mid-gap">' + (separator.value ? '<span class="separator">' + esc(separator.value) + '</span>' : '') + '</div>' +
      '<div class="ajuz">' + wordsHTML(v.left) + '</div>';

    return bayt;
  }

  function render() {
    document.documentElement.style.setProperty('--sheet-bg', bgColor.value);
    document.documentElement.style.setProperty('--sheet-ink', textColor.value);
    document.documentElement.style.setProperty('--sheet-accent', accentColor.value);

    $('fontSizeValue').textContent = fontSize.value;
    $('titleFontSizeValue').textContent = titleFontSize.value;
    $('poetFontSizeValue').textContent = poetFontSize.value;
    $('bahrFontSizeValue').textContent = bahrFontSize.value;

    var font = '"' + fontFamily.value + '", serif';
    fontSample.style.fontFamily = font;

    previewPages.innerHTML = '';
    var verses = getVerses();

    if (!verses.length) {
      var blank = document.createElement('section');
      blank.className = 'paper-page';
      blank.style.fontFamily = font;
      blank.innerHTML = '<div class="empty-poem">اكتب القصيدة في الحقل المجاور لتظهر هنا.</div>';
      previewPages.appendChild(blank);
      return;
    }

    var pageCount = Math.ceil(verses.length / VERSES_PER_PAGE);

    for (var p = 0; p < pageCount; p++) {
      var page = document.createElement('section');
      page.className = 'paper-page';
      page.style.fontFamily = font;

      if (p === 0 && titleInput.value.trim()) {
        var title = document.createElement('h2');
        title.className = 'poem-title';
        title.style.fontSize = titleFontSize.value + 'px';
        title.textContent = titleInput.value.trim();
        page.appendChild(title);
      }

      
      if (p === 0 && bahrInput.value.trim()) {
        var bahr = document.createElement('div');
        bahr.className = 'bahr';
        bahr.style.fontSize = bahrFontSize.value + 'px';
        bahr.textContent = bahrInput.value.trim();
        page.appendChild(bahr);
      }

      var poem = document.createElement('div');
      poem.className = 'poem';

      var start = p * VERSES_PER_PAGE;
      var end = Math.min(start + VERSES_PER_PAGE, verses.length);
      for (var i = start; i < end; i++) poem.appendChild(buildVerse(verses[i], i));
      page.appendChild(poem);

      if (p === pageCount - 1 && poetInput.value.trim()) {
        var poet = document.createElement('div');
        poet.className = 'poet';
        poet.style.fontSize = poetFontSize.value + 'px';
        poet.textContent = poetInput.value.trim();
        page.appendChild(poet);
      }

      previewPages.appendChild(page);
    }
  }

  [poemInput, titleInput, poetInput, bahrInput, bgColor, textColor, accentColor,
   fontSize, titleFontSize, poetFontSize, bahrFontSize, fontFamily,
   numberVerses, startNumber, separator].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  
  function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function makeExportClone(sourcePage) {
    var clone = sourcePage.cloneNode(true);
    clone.classList.add('export-sheet');
    
    clone.style.width = '794px';
    clone.style.minWidth = '794px';
    clone.style.maxWidth = '794px';
    clone.style.padding = '68px 76px';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.background = bgColor.value;
    clone.style.color = textColor.value;
    clone.style.fontFamily = '"' + fontFamily.value + '", serif';
    document.body.appendChild(clone);
    return clone;
  }

  function pageToCanvas(sourcePage) {
    var clone = makeExportClone(sourcePage);
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    }).then(function () {
      var rect = clone.getBoundingClientRect();
      var width = Math.ceil(rect.width), height = Math.ceil(rect.height);
      return html2canvas(clone, {
        scale: 3,
        backgroundColor: bgColor.value,
        useCORS: true,
        logging: false,
        width: width, height: height,
        windowWidth: width, windowHeight: height,
        scrollX: 0, scrollY: 0
      });
    }).then(function (canvas) {
      clone.remove();
      return canvas;
    });
  }

  function safeTitle() {
    return (titleInput.value.trim() || 'قصيدة').replace(/[\\/:*?"<>|]/g, '-');
  }

  $('printBtn').addEventListener('click', function () {
    var btn = $('printBtn');
    var old = btn.textContent;
    btn.textContent = 'جارٍ إنشاء PDF…';
    btn.disabled = true;

    Promise.resolve(document.fonts && document.fonts.ready).then(function () {
      var pages = Array.prototype.slice.call(document.querySelectorAll('.preview-pages .paper-page'));
      if (!pages.length) return;

      var jsPDF = window.jspdf.jsPDF;
      var pdf = null;
      var chain = Promise.resolve();

      pages.forEach(function (page, i) {
        chain = chain.then(function () {
          return pageToCanvas(page).then(function (canvas) {
            var imgData = canvas.toDataURL('image/jpeg', 0.96);
            var pdfWidth = 210;
            var pdfHeight = pdfWidth * (canvas.height / canvas.width);
            var orientation = pdfHeight > pdfWidth ? 'portrait' : 'landscape';

            if (i === 0) {
              pdf = new jsPDF({ orientation: orientation, unit: 'mm', format: [pdfWidth, pdfHeight], compress: true });
            } else {
              pdf.addPage([pdfWidth, pdfHeight], orientation);
            }
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
          });
        });
      });

      return chain.then(function () { pdf.save(safeTitle() + '.pdf'); });
    }).catch(function (err) {
      console.error(err);
      alert('تعذّر إنشاء PDF. تأكد من اتصال الإنترنت لتحميل الخطوط ومكتبة التصدير.');
    }).then(function () {
      btn.textContent = old;
      btn.disabled = false;
    });
  });

  $('pngBtn').addEventListener('click', function () {
    var btn = $('pngBtn');
    var old = btn.textContent;
    var ios = isIOSDevice();

    
    var iosWindow = null;
    if (ios) {
      iosWindow = window.open('', '_blank');
      if (iosWindow) {
        iosWindow.document.write(
          '<!doctype html><html dir="rtl"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>صور القصيدة</title>' +
          '<style>body{margin:0;padding:18px;background:#eee;font-family:Tahoma,sans-serif}' +
          'p{text-align:center;line-height:1.8}img{display:block;width:100%;height:auto;margin:0 auto 22px;box-shadow:0 3px 14px #999}</style>' +
          '</head><body><p>جارٍ إنشاء الصور…</p></body></html>'
        );
        iosWindow.document.close();
      }
    }

    btn.textContent = 'جارٍ التصدير…';
    btn.disabled = true;

    Promise.resolve(document.fonts && document.fonts.ready).then(function () {
      var pages = Array.prototype.slice.call(document.querySelectorAll('.preview-pages .paper-page'));
      if (!pages.length) return;

      var name = safeTitle();
      var images = [];
      var chain = Promise.resolve();

      pages.forEach(function (page, i) {
        chain = chain.then(function () {
          return pageToCanvas(page).then(function (canvas) {
            var dataUrl = canvas.toDataURL('image/png');
            images.push(dataUrl);
            if (!ios) {
              var link = document.createElement('a');
              link.download = pages.length > 1 ? name + '-' + (i + 1) + '.png' : name + '.png';
              link.href = dataUrl;
              document.body.appendChild(link);
              link.click();
              link.remove();
              return new Promise(function (r) { setTimeout(r, 180); });
            }
          });
        });
      });

      return chain.then(function () {
        if (ios && iosWindow) {
          iosWindow.document.body.innerHTML =
            '<p>اضغط مطولًا على الصورة ثم اختر «حفظ في الصور».</p>' +
            images.map(function (src, i) { return '<img src="' + src + '" alt="صفحة ' + (i + 1) + '">'; }).join('');
        }
      });
    }).catch(function (err) {
      console.error(err);
      if (iosWindow && !iosWindow.closed) {
        iosWindow.document.body.innerHTML = '<p>تعذّر إنشاء الصور.</p>';
      } else {
        alert('تعذّر إنشاء PNG. تأكد من اتصال الإنترنت لتحميل الخطوط ومكتبة التصدير.');
      }
    }).then(function () {
      btn.textContent = old;
      btn.disabled = false;
    });
  });

  $('resetBtn').addEventListener('click', function () {
    bgColor.value = '#f7f1e3';
    textColor.value = '#201a17';
    accentColor.value = '#8a6a3d';
    fontSize.value = '25';
    titleFontSize.value = '30';
    poetFontSize.value = '18';
    bahrFontSize.value = '18';
    fontFamily.value = 'Amiri';
    numberVerses.value = 'off';
    startNumber.value = '1';
    separator.value = '';
    render();
  });

  render();
})();