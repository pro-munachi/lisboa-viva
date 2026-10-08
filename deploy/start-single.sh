#!/bin/sh
set -eu

terminate() {
  trap - TERM INT
  kill "$game_pid" "$web_pid" 2>/dev/null || true
  wait "$game_pid" "$web_pid" 2>/dev/null || true
}

trap 'terminate; exit 143' TERM
trap 'terminate; exit 130' INT

# Railway sets PORT for the public web process. Keep the Go API on a
# different loopback port, even when Railway chooses 8080 for Next.js.
web_port=${PORT:-10000}
if [ "$web_port" = 18080 ]; then
  game_port=18081
else
  game_port=18080
fi
export LISTEN_ADDR="127.0.0.1:$game_port"
export API_INTERNAL_URL="http://127.0.0.1:$game_port"

/app/game &
game_pid=$!
cd /app/web
node /app/web/node_modules/next/dist/bin/next start \
  --hostname 0.0.0.0 --port "$web_port" &
web_pid=$!

while kill -0 "$game_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

terminate
exit 1
