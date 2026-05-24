#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <app-name> <env-file>" >&2
  exit 64
fi

app="$1"
env_file="$2"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${root}/apps/${app}/secrets.enc.yaml"

if [[ ! -f "$env_file" ]]; then
  echo "env file not found: $env_file" >&2
  exit 66
fi

if ! command -v sops >/dev/null 2>&1; then
  echo "sops is required" >&2
  exit 69
fi

kubectl create secret generic "${app}-secret" \
  --namespace ndmastery \
  --from-env-file="$env_file" \
  --dry-run=client \
  -o yaml |
  sops --encrypt --input-type yaml --output-type yaml /dev/stdin > "$out"

chmod 0600 "$out"
echo "wrote encrypted secret: $out"
