#!/bin/sh
set -eu

terminate() {
  trap - TERM INT
  kill "$game_pid" "$web_pid" 2>/dev/null || true
  wait "$game_pid" "$web_pid" 2>/dev/null || true
}

trap 'terminate; exit 143' TERM
trap 'terminate; exit 130' INT

/app/game &
game_pid=$!
cd /app/web
node /app/web/node_modules/next/dist/bin/next start \
  --hostname 0.0.0.0 --port "${PORT:-10000}" &
web_pid=$!

while kill -0 "$game_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

terminate
exit 1
