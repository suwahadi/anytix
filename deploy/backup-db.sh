#!/usr/bin/env bash
# Daily database dump for the aaPanel cron: bash /www/wwwroot/anytix/deploy/backup-db.sh [/www/backup/anytix]
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-/www/backup/anytix}"
# Read only this one value: sourcing the whole .env.local would run shell syntax hidden in other values.
url="$(grep -E '^DATABASE_URL_DIRECT=' .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
if [ -z "$url" ]; then
  echo "DATABASE_URL_DIRECT belum diisi di .env.local (Supabase → Connect → Session pooler, port 5432)." >&2
  exit 1
fi

mkdir -p "$target"
file="$target/anytix-$(TZ=Asia/Jakarta date +%Y%m%d-%H%M).dump"
pg_dump "$url" --format=custom --no-owner --no-privileges --schema=public --file="$file.part"
mv "$file.part" "$file"
find "$target" -name 'anytix-*.dump' -mtime +14 -delete
echo "Backup selesai: $file ($(du -h "$file" | cut -f1))"
