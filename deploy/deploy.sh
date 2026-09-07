#!/usr/bin/env bash
# Push the repo to the VPS over SSH and (re)start the server container.
#
#   SSH_HOST=root@1.2.3.4 REMOTE_DIR=/opt/watch2cp ./deploy/deploy.sh
#
# First run on a fresh host: after this finishes, ssh in and create
#   $REMOTE_DIR/deploy/server.env  (from deploy/server.env.example),
# then run this again — the container won't start without it.
set -euo pipefail

SSH_HOST="${SSH_HOST:?set SSH_HOST, e.g. root@1.2.3.4}"
REMOTE_DIR="${REMOTE_DIR:-/opt/watch2cp}"
SSH_PORT="${SSH_PORT:-22}"

here="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ syncing $here  →  $SSH_HOST:$REMOTE_DIR"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'apps/web/dist' \
  --exclude 'apps/*/data' \
  --exclude '**/.env' \
  --exclude '**/.env.bak.*' \
  --exclude '.claude*' \
  --exclude '*.txt' --exclude '*.jpg' --exclude '*.png' \
  -e "ssh -p $SSH_PORT" \
  "$here/" "$SSH_HOST:$REMOTE_DIR/"

echo "→ building + starting container"
ssh -p "$SSH_PORT" "$SSH_HOST" bash -s <<EOF
set -euo pipefail
cd "$REMOTE_DIR"
if [ ! -f deploy/server.env ]; then
  echo "!! $REMOTE_DIR/deploy/server.env is missing — copy it from deploy/server.env.example and fill it in, then re-run." >&2
  exit 1
fi
docker compose -f deploy/compose.yml up -d --build
docker compose -f deploy/compose.yml ps
EOF

echo "✓ done. Health: ssh $SSH_HOST 'curl -sf localhost:4000/health'"
