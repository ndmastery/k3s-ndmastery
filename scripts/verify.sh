#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

if [[ "$DRY_RUN" == "1" ]]; then
  kubectl apply -k "$ROOT" --server-side --dry-run=server
  exit 0
fi

kubectl get namespace ndmastery
kubectl get rollouts -n ndmastery
kubectl get pods -n ndmastery -o wide
kubectl get hpa -n ndmastery
kubectl get certificate -n ndmastery

node -e '
const { execFileSync } = require("child_process");
const c = require("./catalog.json");
const pods = JSON.parse(execFileSync("kubectl", ["get", "pods", "-n", "ndmastery", "-o", "json"], { encoding: "utf8" }));
for (const app of c.apps) {
  const count = pods.items.filter((p) => p.metadata.labels?.["app.kubernetes.io/name"] === app.name && p.status.phase === "Running").length;
  if (count < 2) throw new Error(`${app.name} has ${count} running pods; expected at least 2`);
}
'
