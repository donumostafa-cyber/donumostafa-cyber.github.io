#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
جالب الأغلفة من Goodreads — يُشغَّل مرة واحدة على جهازك، لا في المتصفح.

لماذا؟ المتصفح لا يستطيع قراءة صفحات Goodreads بسبب قيود CORS،
ورابط صورة الغلاف لا يمكن اشتقاقه من رقم الكتاب لأنه يحوي رقمًا عشوائيًا.
فنجلب الروابط هنا مرة واحدة ونحفظها في assets/data/covers.js،
ثم يقرأها الموقع مباشرة بلا أي اتصال بـ Goodreads.

التشغيل من داخل مجلد الموقع:

    python3 tools/fetch-covers.py       (أو python فقط على ويندوز)

يعمل الملف سواء تركته في مجلد tools أو نقلته إلى جذر الموقع،
فهو يبحث عن assets/data/books.js بنفسه.

خيارات:
    --limit 20      جرّب على ٢٠ كتابًا فقط أولًا
    --delay 2.0     ثوانٍ بين كل طلب وآخر (الافتراضي ١٫٥)
    --retry         أعد المحاولة للكتب التي فشلت سابقًا

السكربت يحفظ تقدّمه كل عشرة كتب، فيمكنك إيقافه بـ Ctrl+C
ثم تشغيله لاحقًا فيكمل من حيث توقّف.
"""

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def find_site_root():
    """يبحث عن مجلد الموقع أينما وُضع هذا الملف: بجانب assets أو داخل tools."""
    here = os.path.dirname(os.path.abspath(__file__))
    guesses = [
        here,
        os.path.dirname(here),
        os.getcwd(),
        os.path.dirname(os.getcwd()),
    ]
    for g in guesses:
        if os.path.exists(os.path.join(g, 'assets', 'data', 'books.js')):
            return g
    print('لم أجد ملف assets/data/books.js')
    print('ضع fetch-covers.py داخل مجلد الموقع (أو داخل tools بداخله) ثم أعد التشغيل.')
    print('المسارات التي بحثتُ فيها:')
    for g in guesses:
        print('   ' + os.path.join(g, 'assets', 'data', 'books.js'))
    sys.exit(1)


SITE = find_site_root()
BOOKS_JS = os.path.join(SITE, 'assets', 'data', 'books.js')
COVERS_JS = os.path.join(SITE, 'assets', 'data', 'covers.js')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ar,en;q=0.8',
}

OG_IMAGE = re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I)
OG_IMAGE_ALT = re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', re.I)


def read_books():
    src = open(BOOKS_JS, encoding='utf-8').read()
    return json.loads(src[src.index('['):src.rindex(']') + 1])


def read_covers():
    if not os.path.exists(COVERS_JS):
        return {}
    src = open(COVERS_JS, encoding='utf-8').read()
    try:
        return json.loads(src[src.index('{'):src.rindex('}') + 1])
    except ValueError:
        return {}


def write_covers(covers):
    body = json.dumps(covers, ensure_ascii=False, indent=1, sort_keys=True)
    with open(COVERS_JS, 'w', encoding='utf-8') as f:
        f.write(
            '// روابط أغلفة الكتب، مفتاحها رقم الكتاب في Goodreads.\n'
            '// هذا الملف من إنتاج tools/fetch-covers.py — لا تحرّره يدويًا\n'
            '// إلا إن أردت تصحيح غلاف بعينه.\n'
            '// القيمة "" تعني أن Goodreads لا يملك غلافًا لهذا الكتاب.\n'
            'window.COVERS = ' + body + ';\n'
        )


def fetch_cover(url):
    """يعيد رابط الغلاف، أو "" إن لم يوجد غلاف، أو None عند فشل الطلب."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        html = resp.read().decode('utf-8', 'replace')
    match = OG_IMAGE.search(html) or OG_IMAGE_ALT.search(html)
    if not match:
        return ''
    img = match.group(1).replace('&amp;', '&')
    if 'nophoto' in img or 'no-cover' in img:
        return ''
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='عدد الكتب في هذه الجولة')
    ap.add_argument('--delay', type=float, default=1.5, help='ثوانٍ بين الطلبات')
    ap.add_argument('--retry', action='store_true', help='أعد محاولة الكتب التي فشلت')
    args = ap.parse_args()

    books = read_books()
    covers = read_covers()

    pending = []
    for b in books:
        bid = str(b.get('id') or '')
        if not bid or not b.get('goodreads'):
            continue
        if bid in covers and not (args.retry and covers[bid] == ''):
            continue
        pending.append(b)

    if args.limit:
        pending = pending[:args.limit]

    if not pending:
        print('لا شيء لجلبه. كل الأغلفة محفوظة في covers.js')
        return

    print('عدد الكتب في هذه الجولة: %d' % len(pending))
    print('المتوقع: نحو %d دقيقة\n' % max(1, round(len(pending) * args.delay / 60)))

    done = failed = 0
    streak = 0
    try:
        for i, b in enumerate(pending, 1):
            bid = str(b['id'])
            title = b.get('title', '')[:38]
            try:
                img = fetch_cover(b['goodreads'])
                covers[bid] = img
                done += 1
                streak = 0
                mark = '✓' if img else '—'
            except urllib.error.HTTPError as e:
                failed += 1
                streak += 1
                mark = '✗ %s' % e.code
                if e.code in (403, 429):
                    print('   تباطؤ من Goodreads، انتظار ٣٠ ثانية…')
                    time.sleep(30)
            except Exception as e:
                failed += 1
                streak += 1
                mark = '✗ %s' % type(e).__name__

            print('%4d/%d  %s  %s' % (i, len(pending), mark, title))

            if streak >= 10:
                print('\nعشر محاولات متتالية فاشلة. أوقفتُ الجولة حتى لا تضيع وقتك.')
                print('غالبًا Goodreads يحجب الطلبات مؤقتًا؛ انتظر ساعة ثم أعد التشغيل')
                print('بمهلة أطول:  python3 tools/fetch-covers.py --delay 4')
                break

            if i % 10 == 0:
                write_covers(covers)
            time.sleep(args.delay + random.uniform(0, 0.6))
    except KeyboardInterrupt:
        print('\nتوقّف بطلب منك.')

    write_covers(covers)
    print('\nحُفظ الملف: assets/data/covers.js')
    print('نجح: %d   فشل: %d' % (done, failed))
    if failed:
        print('أعد التشغيل لاحقًا لإكمال ما فشل، أو زد المهلة: --delay 3')


if __name__ == '__main__':
    sys.exit(main())
