#!/usr/bin/env bash
# Snapshot all Hermes profiles into a timestamped tarball.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${HERMES_DATA_DIR:-./data/hermes}"
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/hermes-profiles-$STAMP.tar.gz"
tar -czf "$OUT" -C "$SRC" .
echo "Wrote $OUT"
