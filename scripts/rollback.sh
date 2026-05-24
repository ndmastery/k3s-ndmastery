#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <app-name>" >&2
  exit 64
fi

kubectl argo rollouts abort "$1" -n ndmastery || true
kubectl argo rollouts undo "$1" -n ndmastery
kubectl argo rollouts status "$1" -n ndmastery --timeout=180s
