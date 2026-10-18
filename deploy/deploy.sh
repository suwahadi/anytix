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

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:3000/api/health; then
    echo
    echo "Deploy selesai."
    exit 0
  fi
  sleep 3
done
echo "Aplikasi tidak sehat setelah deploy. Cek: pm2 logs anytix-web --lines 100" >&2
exit 1
