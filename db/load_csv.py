"""Load innodose_casting_details_today_4.csv -> innodose.innodose_casting_details_v2

Handles the CSV quirks:
  - trailing blank columns from the header
  - \0-padded fixed-length strings in HEAT NO / PATTERN ID / COMPONENT ID
  - \N literal for NULL
  - datetime in "DD-MM-YYYY HH:MM" (no seconds)

Usage:
    pip install pymysql
    python load_csv.py                 # defaults: localhost, user mpmgateway
    python load_csv.py --truncate      # wipe table before load
"""
from __future__ import annotations
import argparse, csv, sys
from datetime import datetime
from pathlib import Path
import pymysql

CSV_PATH = Path(__file__).resolve().parent.parent / 'innodose_casting_details_today_4.csv'

TEXT_COLS = {'HEAT NO', 'PATTERN ID', 'COMPONENT ID'}
INT_COLS  = {
    'id', 'BOX COUNT', 'CUMMULATIVE BOX COUNT', 'CUMMULATIVE DOSES',
    'CURRENT DAY DOSES', 'CURRENT DAY MISSED DOSES',
    'LAST DAY DOSES', 'LAST DAY MISSED DOSES', 'POURING TIMER',
}

def clean(col: str, raw: str):
    if raw is None:
        return None
    v = raw.strip()
    if v in ('', r'\N'):
        return None
    if col in TEXT_COLS:
        return v.replace('\x00', '').rstrip()
    if col == 'datetime':
        return datetime.strptime(v, '%d-%m-%Y %H:%M')
    if col in INT_COLS:
        try:
            return int(float(v))
        except ValueError:
            return None
    try:
        return float(v)
    except ValueError:
        return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=3306)
    ap.add_argument('--user', default='root')
    ap.add_argument('--password', default='')
    ap.add_argument('--database', default='innodose')
    ap.add_argument('--truncate', action='store_true')
    args = ap.parse_args()

    with open(CSV_PATH, newline='') as f:
        reader = csv.reader(f)
        header = [h.strip() for h in next(reader)]
        # drop the trailing empty columns produced by the dangling commas
        header = [h for h in header if h]
        rows = []
        for raw in reader:
            if not any(raw):
                continue
            row = {}
            for i, col in enumerate(header):
                row[col] = clean(col, raw[i] if i < len(raw) else None)
            rows.append(row)

    print(f'read {len(rows)} rows from {CSV_PATH.name}')

    col_sql = ', '.join(f'`{c}`' for c in header)
    ph_sql  = ', '.join(['%s'] * len(header))
    insert  = f'INSERT INTO innodose_casting_details_v2 ({col_sql}) VALUES ({ph_sql})'

    conn = pymysql.connect(host=args.host, port=args.port, user=args.user,
                           password=args.password, database=args.database,
                           autocommit=False)
    try:
        with conn.cursor() as cur:
            if args.truncate:
                cur.execute('TRUNCATE TABLE innodose_casting_details_v2')
                print('truncated innodose_casting_details_v2')
            # batch insert
            batch = [tuple(r[c] for c in header) for r in rows]
            cur.executemany(insert, batch)
        conn.commit()
        print(f'inserted {len(rows)} rows into innodose_casting_details_v2')
    except Exception as e:
        conn.rollback()
        print('ERROR:', e, file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
