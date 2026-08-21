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
  need launchctl
  check_tailscale

  local port
  for ((port = 3001; port <= 3999; port++)); do
    if ! local_port_used "$port" \
      && ! tailscale_port_used "$port" \
      && ! job_loaded "$port" \
      && [[ ! -e "$(state_dir "$port")" ]]; then
      printf '%s\n' "$port"
      return
    fi
  done
  fail 'no free port found from 3001 through 3999'
}

launch_domain() {
  printf 'gui/%s\n' "$(id -u)"
}

job_label() {
  printf 'io.agent-skills.tailscale-serve.%s.%s\n' "$(id -u)" "$1"
}

job_target() {
  printf '%s/%s\n' "$(launch_domain)" "$(job_label "$1")"
}

job_loaded() {
  launchctl print "$(job_target "$1")" >/dev/null 2>&1
}

job_running() {
  launchctl print "$(job_target "$1")" 2>/dev/null | grep -q 'state = running'
}

write_job() {
  local directory="$1" port="$2" working_directory="$3"
  local executable label plist argument index=1
  shift 3

  executable="$(command -v "$1")" || {
    printf 'server command not found: %s\n' "$1" >&2
    return 1
  }
  [[ "$executable" == /* ]] || executable="$working_directory/${executable#./}"
  [[ -x "$executable" ]] || {
    printf 'server command is not executable: %s\n' "$executable" >&2
    return 1
  }
  shift

  label="$(job_label "$port")"
  plist="$directory/job.plist"
  plutil -create xml1 "$plist" || return
  plutil -insert Label -string "$label" "$plist" || return
  plutil -insert ProgramArguments -array "$plist" || return
  plutil -insert ProgramArguments.0 -string "$executable" "$plist" || return
  for argument in "$@"; do
    plutil -insert "ProgramArguments.$index" -string "$argument" "$plist" || return
    index=$((index + 1))
  done
  plutil -insert WorkingDirectory -string "$working_directory" "$plist" || return
  plutil -insert EnvironmentVariables -dictionary "$plist" || return
  plutil -insert EnvironmentVariables.PATH -string "$PATH" "$plist" || return
  plutil -insert EnvironmentVariables.HOME -string "$HOME" "$plist" || return
  if [[ -n "${TMPDIR:-}" ]]; then
    plutil -insert EnvironmentVariables.TMPDIR -string "$TMPDIR" "$plist" || return
  fi
  plutil -insert RunAtLoad -bool YES "$plist" || return
  plutil -insert StandardOutPath -string "$directory/server.log" "$plist" || return
  plutil -insert StandardErrorPath -string "$directory/server.log" "$plist" || return
  printf '%s\n' "$label" > "$directory/label"
}

stop_job() {
  local directory="$1" port="$2" expected label plist_label plist_cwd
  [[ -r "$directory/label" && -r "$directory/job.plist" && -r "$directory/cwd" ]] || {
    printf 'missing launchd ownership state for port %s\n' "$port" >&2
    return 1
  }

  expected="$(job_label "$port")"
  label="$(< "$directory/label")"
  plist_label="$(plutil -extract Label raw -o - "$directory/job.plist" 2>/dev/null || true)"
  plist_cwd="$(plutil -extract WorkingDirectory raw -o - "$directory/job.plist" 2>/dev/null || true)"
  [[ "$label" == "$expected" && "$plist_label" == "$expected" \
    && "$plist_cwd" == "$(< "$directory/cwd")" ]] || {
    printf 'launchd ownership check failed for port %s\n' "$port" >&2
    return 1
  }

  if job_loaded "$port"; then
    launchctl bootout "$(job_target "$port")"
  fi
}

remove_state() {
  local directory="$1"
  rm -f "$directory/argv" "$directory/cwd" "$directory/type" \
    "$directory/job.plist" "$directory/label" "$directory/server.log"
  rmdir "$directory" 2>/dev/null || true
}

open_server() {
  local app_type="$1" port="$2" directory listeners
  local launch_output serve_output status_json dns_name attempt
  shift 2

  valid_port "$port" || fail "invalid port: $port"
  [[ -n "$app_type" && "$app_type" != *$'\n'* ]] || fail 'application type must be one line'
  [[ "${1:-}" == "--" ]] || fail 'expected -- before the server command'
  shift
  (($#)) || fail 'missing server command'

  need tailscale
  need jq
  need lsof
  need launchctl
  need plutil
  [[ "$(uname -s)" == Darwin ]] || fail 'persistent server launch requires macOS launchd'
  check_tailscale
  local_port_used "$port" && fail "local port $port is already in use"
  tailscale_port_used "$port" && fail "Tailscale port $port is already configured"
  job_loaded "$port" && fail "launchd job already exists for port $port"

  directory="$(state_dir "$port")"
  [[ ! -e "$directory" ]] || fail "state already exists for port $port; close it first"
  mkdir -p "$directory"
  printf '%s\n' "$PWD" > "$directory/cwd"
  printf '%s\n' "$app_type" > "$directory/type"
  printf '%s\0' "$@" > "$directory/argv"

  if ! launch_output="$(write_job "$directory" "$port" "$PWD" "$@" 2>&1)"; then
    remove_state "$directory"
    fail "$launch_output"
  fi
  if ! launch_output="$(launchctl bootstrap "$(launch_domain)" "$directory/job.plist" 2>&1)"; then
    remove_state "$directory"
    fail "$launch_output"
  fi

  listeners=''
  for ((attempt = 0; attempt < 60; attempt++)); do
    listeners="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -n "$listeners" ]] && break
    job_running "$port" || break
    sleep 0.5
  done

  if [[ -z "$listeners" ]]; then
    tail -n 30 "$directory/server.log" >&2 || true
    stop_job "$directory" "$port" || fail "server failed and launchd job could not be stopped on port $port"
    remove_state "$directory"
    fail "server did not stay up on 127.0.0.1:$port"
  fi

  if ! serve_output="$(tailscale serve --bg --yes --https="$port" "127.0.0.1:$port" 2>&1)"; then
    stop_job "$directory" "$port" || fail "$serve_output; launchd job could not be stopped"
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
    stop_job "$directory" "$port" || fail "Tailscale setup failed and launchd job could not be stopped"
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
    stop_job "$directory" "$port" || fail "Tailscale returned no DNS name and launchd job could not be stopped"
    remove_state "$directory"
    fail 'Tailscale returned no DNS name'
  fi

  printf 'The %s https://%s:%s\n' "$app_type" "$dns_name" "$port"
}

close_server() {
  local port="$1" directory serve_failed=0
  valid_port "$port" || fail "invalid port: $port"
  need tailscale
  need launchctl
  need plutil

  directory="$(state_dir "$port")"
  if [[ -d "$directory" ]]; then
    stop_job "$directory" "$port" || fail "could not stop owned launchd job on port $port"
  fi

  tailscale serve --yes --https="$port" off >/dev/null 2>&1 || serve_failed=1

  ((serve_failed == 0)) || fail "could not close Tailscale HTTPS port $port"
  [[ ! -d "$directory" ]] || remove_state "$directory"
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
