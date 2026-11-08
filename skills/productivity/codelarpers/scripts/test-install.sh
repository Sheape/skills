#!/usr/bin/env bash
# Drives the real install.sh against a fake `gh` that serves a fake codelarper artifact.
# Checks: artifact install, idempotent rerun, version-mismatch refusal, server start.
set -euo pipefail

fail() {
  echo "test-install.sh: $*" >&2
  exit 1
}

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
want="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$skill_dir/cli/Cargo.toml" | head -1)"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/fakebin" "$root/bin"
export CALLS="$root/calls.log"
export FAKE_VERSION="$want"

cat >"$root/fakebin/gh" <<'EOF'
#!/usr/bin/env bash
echo "gh $*" >>"$CALLS"
case "$1 $2" in
  "auth status") exit 0 ;;
  "run list") echo 4242 ;;
  "run download")
    dir="${@: -1}"
    mkdir -p "$dir"
    cat >"$dir/codelarper" <<FAKE
#!/usr/bin/env bash
echo "codelarper \$*" >>"$CALLS"
case "\$1" in
  --version) echo "codelarper $FAKE_VERSION" ;;
  dev) echo "/fake/home" ;;
  serve) echo "Started: http://localhost:7357" ;;
esac
FAKE
    ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$root/fakebin/gh"
export PATH="$root/fakebin:$PATH"
export CODELARPER_BIN_DIR="$root/bin"

out="$("$skill_dir/scripts/install.sh")"
grep -q "Downloaded codelarper $want" <<<"$out" || fail "first run did not install from the artifact: $out"
[[ -x "$root/bin/codelarper" ]] || fail "binary not installed"
grep -q "codelarper serve --detach" "$CALLS" || fail "server was not started"

: >"$CALLS"
out="$("$skill_dir/scripts/install.sh")"
grep -q "up to date" <<<"$out" || fail "second run was not idempotent: $out"
! grep -q "run download" "$CALLS" || fail "second run downloaded again"

export FAKE_VERSION="0.0.0-old"
if out="$(CODELARPER_FORCE=1 "$skill_dir/scripts/install.sh" artifact 2>&1)"; then fail "accepted a mismatched artifact"; fi
grep -q "expects $want" <<<"$out" || fail "mismatch message missing: $out"
[[ "$("$root/bin/codelarper" --version)" == "codelarper $want" ]] || fail "a failed install replaced the working binary"

echo "install ok"
