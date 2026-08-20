#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/teach-me-bootstrap.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

mkdir -p "$test_root/bin"
cat >"$test_root/bin/vp" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$test_root/bin/vp"
export PATH="$test_root/bin:$PATH"

"$script_dir/bootstrap.sh" "$test_root/empty" >/dev/null
test -f "$test_root/empty/.teach-me-template"
test -d "$test_root/empty/.git"
test "$(git -C "$test_root/empty" rev-list --count HEAD)" -eq 1
"$script_dir/bootstrap.sh" "$test_root/empty" >/dev/null
test "$(git -C "$test_root/empty" rev-list --count HEAD)" -eq 1

mkdir -p "$test_root/outer"
git init "$test_root/outer" >/dev/null
(
  cd "$test_root/outer"
  "$script_dir/bootstrap.sh" >/dev/null
)
test -d "$test_root/outer/.lessons/.git"
grep -Fxq '/.lessons/' "$test_root/outer/.git/info/exclude"

mkdir -p "$test_root/conflict/.lessons"
touch "$test_root/conflict/.lessons/keep"
git init "$test_root/conflict" >/dev/null
if (cd "$test_root/conflict" && "$script_dir/bootstrap.sh" >/dev/null 2>&1); then
  echo "bootstrap overwrote an unmarked directory" >&2
  exit 1
fi

echo "bootstrap checks passed"
