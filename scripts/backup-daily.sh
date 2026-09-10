#!/usr/bin/env bash
# Linux equivalent of scripts/ItOps.psm1's Backup-ItOpsDatabaseDaily (Windows/Task Scheduler
# version, dev machine only). Meant to run unattended via cron on a production server - see
# docs/SETUP.md. gzip-compresses the dump, rotates backups older than RETENTION_DAYS,
# and always writes one line to backups/backup_log.txt (success or failure) so there's a record
# even if nobody checks cron's own log. Exits non-zero on failure so cron mail/monitoring notices.
#
# One file per calendar day (itops-daily-YYYY-MM-DD.sql.gz) - re-running the same day overwrites
# that day's file rather than accumulating duplicates.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/backups"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y-%m-%d)"
SQL_PATH="$BACKUP_DIR/itops-daily-$STAMP.sql"
GZ_PATH="$SQL_PATH.gz"
LOG_PATH="$BACKUP_DIR/backup_log.txt"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S')  $1" >> "$LOG_PATH"
}

set -a
# shellcheck disable=SC1091
source "$REPO_ROOT/.env"
set +a

cleanup() {
    rm -f "$SQL_PATH"
}
trap cleanup EXIT

if ! docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" itops_postgres \
        pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$SQL_PATH"; then
    log "FAILED  pg_dump exited non-zero - check 'docker exec itops_postgres pg_isready'"
    echo "Daily backup failed: pg_dump exited non-zero" >&2
    exit 1
fi

if [ ! -s "$SQL_PATH" ]; then
    log "FAILED  pg_dump produced an empty file"
    echo "Daily backup failed: pg_dump produced an empty file" >&2
    exit 1
fi

gzip -f "$SQL_PATH"

SIZE_MB="$(du -m "$GZ_PATH" | cut -f1)"
log "OK      $GZ_PATH  (${SIZE_MB} MB)"
echo "Daily backup written: $GZ_PATH (${SIZE_MB} MB)"

find "$BACKUP_DIR" -maxdepth 1 -name 'itops-daily-*.sql.gz' -mtime "+$RETENTION_DAYS" -print |
while read -r old_file; do
    rm -f "$old_file"
    log "ROTATE  deleted $(basename "$old_file") (older than $RETENTION_DAYS days)"
done
