#!/bin/sh
#
# Runs your program. Must work from any working directory.
#
# The tester runs .codelarpers/compile.sh once from the repository root, then
# .codelarpers/run.sh for every test from a temporary working directory.

set -e

exec python3 -u "$(dirname "$0")/../app/main.py" "$@"
