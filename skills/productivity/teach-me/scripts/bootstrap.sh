#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_dir="$script_dir/../assets/template"
start_dir="$PWD"
outer_root=""

if git -C "$start_dir" rev-parse --show-toplevel >/dev/null 2>&1; then
  outer_root="$(git -C "$start_dir" rev-parse --show-toplevel)"
fi

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [destination]" >&2
  exit 2
fi

if [[ $# -eq 1 ]]; then
  destination="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
elif [[ -n "$outer_root" ]]; then
  destination="$outer_root/.lessons"
elif [[ -z "$(find "$start_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  destination="$start_dir"
else
  destination="$start_dir/.lessons"
fi

marker="$destination/.teach-me-template"
fresh=false

if [[ -f "$marker" ]]; then
  :
elif [[ -e "$destination" && -n "$(find "$destination" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing to overwrite non-teach-me directory: $destination" >&2
  exit 1
else
  mkdir -p "$destination"
  (
    cd "$template_dir"
    tar --exclude='./node_modules' --exclude='./dist' --exclude='./.vite' -cf - .
  ) | tar -xf - -C "$destination"
  mkdir -p "$destination/src/topics"
  fresh=true
fi

if [[ -n "$outer_root" && "$destination" == "$outer_root/.lessons" ]]; then
  exclude_file="$(git -C "$outer_root" rev-parse --git-path info/exclude)"
  [[ "$exclude_file" = /* ]] || exclude_file="$outer_root/$exclude_file"
  mkdir -p "$(dirname "$exclude_file")"
  grep -Fxq '/.lessons/' "$exclude_file" 2>/dev/null || printf '\n/.lessons/\n' >>"$exclude_file"
fi

if command -v vp >/dev/null 2>&1; then
  vite_plus="$(command -v vp)"
elif [[ -x "${HOME}/.vite-plus/bin/vp" ]]; then
  vite_plus="${HOME}/.vite-plus/bin/vp"
else
  command -v curl >/dev/null 2>&1 || {
    echo "Vite+ is missing and curl is unavailable." >&2
    exit 1
  }
  curl -fsSL https://vite.plus | bash
  vite_plus="${HOME}/.vite-plus/bin/vp"
fi

(
  cd "$destination"
  "$vite_plus" install --frozen-lockfile
  "$vite_plus" check
  "$vite_plus" test
  "$vite_plus" build
)

if [[ "$fresh" == true ]]; then
  git init "$destination" >/dev/null
  if ! git -C "$destination" config user.email >/dev/null; then
    git -C "$destination" config user.email "teach-me@local.invalid"
  fi
  if ! git -C "$destination" config user.name >/dev/null; then
    git -C "$destination" config user.name "Teach Me Agent"
  fi
  git -C "$destination" add --all
  git -C "$destination" commit -m "chore: bootstrap teaching workspace" >/dev/null
fi

printf '%s\n' "$destination"
