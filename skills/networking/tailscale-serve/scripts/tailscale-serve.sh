#!/usr/bin/env bash
set -euo pipefail

state_root="${XDG_STATE_HOME:-${HOME}/.local/state}/tailscale-serve"

fail() {
  printf 'tailscale-serve: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( "$1" >= 1 && "$1" <= 65535 && "$1" != 3000 ))
}

state_dir() {
  printf '%s/%s\n' "$state_root" "$1"
}

local_port_used() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

tailscale_port_used() {
  tailscale serve status --json 2>/dev/null \
    | jq -e --arg port "$1" '[.TCP[$port], .Foreground[]?.TCP[$port]] | any(. != null)' >/dev/null
}

check_tailscale() {
  tailscale status --json >/dev/null 2>&1 \
    || fail 'Tailscale is not connected; sign in and try again'
}

pick_port() {
  need tailscale
  need jq
  need lsof
  check_tailscale

  local port
  for ((port = 3001; port <= 3999; port++)); do
    if ! local_port_used "$port" \
      && ! tailscale_port_used "$port" \
      && [[ ! -e "$(state_dir "$port")" ]]; then
      printf '%s\n' "$port"
      return
    fi
  done
  fail 'no free port found from 3001 through 3999'
}

process_signature() {
  ps -p "$1" -o command= 2>/dev/null | sed 's/^[[:space:]]*//'
}

is_descendant() {
  local child="$1" ancestor="$2" parent
  while [[ "$child" =~ ^[0-9]+$ ]] && (( child > 1 )); do
    [[ "$child" == "$ancestor" ]] && return 0
    parent="$(ps -p "$child" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    child="$parent"
  done
  return 1
}

record_process() {
  local directory="$1" pid="$2" signature
  signature="$(process_signature "$pid")"
  [[ -n "$signature" ]] && printf '%s\t%s\n' "$pid" "$signature" >> "$directory/processes"
}

stop_processes() {
  local directory="$1" pid expected actual attempt
  local -a pids=()
  [[ -f "$directory/processes" ]] || return

  while IFS=$'\t' read -r pid expected; do
    actual="$(process_signature "$pid")"
    [[ -n "$actual" && "$actual" == "$expected" ]] && pids+=("$pid")
  done < "$directory/processes"

  ((${#pids[@]})) || return
  kill -TERM "${pids[@]}" 2>/dev/null || true

  for ((attempt = 0; attempt < 20; attempt++)); do
    local -a alive=()
    for pid in "${pids[@]}"; do
      kill -0 "$pid" 2>/dev/null && alive+=("$pid")
    done
    ((${#alive[@]} == 0)) && return
    pids=("${alive[@]}")
    sleep 0.25
  done

  kill -KILL "${pids[@]}" 2>/dev/null || true
}

remove_state() {
  local directory="$1"
  rm -f "$directory/argv" "$directory/cwd" "$directory/type" \
    "$directory/processes" "$directory/server.log"
  rmdir "$directory" 2>/dev/null || true
}

open_server() {
  local app_type="$1" port="$2" directory server_pid listeners listener
  local serve_output status_json dns_name attempt
  shift 2

  valid_port "$port" || fail "invalid port: $port"
  [[ -n "$app_type" && "$app_type" != *$'\n'* ]] || fail 'application type must be one line'
  [[ "${1:-}" == "--" ]] || fail 'expected -- before the server command'
  shift
  (($#)) || fail 'missing server command'

  need tailscale
  need jq
  need lsof
  check_tailscale
  local_port_used "$port" && fail "local port $port is already in use"
  tailscale_port_used "$port" && fail "Tailscale port $port is already configured"

  directory="$(state_dir "$port")"
  [[ ! -e "$directory" ]] || fail "state already exists for port $port; close it first"
  mkdir -p "$directory"
  printf '%s\n' "$PWD" > "$directory/cwd"
  printf '%s\n' "$app_type" > "$directory/type"
  printf '%s\0' "$@" > "$directory/argv"

  nohup "$@" > "$directory/server.log" 2>&1 &
  server_pid=$!

  listeners=''
  for ((attempt = 0; attempt < 60; attempt++)); do
    listeners="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -n "$listeners" ]] && break
    kill -0 "$server_pid" 2>/dev/null || break
    sleep 0.5
  done

  if [[ -z "$listeners" ]] || ! kill -0 "$server_pid" 2>/dev/null; then
    tail -n 30 "$directory/server.log" >&2 || true
    kill -TERM "$server_pid" 2>/dev/null || true
    remove_state "$directory"
    fail "server did not stay up on 127.0.0.1:$port"
  fi

  record_process "$directory" "$server_pid"
  while IFS= read -r listener; do
    if [[ -n "$listener" && "$listener" != "$server_pid" ]] \
      && is_descendant "$listener" "$server_pid"; then
      record_process "$directory" "$listener"
    fi
  done <<< "$listeners"

  if ! serve_output="$(tailscale serve --bg --yes --https="$port" "127.0.0.1:$port" 2>&1)"; then
    stop_processes "$directory"
    remove_state "$directory"
    fail "$serve_output"
  fi

  status_json=''
  for ((attempt = 0; attempt < 20; attempt++)); do
    status_json="$(tailscale serve status --json 2>/dev/null || true)"
    if jq -e --arg port "$port" --arg proxy "http://127.0.0.1:$port" \
      '(.TCP[$port].HTTPS == true) and any(.Web[]?.Handlers[]?; .Proxy == $proxy)' \
      >/dev/null 2>&1 <<< "$status_json"; then
      break
    fi
    sleep 0.25
  done

  if ! jq -e --arg port "$port" --arg proxy "http://127.0.0.1:$port" \
    '(.TCP[$port].HTTPS == true) and any(.Web[]?.Handlers[]?; .Proxy == $proxy)' \
    >/dev/null 2>&1 <<< "$status_json"; then
    tailscale serve --yes --https="$port" off >/dev/null 2>&1 || true
    stop_processes "$directory"
    remove_state "$directory"
    fail "Tailscale did not configure HTTPS port $port"
  fi

  dns_name="$(
    tailscale status --json 2>/dev/null \
      | jq -r '.Self.DNSName' \
      | sed 's/\.$//'
  )"
  if [[ -z "$dns_name" || "$dns_name" == 'null' ]]; then
    tailscale serve --yes --https="$port" off >/dev/null 2>&1 || true
    stop_processes "$directory"
    remove_state "$directory"
    fail 'Tailscale returned no DNS name'
  fi

  printf 'The %s https://%s:%s\n' "$app_type" "$dns_name" "$port"
}

close_server() {
  local port="$1" directory serve_failed=0
  valid_port "$port" || fail "invalid port: $port"
  need tailscale

  directory="$(state_dir "$port")"
  tailscale serve --yes --https="$port" off >/dev/null 2>&1 || serve_failed=1

  if [[ -d "$directory" ]]; then
    stop_processes "$directory"
    remove_state "$directory"
  fi

  ((serve_failed == 0)) || fail "could not close Tailscale HTTPS port $port"
  printf 'Closed Tailscale Serve and the server on port %s.\n' "$port"
}

restart_server() {
  local port="$1" directory app_type working_directory argument
  local -a command=()
  valid_port "$port" || fail "invalid port: $port"
  directory="$(state_dir "$port")"
  [[ -r "$directory/type" && -r "$directory/cwd" && -r "$directory/argv" ]] \
    || fail "no recorded server for port $port"

  app_type="$(< "$directory/type")"
  working_directory="$(< "$directory/cwd")"
  while IFS= read -r -d '' argument; do
    command+=("$argument")
  done < "$directory/argv"

  close_server "$port" >/dev/null
  cd "$working_directory" || fail "working directory no longer exists: $working_directory"
  open_server "$app_type" "$port" -- "${command[@]}"
}

mkdir -p "$state_root"
chmod 700 "$state_root"

case "${1:-}" in
  port)
    (($# == 1)) || fail 'usage: tailscale-serve.sh port'
    pick_port
    ;;
  open)
    (($# >= 5)) || fail 'usage: tailscale-serve.sh open <type> <port> -- <command> [args...]'
    shift
    open_server "$@"
    ;;
  close)
    (($# == 2)) || fail 'usage: tailscale-serve.sh close <port>'
    close_server "$2"
    ;;
  restart)
    (($# == 2)) || fail 'usage: tailscale-serve.sh restart <port>'
    restart_server "$2"
    ;;
  *)
    fail 'usage: tailscale-serve.sh {port|open|close|restart} ...'
    ;;
esac

