#!/usr/bin/env bash
# Ежедневный бэкап БД: pg_dump -Fc, ротация 14 копий, копия на другой диск или сетевую папку.
# Пример cron (03:15 каждый день):
#   15 3 * * * /opt/label-stock/deploy/backup.sh >> /var/log/label-stock-backup.log 2>&1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/label-stock}"
# Второй экземпляр: другой диск или смонтированная сетевая папка. Пусто — не копировать.
OFFSITE_DIR="${OFFSITE_DIR:-}"
KEEP="${KEEP:-14}"
COMPOSE=(docker compose -f "$SCRIPT_DIR/docker-compose.yml")

timestamp="$(date +%Y-%m-%d_%H-%M-%S)"
target="$BACKUP_DIR/label-stock_$timestamp.dump"
mkdir -p "$BACKUP_DIR"

# Пишем во временный файл: оборванный дамп не должен выглядеть как готовый бэкап.
"${COMPOSE[@]}" exec -T postgres pg_dump -U label_stock -d label_stock -Fc > "$target.partial"
mv "$target.partial" "$target"
echo "$(date -Iseconds) бэкап создан: $target ($(du -h "$target" | cut -f1))"

rotate() {
  local dir="$1"
  # Имена содержат дату, поэтому сортировка по имени = по времени.
  local files excess
  files="$(ls -1 "$dir"/label-stock_*.dump 2>/dev/null | sort || true)"
  [[ -z "$files" ]] && return 0
  excess=$(( $(printf '%s\n' "$files" | wc -l) - KEEP ))
  (( excess > 0 )) || return 0
  printf '%s\n' "$files" | head -n "$excess" | while read -r old; do
    rm -f -- "$old"
    echo "$(date -Iseconds) удалён старый бэкап: $old"
  done
}

rotate "$BACKUP_DIR"

if [[ -n "$OFFSITE_DIR" ]]; then
  mkdir -p "$OFFSITE_DIR"
  cp -- "$target" "$OFFSITE_DIR/"
  rotate "$OFFSITE_DIR"
  echo "$(date -Iseconds) копия отправлена в $OFFSITE_DIR"
fi
