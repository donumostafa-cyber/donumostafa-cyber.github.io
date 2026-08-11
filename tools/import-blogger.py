#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مُحوِّل مدونة Blogger إلى صفحات هذا الموقع.

من أين آتي بالملف؟
  Blogger ← الإعدادات ← إدارة المدونة ← نسخ احتياطي للمحتوى
  يُنزَّل ملف باسم مثل: blog-08-10-2026.xml

التشغيل (من داخل مجلد الموقع):

    python tools/import-blogger.py blog-08-10-2026.xml

ماذا يفعل؟
  ١) يقرأ كل التدوينات المنشورة (يتجاهل المسودّات والتعليقات).
  ٢) ينظّف تنسيقات Blogger المضمّنة (ألوان وخطوط وأحجام) ليأخذ
     المحتوى تصميم الموقع نفسه.
  ٣) يُنزّل صور التدوينات إلى assets/img/posts/ ويعدّل روابطها،
     فلا يبقى الموقع معتمدًا على خوادم Blogger.
  ٤) يكتب ملفات التدوينات في مجلد posts/
  ٥) يكتب فهرسها في assets/data/posts-blogger.js

يمكن تشغيله أكثر من مرة: يعيد توليد الملفات من جديد في كل مرة،
فإن نشرتَ تدوينة جديدة في Blogger، صدّر نسخة جديدة وأعد التشغيل.

خيارات:
  --keep-image-urls   لا تُنزّل الصور، أبقِ روابط Blogger كما هي
  --limit 5           حوّل خمس تدوينات فقط (للتجربة)
"""

import argparse
import html as htmllib
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ATOM = '{http://www.w3.org/2005/Atom}'
APP = '{http://purl.org/atom/app#}'
KIND_SCHEME = 'http://schemas.google.com/g/2005#kind'
POST_KIND = 'http://schemas.google.com/blogger/2008/kind#post'
PAGE_KIND = 'http://schemas.google.com/blogger/2008/kind#page'
LABEL_SCHEME = 'http://www.blogger.com/atom/ns#'


def find_site_root():
    here = os.path.dirname(os.path.abspath(__file__))
    for g in [here, os.path.dirname(here), os.getcwd(), os.path.dirname(os.getcwd())]:
        if os.path.exists(os.path.join(g, 'assets', 'data', 'posts.js')):
            return g
    print('لم أجد مجلد الموقع (assets/data/posts.js).')
    print('ضع هذا الملف داخل مجلد الموقع أو داخل tools بداخله.')
    sys.exit(1)


SITE = find_site_root()
POSTS_DIR = os.path.join(SITE, 'posts')
IMG_DIR = os.path.join(SITE, 'assets', 'img', 'posts')
INDEX_JS = os.path.join(SITE, 'assets', 'data', 'posts-blogger.js')


VOID = {'br', 'img', 'hr', 'input', 'meta', 'link', 'source'}
DROP = {'script', 'style', 'meta', 'link', 'noscript', 'form', 'button',
        'svg', 'use', 'path', 'symbol', 'defs', 'g'}
UNWRAP = {'span', 'font', 'small', 'big', 'table', 'tbody', 'thead', 'tfoot',
          'tr', 'td', 'th', 'section', 'article', 'header', 'footer', 'nav',
          'main', 'label', 'a-void'}
RENAME = {'h1': 'h2', 'h5': 'h4', 'h6': 'h4', 'b': 'strong', 'i': 'em',
          'strike': 's', 'del': 's', 'center': 'p', 'dl': 'ul', 'dt': 'li',
          'dd': 'li'}
KEEP_ATTRS = {'a': ('href',), 'img': ('src', 'alt'),
              'iframe': ('src', 'width', 'height', 'allowfullscreen')}
BLOCK = {'p', 'div', 'ul', 'ol', 'blockquote', 'h2', 'h3', 'h4', 'hr',
         'figure', 'pre', 'iframe', 'li'}


class Node:
    __slots__ = ('tag', 'attrs', 'children', 'text')

    def __init__(self, tag=None, attrs=None, text=None):
        self.tag = tag
        self.attrs = dict(attrs or {})
        self.children = []
        self.text = text


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, dict(attrs)))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        if data:
            self.stack[-1].children.append(Node(None, text=data))


def transform(node):
    """يعيد قائمة عُقد بديلة عن العقدة الواردة."""
    if node.tag is None:
        return [node]

    kids = []
    for c in node.children:
        kids.extend(transform(c))
    node.children = kids

    tag = node.tag

    if tag in DROP:
        return []

    marker = (node.attrs.get('class', '') + ' ' + node.attrs.get('id', '')).lower()
    if marker and re.search(r'share|sharing|social|post-footer|comment|byline|jump-link', marker):
        return []

    if tag == 'a' and node.attrs.get('name') == 'more':
        return []

    if tag == 'a' and not node.attrs.get('href'):
        return kids

    if tag in UNWRAP:
        return kids

    if tag in RENAME:
        tag = node.tag = RENAME[tag]

    if tag == 'div':
        if any(k.tag in BLOCK for k in kids):
            return kids
        node.tag = 'p'

    allowed = KEEP_ATTRS.get(node.tag, ())
    node.attrs = {k: v for k, v in node.attrs.items() if k in allowed and v}
    return [node]


def serialize(node):
    if node.tag is None:
        return htmllib.escape(node.text, quote=False)
    inner = ''.join(serialize(c) for c in node.children)
    if node.tag == 'root':
        return inner
    attrs = ''.join(' %s="%s"' % (k, htmllib.escape(v, quote=True))
                    for k, v in node.attrs.items())
    if node.tag in VOID:
        return '<%s%s>' % (node.tag, attrs)
    return '<%s%s>%s</%s>' % (node.tag, attrs, inner, node.tag)


EMPTY_P = re.compile(r'<p>(?:\s|&nbsp;|<br>|\u00a0)*</p>')
MANY_BR = re.compile(r'(?:<br>\s*){3,}')
BLANK = re.compile(r'\n{3,}')


def clean_html(raw):
    b = TreeBuilder()
    b.feed(raw or '')
    b.close()
    root = b.root
    root.children = [n for c in root.children for n in transform(c)]
    out = serialize(root)
    for _ in range(3):
        out = EMPTY_P.sub('', out)
    out = MANY_BR.sub('<br><br>', out)
    out = out.replace('\u00a0', ' ')
    out = BLANK.sub('\n\n', out)
    return out.strip()


TAGS = re.compile(r'<[^>]+>')


def plain_text(h):
    t = TAGS.sub(' ', h)
    t = htmllib.unescape(t)
    return re.sub(r'\s+', ' ', t).strip()


def make_excerpt(h, limit=165):
    t = plain_text(h)
    if len(t) <= limit:
        return t
    cut = t[:limit]
    sp = cut.rfind(' ')
    return (cut[:sp] if sp > 60 else cut).rstrip(' ،.') + '…'



SITE = 'https://khalidreads.github.io/'

IMG_SRC = re.compile(r'<img[^>]+src="([^"]+)"')
UA = {'User-Agent': 'Mozilla/5.0 (compatible; site-importer/1.0)'}


def download_images(body, slug):
    """ينزّل صور التدوينة ويعيد المحتوى بروابط محلية."""
    urls = []
    for u in IMG_SRC.findall(body):
        if u.startswith('data:'):
            continue
        if u not in urls:
            urls.append(u)
    if not urls:
        return body, 0

    os.makedirs(IMG_DIR, exist_ok=True)
    saved = 0
    for i, url in enumerate(urls, 1):
        ext = os.path.splitext(url.split('?')[0])[1].lower()
        if ext not in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
            ext = '.jpg'
        name = '%s-%d%s' % (slug, i, ext)
        path = os.path.join(IMG_DIR, name)
        if not os.path.exists(path):
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
                with open(path, 'wb') as f:
                    f.write(data)
                saved += 1
            except Exception as e:
                print('      تعذّر تنزيل صورة (%s): %s' % (type(e).__name__, url[:70]))
                continue
        body = body.replace(url, '../../assets/img/posts/' + name)
    return body, saved



PAGE = '''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title} | خالد الحمدان</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:site_name" content="خالد الحمدان — مدونة قراءات">
<meta property="og:type" content="article">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="ar_AR">
<meta property="article:published_time" content="{isodate}">
<meta property="og:image" content="{ogimg}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#fdfaf4">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Aref+Ruqaa:wght@400;700&family=IBM+Plex+Mono:wght@400;500&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/css/site.css">
<link rel="stylesheet" href="../../assets/css/blog.css">
</head>

<body data-root="../../" data-page="blog">
<header id="siteHeader"></header>

<main class="wrap">
  <article class="sheet">
    <div class="article-head">
      {tag}
      <h1>{title}</h1>
      <div class="article-meta">خالد الحمدان | {date}</div>
    </div>

    <div class="prose">
{body}
    </div>

    <div class="article-nav">
      <a class="btn btn-ghost" href="../../">← عودة إلى المدونة</a>
      <a class="btn btn-ghost" href="../../archive/">كل التدوينات</a>
    </div>
  </article>

  <section class="sheet comments-card" id="commentsCard">
    <h2>التعليقات</h2>
    <div id="comments"></div>
  </section>
</main>

<footer id="siteFooter"></footer>
<script src="../../assets/js/site.js"></script>
<script src="../../assets/js/comments.js"></script>
</body>
</html>
'''

AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو',
             'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
AR_DIGITS = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')


def arabic_date(iso):
    y, m, d = iso.split('-')
    return '%s %s %s' % (str(int(d)).translate(AR_DIGITS),
                         AR_MONTHS[int(m) - 1],
                         y.translate(AR_DIGITS))


def slug_from(link, iso, used):
    tail = ''
    if link:
        tail = os.path.splitext(link.rstrip('/').rsplit('/', 1)[-1])[0]
    tail = re.sub(r'[^a-z0-9_-]+', '-', tail.lower()).strip('-')
    if not tail:
        tail = 'post'
    slug = '%s-%s' % (iso[:7], tail)
    base, n = slug, 2
    while slug in used:
        slug = '%s-%d' % (base, n)
        n += 1
    used.add(slug)
    return slug


def js_string(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ') + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xml', help='ملف النسخة الاحتياطية من Blogger')
    ap.add_argument('--keep-image-urls', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    if not os.path.exists(args.xml):
        print('لم أجد الملف: %s' % args.xml)
        sys.exit(1)

    print('أقرأ: %s' % args.xml)
    tree = ET.parse(args.xml)
    root = tree.getroot()

    posts, pages, drafts = [], 0, 0

    for entry in root.findall(ATOM + 'entry'):
        kind = None
        labels = []
        for cat in entry.findall(ATOM + 'category'):
            scheme, term = cat.get('scheme'), cat.get('term')
            if scheme == KIND_SCHEME:
                kind = term
            elif scheme == LABEL_SCHEME and term:
                labels.append(term)

        if kind == PAGE_KIND:
            pages += 1
            continue
        if kind != POST_KIND:
            continue

        control = entry.find(APP + 'control')
        if control is not None:
            draft = control.find(APP + 'draft')
            if draft is not None and (draft.text or '').strip() == 'yes':
                drafts += 1
                continue

        title = (entry.findtext(ATOM + 'title') or 'بلا عنوان').strip()
        published = (entry.findtext(ATOM + 'published') or '')[:10]
        if not published:
            continue
        content = entry.findtext(ATOM + 'content') or ''

        link = ''
        for l in entry.findall(ATOM + 'link'):
            if l.get('rel') == 'alternate':
                link = l.get('href') or ''
                break

        posts.append({'title': title, 'date': published, 'content': content,
                      'labels': labels, 'link': link})

    posts.sort(key=lambda p: p['date'], reverse=True)
    if args.limit:
        posts = posts[:args.limit]

    print('تدوينات منشورة: %d   (مسودّات متجاهَلة: %d   صفحات ثابتة: %d)\n'
          % (len(posts), drafts, pages))
    if pages:
        print('ملاحظة: الصفحات الثابتة لم تُحوَّل؛ انسخ محتواها يدويًا إن أردتها.\n')

    os.makedirs(POSTS_DIR, exist_ok=True)
    used, entries, total_imgs = set(), [], 0

    for i, p in enumerate(posts, 1):
        slug = slug_from(p['link'], p['date'], used)
        body = clean_html(p['content'])

        if not args.keep_image_urls:
            body, n = download_images(body, slug)
            total_imgs += n

        excerpt = make_excerpt(body)
        tag = p['labels'][0] if p['labels'] else 'تدوينة'
        indented = '\n'.join('      ' + line for line in body.splitlines())

        m = IMG_SRC.search(body)
        image = m.group(1) if m else ''
        if image.startswith('../../'):
            image = image[6:]
        if image.startswith('assets/'):
            ogimg = SITE + image
        elif image.startswith('http'):
            ogimg = image
        else:
            ogimg = SITE + 'assets/img/og-cover.png'

        html = PAGE.format(
            title=htmllib.escape(p['title'], quote=True),
            desc=htmllib.escape(excerpt[:150], quote=True),
            date=arabic_date(p['date']),
            isodate=p['date'],
            url=SITE + 'posts/%s/' % slug,
            ogimg=htmllib.escape(ogimg, quote=True),
            tag='<span class="tag">%s</span>' % htmllib.escape(tag),
            body=indented)

        folder = os.path.join(POSTS_DIR, slug)
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)

        entries.append({'title': p['title'], 'date': p['date'], 'tag': tag,
                        'url': 'posts/%s/' % slug, 'excerpt': excerpt,
                        'image': image, 'labels': p['labels']})

        print('%3d/%d  ✓  %s' % (i, len(posts), p['title'][:52]))

    with open(INDEX_JS, 'w', encoding='utf-8') as f:
        f.write('/* ============================================================\n')
        f.write('   فهرس التدوينات المنقولة من Blogger.\n')
        f.write('   هذا الملف من إنتاج tools/import-blogger.py — لا تحرّره يدويًا،\n')
        f.write('   فأي تعديل هنا يضيع عند إعادة تشغيل المُحوِّل.\n')
        f.write('   التدوينات الجديدة تُضاف في assets/data/posts.js\n')
        f.write('   ============================================================ */\n\n')
        f.write('window.POSTS = (window.POSTS || []).concat([\n')
        for e in entries:
            f.write('  {\n')
            f.write('    title: %s,\n' % js_string(e['title']))
            f.write('    date: %s,\n' % js_string(e['date']))
            f.write('    tag: %s,\n' % js_string(e['tag']))
            f.write('    url: %s,\n' % js_string(e['url']))
            if e['image']:
                f.write('    image: %s,\n' % js_string(e['image']))
            f.write('    labels: [%s],\n' % ', '.join(js_string(l) for l in e['labels']))
            f.write('    excerpt: %s\n' % js_string(e['excerpt']))
            f.write('  },\n')
        f.write(']);\n')

    print('\nتمّ.')
    print('  صفحات التدوينات : posts/')
    print('  الفهرس          : assets/data/posts-blogger.js')
    if total_imgs:
        print('  صور نُزّلت      : %d  →  assets/img/posts/' % total_imgs)
    print('\nعاين الموقع محليًا ثم ارفع الملفات كلها إلى GitHub.')


if __name__ == '__main__':
    main()