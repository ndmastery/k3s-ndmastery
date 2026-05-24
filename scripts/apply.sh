#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

missing=0
for file in "${ROOT}"/apps/*/generated/rollout.yaml "${ROOT}"/apps/*/generated/hpa.yaml "${ROOT}"/apps/*/generated/analysis-template.yaml "${ROOT}"/platform/generated/resource-policy.yaml; do
  if [[ ! -f "$file" ]]; then
    echo "Missing generated manifest: $file" >&2
    missing=1
  fi
done
if [[ "$missing" == "1" ]]; then
  echo "Run benchmarks and scripts/generate-resource-overlays.mjs before applying." >&2
  exit 65
fi

node -e '
const c = require("./catalog.json");
let missing = false;
for (const app of c.apps.filter((item) => item.secretKeys?.length)) {
  const file = `apps/${app.name}/secrets.enc.yaml`;
  if (!require("fs").existsSync(file)) {
    console.error(`Missing encrypted secret: ${file}`);
    missing = true;
  }
}
if (missing) process.exit(66);
'

for secret in "${ROOT}"/apps/*/secrets.enc.yaml; do
  [[ -f "$secret" ]] || continue
  sops -d "$secret" | kubectl apply -f -
done

kubectl apply -k "${ROOT}"
kubectl get certificate -n ndmastery
