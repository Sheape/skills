#!/bin/bash
set -euo pipefail

readonly bundle_id="com.t3tools.t3code"
readonly log_path="/tmp/reopen-t3-code-${UID}.log"

app_pid() {
  local value
  value=$(/usr/bin/lsappinfo info -only pid -app "$bundle_id" 2>/dev/null) || return 1
  value="${value#*=}"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$value"
}

app_path() {
  local value
  value=$(/usr/bin/lsappinfo info -only executablepath -app "$bundle_id" 2>/dev/null) || return 1
  value="${value#*=\"}"
  value="${value%\"}"
  printf '%s\n' "${value%/Contents/MacOS/*}"
}

app_hidden() {
  local value
  value=$(/usr/bin/lsappinfo info -only hidden -app "$bundle_id" 2>/dev/null) || return 1
  printf '%s\n' "${value#*=}"
}

check_installation() {
  local app_path
  app_path="$(app_path)"
  test -d "$app_path"
  printf 'Found T3 Code at %s\n' "$app_path"
}

wait_for_state() {
  local expected="$1"
  local attempt

  for ((attempt = 0; attempt < 300; attempt++)); do
    if app_pid >/dev/null; then
      [[ "$expected" == true ]] && return 0
    else
      [[ "$expected" == false ]] && return 0
    fi
    /bin/sleep 0.1
  done

  printf 'Timed out waiting for T3 Code running=%s\n' "$expected" >&2
  return 1
}

wait_until_hidden() {
  local attempt

  for ((attempt = 0; attempt < 300; attempt++)); do
    [[ "$(app_hidden)" == true ]] && return 0
    /bin/sleep 0.1
  done

  printf 'Timed out waiting for T3 Code to hide\n' >&2
  return 1
}

run_worker() {
  local installed_app_path="$2"
  local job_label="$3"
  local pid

  trap '/bin/launchctl remove '"$job_label"' >/dev/null 2>&1 || true' EXIT
  /bin/sleep 10
  if pid="$(app_pid)"; then
    /bin/kill -TERM "$pid"
  fi
  wait_for_state false
  /usr/bin/open -gj "$installed_app_path"
  wait_for_state true
  wait_until_hidden
  printf 'T3 Code reopened hidden.\n'
}

if [[ "${1:-}" == "--check" ]]; then
  check_installation
  exit
fi

if [[ "${1:-}" == "--worker" ]]; then
  run_worker "$@"
  exit
fi

readonly installed_app_path="$(app_path)"
test -d "$installed_app_path"

readonly script_dir="$(cd "$(dirname "$0")" && pwd -P)"
readonly script_path="$script_dir/$(basename "$0")"
readonly job_label="com.t3tools.reopen-t3-code.${UID}.$$"

/bin/launchctl submit -l "$job_label" -o "$log_path" -e "$log_path" -- "$script_path" --worker "$installed_app_path" "$job_label"
printf 'T3 Code will quit in 10 seconds. Relaunch log: %s\n' "$log_path"
