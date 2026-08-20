#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_root="$(mktemp -d)"
port=39877

cleanup() {
  PATH="$test_root/bin:$PATH" XDG_STATE_HOME="$test_root/state" \
    FAKE_TAILSCALE_STATE="$test_root/tailscale-port" \
    bash "$script_dir/tailscale-serve.sh" close "$port" >/dev/null 2>&1 || true
  rm -rf "$test_root"
}
trap cleanup EXIT

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

export PATH="$test_root/bin:$PATH"
export XDG_STATE_HOME="$test_root/state"
export FAKE_TAILSCALE_STATE="$test_root/tailscale-port"

picked_port="$(bash "$script_dir/tailscale-serve.sh" port)"
[[ "$picked_port" != 3000 ]]

output="$(bash "$script_dir/tailscale-serve.sh" open frontend "$port" -- \
  node -e 'require("http").createServer((_, response) => response.end("ok")).listen(Number(process.argv[1]), "127.0.0.1")' "$port")"
[[ "$output" == "The frontend https://test-node.example.ts.net:$port" ]]

output="$(bash "$script_dir/tailscale-serve.sh" restart "$port")"
[[ "$output" == "The frontend https://test-node.example.ts.net:$port" ]]

bash "$script_dir/tailscale-serve.sh" close "$port" >/dev/null
[[ ! -e "$FAKE_TAILSCALE_STATE" ]]
! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
