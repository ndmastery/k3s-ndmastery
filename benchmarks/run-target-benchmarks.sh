#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node -e 'const c=require("./catalog.json"); for (const app of c.apps) console.log(app.name)' | while read -r app; do
  echo "==> Benchmarking ${app}"
  node benchmarks/docker-benchmark.mjs "$app"
done
