#!/usr/bin/env bash
# Install or update the codelarpers binary, then start its server. Idempotent.
#
#   install.sh            installed version matches cli/Cargo.toml? keep it. Otherwise
#                         download the CI artifact, falling back to a source build.
#   install.sh artifact   only the CI artifact (latest green run of codelarpers.yml on main)
#   install.sh source     only a local build (needs cargo, node and pnpm)
#
# Env: CODELARPERS_BIN_DIR (default ~/.local/bin), CODELARPERS_REPO (default Sheape/skills),
#      CODELARPERS_FORCE=1 to reinstall even when the version matches,
#      CODELARPERS_NO_SERVE=1 to skip starting the server.
set -euo pipefail

fail() {
  echo "install.sh: $*" >&2
  exit 1
}
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required for this install mode"; }

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_dir="${CODELARPERS_BIN_DIR:-$HOME/.local/bin}"
target_bin="$bin_dir/codelarpers"
repo="${CODELARPERS_REPO:-Sheape/skills}"
want="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$skill_dir/cli/Cargo.toml" | head -1)"
[[ -n "$want" ]] || fail "could not read the version from cli/Cargo.toml"

case "${1:-auto}" in
  auto | artifact | source) mode="${1:-auto}" ;;
  *) fail "usage: install.sh [auto|artifact|source]" ;;
esac

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) triple=aarch64-apple-darwin ;;
  Darwin-x86_64) triple=x86_64-apple-darwin ;;
  Linux-x86_64) triple=x86_64-unknown-linux-gnu ;;
  Linux-aarch64 | Linux-arm64) triple=aarch64-unknown-linux-gnu ;;
  *) triple="" ;;
esac

version_of() { "$1" --version 2>/dev/null | awk '{print $2}'; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

from_artifact() {
  [[ -n "$triple" ]] || return 1
  command -v gh >/dev/null 2>&1 || return 1
  gh auth status >/dev/null 2>&1 || return 1
  local run
  run="$(gh run list --repo "$repo" --workflow codelarpers.yml --branch main --status success --limit 1 \
    --json databaseId --jq '.[0].databaseId' 2>/dev/null)" || return 1
  [[ -n "$run" && "$run" != "null" ]] || return 1
  gh run download "$run" --repo "$repo" --name "codelarpers-$triple" --dir "$work/artifact" >/dev/null 2>&1 || return 1
  chmod +x "$work/artifact/codelarpers"
  local got
  got="$(version_of "$work/artifact/codelarpers")"
  if [[ "$got" != "$want" ]]; then
    echo "CI artifact is codelarpers $got; this skill expects $want." >&2
    return 1
  fi
  cp "$work/artifact/codelarpers" "$work/codelarpers"
  echo "Downloaded codelarpers $got ($triple) from $repo run $run."
}

from_source() {
  need cargo
  need pnpm
  (cd "$skill_dir/web" && pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null) || fail "web UI build failed"
  (cd "$skill_dir/cli" && cargo build --release --locked --quiet) || fail "cargo build failed"
  cp "$skill_dir/cli/target/release/codelarpers" "$work/codelarpers"
  echo "Built codelarpers $want from source."
}

current=""
[[ -x "$target_bin" ]] && current="$(version_of "$target_bin")"
if [[ "$mode" == auto && "$current" == "$want" && -z "${CODELARPERS_FORCE:-}" ]]; then
  echo "codelarpers $current is up to date at $target_bin."
else
  case "$mode" in
    artifact) from_artifact || fail "no usable CI artifact (needs gh logged in and a green codelarpers.yml run on main)" ;;
    source) from_source ;;
    auto) from_artifact || from_source ;;
  esac
  mkdir -p "$bin_dir"
  install -m 0755 "$work/codelarpers" "$target_bin.new"
  mv -f "$target_bin.new" "$target_bin"
  echo "Installed $target_bin ($(version_of "$target_bin"))."
fi

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "Note: $bin_dir is not on your PATH; add it so \`codelarpers\` works in every repository." >&2 ;;
esac

echo "Data: $("$target_bin" dev home)"
if [[ -z "${CODELARPERS_NO_SERVE:-}" ]]; then
  "$target_bin" serve --detach
fi
