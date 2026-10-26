#!/usr/bin/env bash
# Demo wrapper: .start_docker.sh -b <board> west ...
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BOARD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b) BOARD="$2"; shift 2 ;;
    west)
      shift
      echo "[.start_docker.sh] board=${BOARD:-unset} → west $*"
      export PATH="${ROOT}/bin:${PATH}"
      exec "${ROOT}/bin/west" "$@"
      ;;
    *) echo ".start_docker.sh: unexpected arg: $1" >&2; exit 2 ;;
  esac
done
echo "usage: .start_docker.sh -b <board> west <args...>" >&2
exit 2
