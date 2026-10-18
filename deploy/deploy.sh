#!/usr/bin/env bash
# Deploy or update Anytix on the VPS. Run from the repo folder: bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
npm ci
DB_WRITE_ALLOWED=true npm run db:migrate
npm run build
pm2 reload deploy/ecosystem.config.cjs --update-env || pm2 start deploy/ecosystem.config.cjs
pm2 save

port="${ANYTIX_PORT:-3100}"
for i in 1 2 3 4 5 6 7 8 9 10; do
  # Match Anytix's own health body, so another app on the same port cannot report a false success.
  if body="$(curl -fsS "http://127.0.0.1:$port/api/health")" && [[ "$body" == *'"oldestQueuedJobSec"'* ]]; then
    echo "$body"
    echo "Deploy selesai (port $port)."
    exit 0
  fi
  sleep 3
done
echo "Anytix tidak menjawab di 127.0.0.1:$port. Cek: pm2 logs anytix-web --lines 100, dan apakah port $port dipakai aplikasi lain: ss -ltnp | grep :$port" >&2
exit 1
