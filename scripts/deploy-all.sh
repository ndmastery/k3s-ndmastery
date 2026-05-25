#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_BUILD=0
SKIP_BENCHMARK=0
SKIP_PREFLIGHT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-benchmark) SKIP_BENCHMARK=1; shift ;;
    --skip-preflight) SKIP_PREFLIGHT=1; shift ;;
    --help|-h)
      cat <<'USAGE'
usage: scripts/deploy-all.sh [--skip-build] [--skip-benchmark] [--skip-preflight]

Builds and pushes images, benchmarks them on this VM, generates manifests,
dry-runs the Kubernetes configuration, applies it, and verifies the result.
USAGE
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 64 ;;
  esac
done

cd "$ROOT"

if [[ "$SKIP_PREFLIGHT" == "0" ]]; then
  ./scripts/preflight-vm.sh --skip-dns
fi

if [[ "$SKIP_BUILD" == "0" ]]; then
  ./scripts/build-images.sh --push
fi

if [[ "$SKIP_BENCHMARK" == "0" ]]; then
  ./benchmarks/run-target-benchmarks.sh
fi

./scripts/generate-resource-overlays.mjs
./scripts/verify.sh --dry-run
./scripts/apply.sh
./scripts/verify.sh
