#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مزامنة المكتبة من Goodreads — يقرأ ملف التصدير الرسمي ويحدّث books.js.

الاستعمال:
    python3 tools/sync-goodreads.py goodreads_library_export.csv

من أين يأتي ملف CSV؟ من Goodreads نفسه:
    My Books ← Import and export ← Export Library
فيُنزَّل ملف goodreads_library_export.csv فيه مكتبتك كاملة.

ما يفعله السكربت:
- يحوّل كل صف إلى كتاب بنفس حقول books.js (التقييم، المراجعة،
  التواريخ، الرف، الناشر، ISBN...).
- يدمج مع الملف الحالي: الحقول اليدوية التي أضفتَها بنفسك
  (مثل cover) تُنقل كما هي إلى النسخة الجديدة.
- الكتب الموجودة محليًا وليست في CSV تُبقى مع تنبيه
  (استعمل --prune لحذفها إن كانت محذوفة من Goodreads فعلًا).
- يطبع خلاصة: كم كتابًا جديدًا وكم تحدّث.

بعد المزامنة شغّل tools/fetch-covers.py لجلب أغلفة الكتب الجديدة؛
الأغلفة القديمة محفوظة في covers.js برقم الكتاب ولا تتأثر.
"""

import argparse
import csv
import html as htmllib
import io
import json
import os
import re
import sys

DEFAULT_OUT = 'assets/data/books.js'

PRODUCED = {'id', 'title', 'author', 'rating', 'pages', 'year',
            'dateRead', 'dateAdded', 'shelf', 'publisher',
            'binding', 'isbn', 'review'}

HEADER = '''// بيانات المكتبة (مستخرجة من Goodreads).
// يحدّث هذا الملف: python3 tools/sync-goodreads.py goodreads_library_export.csv
// ويمكن تحرير أي كتاب يدويًا؛ الحقول اليدوية (مثل cover) تبقى بعد المزامنة.
'''


def strip_isbn(v):
    """يزيل غلاف ="..." الذي يضعه Goodreads حول أرقام ISBN."""
    v = (v or '').strip()
    m = re.match(r'^="?([0-9Xx-]*)"?$', v)
    if m:
        v = m.group(1)
    return v.strip('"= ')


def clean_review(v):
    """<br> إلى أسطر، ثم إزالة بقية الوسوم وفك رموز HTML."""
    v = re.sub(r'<br\s*/?>', '\n', v or '', flags=re.I)
    v = re.sub(r'<[^>]+>', '', v)
    v = htmllib.unescape(v)
    v = re.sub(r'\n{3,}', '\n\n', v)
    return v.strip()


def to_int(v):
    v = (v or '').strip()
    return int(v) if v.isdigit() else 0


def row_to_book(row):
    date_read = (row.get('Date Read') or '').strip()
    shelf = (row.get('Exclusive Shelf') or '').strip()
    if not shelf:
        shelf = 'read' if date_read else 'to-read'
    year = to_int(row.get('Year Published'))
    if not year:
        year = to_int(re.sub(r'\..*$', '', row.get('Original Publication Year') or ''))
    return {
        'id': (row.get('Book Id') or '').strip(),
        'title': (row.get('Title') or '').strip(),
        'author': (row.get('Author') or '').strip(),
        'rating': to_int(row.get('My Rating')),
        'pages': to_int(row.get('Number of Pages')),
        'year': year,
        'dateRead': date_read,
        'dateAdded': (row.get('Date Added') or '').strip(),
        'shelf': shelf,
        'publisher': (row.get('Publisher') or '').strip(),
        'binding': (row.get('Binding') or '').strip(),
        'isbn': strip_isbn(row.get('ISBN13')) or strip_isbn(row.get('ISBN')),
        'review': clean_review(row.get('My Review')),
    }


def load_existing(path):
    if not os.path.exists(path):
        return []
    text = io.open(path, encoding='utf-8').read()
    m = re.search(r'window\.BOOKS\s*=\s*(\[[\s\S]*\])\s*;', text)
    if not m:
        sys.exit('لم أجد window.BOOKS في %s — هل الملف سليم؟' % path)
    try:
        return json.loads(m.group(1))
    except ValueError as e:
        sys.exit('تعذّرت قراءة %s كقائمة JSON (%s).\n'
                 'غالبًا تعديل يدوي كسر الصيغة — فاصلة زائدة أو علامة اقتباس ناقصة.' % (path, e))


def sort_key(b):
    return (b.get('dateRead') or '0000/00/00', b.get('dateAdded') or '0000/00/00')


def write_books(path, books):
    lines = ',\n'.join(json.dumps(b, ensure_ascii=False, separators=(',', ':')) for b in books)
    io.open(path, 'w', encoding='utf-8').write(
        HEADER + 'window.BOOKS = [\n' + lines + '\n];\n')


def main():
    ap = argparse.ArgumentParser(description='مزامنة books.js من تصدير Goodreads')
    ap.add_argument('csv_file', help='ملف goodreads_library_export.csv')
    ap.add_argument('--out', default=DEFAULT_OUT, help='ملف المكتبة (الافتراضي: %s)' % DEFAULT_OUT)
    ap.add_argument('--prune', action='store_true',
                    help='احذف الكتب الموجودة محليًا وغير الموجودة في CSV')
    args = ap.parse_args()

    existing = load_existing(args.out)
    by_id = {b.get('id'): b for b in existing if b.get('id')}

    with io.open(args.csv_file, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit('ملف CSV فارغ أو غير مقروء.')
    if 'Book Id' not in rows[0]:
        sys.exit('هذا لا يشبه تصدير Goodreads — عمود "Book Id" مفقود.')

    books, seen = [], set()
    added = updated = unchanged = 0
    for row in rows:
        b = row_to_book(row)
        if not b['id'] or not b['title']:
            continue
        seen.add(b['id'])
        old = by_id.get(b['id'])
        if old:
            for k, v in old.items():
                if k not in PRODUCED:
                    b[k] = v
            if b == old:
                unchanged += 1
            else:
                updated += 1
        else:
            added += 1
        books.append(b)

    local_only = [b for b in existing if b.get('id') not in seen]
    if local_only and not args.prune:
        books.extend(local_only)

    books.sort(key=sort_key, reverse=True)
    write_books(args.out, books)

    print('تمّت المزامنة: %d كتابًا في المكتبة.' % len(books))
    print('  جديد: %d   محدَّث: %d   بلا تغيير: %d' % (added, updated, unchanged))
    if local_only:
        if args.prune:
            print('  حُذف %d كتابًا محليًا غير موجود في CSV (--prune).' % len(local_only))
        else:
            print('  أُبقي %d كتابًا محليًا ليس في CSV (أضف --prune لحذفها):' % len(local_only))
            for b in local_only[:10]:
                print('    - %s' % b.get('title', b.get('id')))
    if added:
        print('\nالكتب الجديدة بلا أغلفة محفوظة بعد — شغّل:')
        print('  python3 tools/fetch-covers.py')


if __name__ == '__main__':
    main()
