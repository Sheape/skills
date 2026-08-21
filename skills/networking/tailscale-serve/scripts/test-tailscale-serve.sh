#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:-all}"
test_root="${2:-}"
port="${3:-39877}"

fail() {
  printf 'test-tailscale-serve: %s\n' "$*" >&2
  exit 1
}

configure_test() {
  [[ -n "$test_root" ]] || fail 'missing test root'
  export PATH="$test_root/bin:$PATH"
  export XDG_STATE_HOME="$test_root/state"
  export FAKE_TAILSCALE_STATE="$test_root/tailscale-port"
}

write_fake_tailscale() {
  mkdir -p "$test_root/bin" "$test_root/state"
  cat > "$test_root/bin/tailscale" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == status && "${2:-}" == --json ]]; then
  printf '%s\n' '{"Self":{"DNSName":"test-node.example.ts.net."}}'
elif [[ "${1:-}" == serve && "${2:-}" == status ]]; then
  if [[ -f "$FAKE_TAILSCALE_STATE" ]]; then
    port="$(< "$FAKE_TAILSCALE_STATE")"
    printf '{"TCP":{"%s":{"HTTPS":true}},"Web":{"test-node.example.ts.net:%s":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:%s"}}}}}\n' "$port" "$port" "$port"
  else
    printf '%s\n' '{"TCP":{},"Web":{}}'
  fi
elif [[ "$*" == *' off' ]]; then
  rm -f "$FAKE_TAILSCALE_STATE"
else
  for argument in "$@"; do
    if [[ "$argument" == --https=* ]]; then
      printf '%s\n' "${argument#--https=}" > "$FAKE_TAILSCALE_STATE"
    fi
  done
fi
EOF
  chmod +x "$test_root/bin/tailscale"
}

start_test() {
  configure_test
  write_fake_tailscale
  ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 \
    || fail "port $port is already in use"

  local picked_port output
  picked_port="$(bash "$script_dir/tailscale-serve.sh" port)"
  [[ "$picked_port" != 3000 ]]
  output="$(bash "$script_dir/tailscale-serve.sh" open frontend "$port" -- \
    node -e 'require("http").createServer((_, response) => response.end("ok")).listen(Number(process.argv[1]), "127.0.0.1")' "$port")"
  [[ "$output" == "The frontend https://test-node.example.ts.net:$port" ]]
}

check_test() {
  configure_test
  [[ "$(curl -fsS --max-time 2 "http://127.0.0.1:$port/")" == ok ]]
}

restart_test() {
  configure_test
  local output
  output="$(bash "$script_dir/tailscale-serve.sh" restart "$port")"
  [[ "$output" == "The frontend https://test-node.example.ts.net:$port" ]]
}

stop_test() {
  configure_test
  local state_directory label target
  state_directory="$XDG_STATE_HOME/tailscale-serve/$port"
  label="io.agent-skills.tailscale-serve.$(id -u).$port"
  target="gui/$(id -u)/$label"

  if [[ -d "$state_directory" ]]; then
    bash "$script_dir/tailscale-serve.sh" close "$port" >/dev/null
  fi
  [[ ! -e "$FAKE_TAILSCALE_STATE" ]]
  ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  ! launchctl print "$target" >/dev/null 2>&1
  [[ ! -e "$state_directory" ]]
  rm -rf "$test_root"
}

case "$mode" in
  start|check|restart|stop)
    "${mode}_test"
    ;;
  all)
    test_root="$(mktemp -d)"
    trap '[[ ! -d "$test_root" ]] || stop_test >/dev/null 2>&1 || true' EXIT
    start_test
    check_test
    restart_test
    check_test
    stop_test
    ;;
  *)
    fail 'usage: test-tailscale-serve.sh [all|start|check|restart|stop] [test-root] [port]'
    ;;
esac
