#!/usr/bin/env bash
# Native development services. All state stays in the ignored work/local tree.
set -euo pipefail
umask 077

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$repo_dir/work/local"
data_dir="$runtime_dir/postgres"
api_binary="$runtime_dir/game"
api_pid_file="$runtime_dir/auth.pid"
password_file=""
trap 'if [[ -n "$password_file" ]]; then rm -f "$password_file"; fi' EXIT

die() { printf '%s\n' "$*" >&2; exit 1; }

find_postgres() {
  pg_bin="${PGBIN:-}"
  if [[ -z "$pg_bin" ]]; then
    for candidate in "$runtime_dir/postgresql/bin" \
      /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin \
      /usr/local/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin; do
      if [[ -x "$candidate/pg_ctl" ]]; then pg_bin="$candidate"; break; fi
    done
  fi
  if [[ -z "$pg_bin" ]] && command -v pg_ctl >/dev/null 2>&1; then
    pg_bin="$(dirname "$(command -v pg_ctl)")"
  fi
  [[ -x "$pg_bin/pg_ctl" ]] || die "PostgreSQL is missing. Install PostgreSQL 17 or set PGBIN to its bin directory."
}

managed_api_pid() {
  [[ -f "$api_pid_file" ]] || return 1
  IFS= read -r api_pid < "$api_pid_file" || return 1
  [[ "$api_pid" =~ ^[1-9][0-9]*$ ]] || return 1
  kill -0 "$api_pid" 2>/dev/null || return 1
  local process_command
  process_command="$(ps -ww -p "$api_pid" -o command= 2>/dev/null)" || return 1
  [[ "$process_command" == "$api_binary" ]]
}

api_ready() {
  curl --silent --fail --max-time 2 http://127.0.0.1:8080/v1/health >/dev/null 2>&1
}

start_services() {
  local go_binary="${ROAM_GO_BIN:-}"
  if [[ -z "$go_binary" && -x "$runtime_dir/go/bin/go" ]]; then
    go_binary="$runtime_dir/go/bin/go"
  fi
  if [[ -z "$go_binary" ]]; then go_binary="$(command -v go || true)"; fi
  [[ -x "$go_binary" ]] || die "Go 1.26 is missing. Install it or set ROAM_GO_BIN to the Go executable."
  command -v curl >/dev/null 2>&1 || die "curl is required for local readiness checks."
  mkdir -p "$runtime_dir"
  for program in initdb postgres pg_ctl psql createdb; do
    [[ -x "$pg_bin/$program" ]] || die "Missing PostgreSQL program: $program"
  done
  if [[ -f "$data_dir/PG_VERSION" ]]; then
    local stored_major installed_major
    stored_major="$(cat "$data_dir/PG_VERSION")"
    installed_major="$("$pg_bin/postgres" --version | awk '{print $3}' | cut -d. -f1)"
    [[ "$stored_major" == "$installed_major" ]] || die "The existing cluster uses PostgreSQL $stored_major; choose matching PGBIN. Its data has been retained."
  else
    password_file="$(mktemp "$runtime_dir/init-password.XXXXXX")"
    printf '%s\n' 'lisboa_dev' > "$password_file"
    "$pg_bin/initdb" --pgdata="$data_dir" --username=lisboa \
      --auth=scram-sha-256 --encoding=UTF8 --locale=C \
      --pwfile="$password_file" --no-instructions > "$runtime_dir/initdb.log" 2>&1 || \
      die "PostgreSQL initialization failed; see work/local/initdb.log."
    rm -f "$password_file"
    password_file=""
  fi
  if ! "$pg_bin/pg_ctl" -D "$data_dir" status >/dev/null 2>&1; then
    # TCP only: no default socket or system service is created outside work/.
    "$pg_bin/pg_ctl" -D "$data_dir" -l "$runtime_dir/postgres.log" \
      -o "-h 127.0.0.1 -p 55433 -k ''" -w start || \
      die "PostgreSQL could not start; see work/local/postgres.log."
  fi
  local database_exists
  database_exists="$(PGPASSWORD=lisboa_dev "$pg_bin/psql" \
    -h 127.0.0.1 -p 55433 -U lisboa -d postgres -Atq -v ON_ERROR_STOP=1 \
    -c "SELECT 1 FROM pg_database WHERE datname = 'lisboa'")" || \
    die "The local database credentials do not match the development setup."
  if [[ "$database_exists" != 1 ]]; then
    PGPASSWORD=lisboa_dev "$pg_bin/createdb" -h 127.0.0.1 -p 55433 -U lisboa lisboa
  fi
  if ! managed_api_pid; then
    if api_ready; then
      die "Port 8080 already serves an API this helper does not manage. It has been left running."
    fi
    rm -f "$api_pid_file"
    (
      cd "$repo_dir/services/game"
      GOCACHE="$runtime_dir/go-cache" GOMODCACHE="$runtime_dir/go-mod" \
        "$go_binary" build -o "$api_binary" .
    )
    DATABASE_URL='postgres://lisboa:lisboa_dev@127.0.0.1:55433/lisboa?sslmode=disable' \
      PROJECT_ROOT="$repo_dir" LISTEN_ADDR=127.0.0.1:8080 COOKIE_SECURE=false \
      MIGRATE_ONLY=false BOOTSTRAP_ADMIN_HANDLE= \
      nohup "$api_binary" > "$runtime_dir/auth.log" 2>&1 < /dev/null &
    printf '%s\n' "$!" > "$api_pid_file"
  fi
  for ((attempt = 0; attempt < 100; attempt++)); do
    managed_api_pid || die "The local API stopped; see work/local/auth.log."
    if api_ready; then
      printf '%s\n' 'PostgreSQL ready at 127.0.0.1:55433; account API ready at http://127.0.0.1:8080.'
      return
    fi
    sleep 0.1
  done
  die "The account API is not ready; see work/local/auth.log."
}

stop_services() {
  # A reused PID or denied process inspection must never terminate another app.
  if [[ -f "$api_pid_file" ]]; then
    local recorded_pid
    IFS= read -r recorded_pid < "$api_pid_file" || recorded_pid=""
    if [[ "$recorded_pid" =~ ^[1-9][0-9]*$ ]] && kill -0 "$recorded_pid" 2>/dev/null && ! managed_api_pid; then
      die "The recorded API process could not be verified. Services and PID file were left unchanged; run this command in a normal terminal."
    fi
  fi
  if managed_api_pid; then
    kill -TERM "$api_pid"
    for ((attempt = 0; attempt < 50; attempt++)); do
      managed_api_pid || break
      sleep 0.1
    done
    managed_api_pid && die "The account API is still stopping. Retry shortly; it was not force-killed."
  fi
  rm -f "$api_pid_file"
  if [[ -f "$data_dir/PG_VERSION" ]] && "$pg_bin/pg_ctl" -D "$data_dir" status >/dev/null 2>&1; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m fast -w stop
  fi
  printf '%s\n' 'Managed local services stopped. PostgreSQL data and accounts are retained.'
}

status_services() {
  if [[ -f "$data_dir/PG_VERSION" ]] && "$pg_bin/pg_ctl" -D "$data_dir" status >/dev/null 2>&1; then
    printf '%s\n' 'Managed PostgreSQL is running.'
  else
    printf '%s\n' 'Managed PostgreSQL is stopped.'
  fi
  if managed_api_pid && api_ready; then
    printf '%s\n' 'Managed account API is healthy.'
  else
    printf '%s\n' 'Managed account API is stopped or not ready.'
  fi
}

case "${1:-}" in
  start) find_postgres; start_services ;;
  stop) find_postgres; stop_services ;;
  status) find_postgres; status_services ;;
  *) die 'Usage: bash scripts/local-services.sh start|stop|status' ;;
esac
