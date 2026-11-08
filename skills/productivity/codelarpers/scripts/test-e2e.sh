#!/usr/bin/env bash
# End-to-end check of a codelarpers binary against the example course:
# validate -> publish -> clone -> fail -> pass every stage -> serve the API and UI.
# Uses a throwaway home and port; never touches ~/.local/share/codelarpers.
set -euo pipefail

fail() {
  echo "test-e2e.sh: $*" >&2
  exit 1
}
has() { grep -qF -- "$2" <<<"$1"; }

[[ $# -eq 1 ]] || fail "usage: test-e2e.sh <path/to/codelarpers>"
bin="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[[ -x "$bin" ]] || fail "$bin is not executable"
skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

root="$(mktemp -d)"
export CODELARPERS_HOME="$root/home"
export CODELARPERS_PORT="${CODELARPERS_TEST_PORT:-17357}"
export NO_COLOR=1
cleanup() {
  "$bin" serve --stop >/dev/null 2>&1 || true
  rm -rf "$root"
}
trap cleanup EXIT

mkdir -p "$CODELARPERS_HOME/courses"
cp -R "$skill_dir/assets/example-course/wc" "$CODELARPERS_HOME/courses/wc"

echo "== validate"
"$bin" dev validate wc --repeat 2
echo "== validate: reject a near-miss the tests miss"
nm="$CODELARPERS_HOME/courses/wc/stages/lc1/near-misses/python/no-bug"
mkdir -p "$nm/app"
cp "$CODELARPERS_HOME/courses/wc/solution/python/app/main.py" "$nm/app/main.py"
if out="$("$bin" dev validate wc --stage lc1 2>&1)"; then fail "validate accepted a near-miss that passes its stage"; fi
has "$out" "the tests miss this bug" || fail "validate did not name the uncaught near-miss: $out"
rm -rf "$nm"
echo "== publish"
"$bin" dev publish wc

echo "== learner: clone, ping, fail"
cd "$root"
git clone -q "$CODELARPERS_HOME/repos/wc.git" codelarpers-wc
cd codelarpers-wc
has "$("$bin" ping)" "Connection successful" || fail "ping did not link the repository"
if "$bin" test >"$root/fail.log" 2>&1; then fail "starter code passed stage 1"; fi
grep -q "Expected exit code 0, got: 1" "$root/fail.log" || fail "failure log lacks the expected mismatch line"

echo "== learner: pass every stage"
cp "$CODELARPERS_HOME/courses/wc/solution/python/app/main.py" app/main.py
for _ in 1 2 3 4 5; do
  "$bin" submit -m "progress" >"$root/submit.log" 2>&1 || {
    cat "$root/submit.log"
    fail "submit failed"
  }
done
status="$("$bin" status)"
has "$status" "5/5 stages · 110 pts" || fail "expected 5/5 stages and 110 pts, got: $status"
has "$(git -C "$CODELARPERS_HOME/repos/wc.git" log --oneline)" progress || fail "submit did not push to the local remote"

echo "== server"
"$bin" serve --detach >/dev/null
api() { curl -fsS "http://127.0.0.1:$CODELARPERS_PORT$1"; }
has "$(api /api/health)" '"app":"codelarpers"' || fail "health"
has "$(api /api/catalog)" '"slug":"wc"' || fail "catalog lacks wc"
has "$(api /api/courses/wc/stages/lc1)" '"status":"completed"' || fail "stage lc1 not completed"
has "$(api /api/courses/wc/stages/bt3/examples)" 'uutils/coreutils' || fail "examples not served after completion"
has "$(api /courses/wc/overview)" '<div id="root">' || fail "UI not embedded"
has "$(api /api/catalog)" '"iconBackground":"#ffffff"' || fail "catalog lacks the icon tile colour"
has "$(api /api/courses/wc/icon)" '<svg' || fail "course icon not served"
"$bin" serve --stop >/dev/null

echo "e2e ok"
