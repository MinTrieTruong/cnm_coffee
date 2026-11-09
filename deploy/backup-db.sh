#!/usr/bin/env bash
# Sao lưu MySQL hằng ngày. Cài cron trên VPS:
#   0 3 * * * /opt/tdcoffee/backup-db.sh >> /opt/tdcoffee/backup.log 2>&1
set -euo pipefail
cd /opt/tdcoffee
source .env
mkdir -p backups
docker compose exec -T mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines coffee_shop_db | gzip > "backups/db-$(date +%F).sql.gz"
# Giữ 14 bản gần nhất
ls -1t backups/db-*.sql.gz | tail -n +15 | xargs -r rm --
