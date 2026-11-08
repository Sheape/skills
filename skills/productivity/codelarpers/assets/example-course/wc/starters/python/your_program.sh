#!/bin/sh
#
# Use this script to run your program LOCALLY: ./your_program.sh <args>
#
# It mirrors .codelarpers/compile.sh and .codelarpers/run.sh, which the tester uses.

set -e

dir="$(cd "$(dirname "$0")" && pwd)"
exec "$dir/.codelarpers/run.sh" "$@"
