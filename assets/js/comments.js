
(function () {
  var CONFIG = {
    repo:       '',   
    repoId:     '',
    category:   '',   
    categoryId: ''
  };

  var host = document.getElementById('comments');
  var card = document.getElementById('commentsCard');
  if (!host) return;

  if (!CONFIG.repo || !CONFIG.repoId || !CONFIG.categoryId) {
    if (card) card.style.display = 'none';   
    return;
  }

  var s = document.createElement('script');
  s.src = 'https://giscus.app/client.js';
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.setAttribute('data-repo', CONFIG.repo);
  s.setAttribute('data-repo-id', CONFIG.repoId);
  s.setAttribute('data-category', CONFIG.category);
  s.setAttribute('data-category-id', CONFIG.categoryId);
  s.setAttribute('data-mapping', 'pathname');   
  s.setAttribute('data-strict', '1');
  s.setAttribute('data-reactions-enabled', '0');
  s.setAttribute('data-emit-metadata', '0');
  s.setAttribute('data-input-position', 'bottom');
  s.setAttribute('data-theme', 'light');
  s.setAttribute('data-lang', 'ar');
  s.setAttribute('data-loading', 'lazy');
  host.appendChild(s);
})();
