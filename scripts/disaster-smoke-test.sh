#!/usr/bin/env bash
set -euo pipefail

node -e '
const c = require("./catalog.json");
for (const app of c.apps) console.log(app.name);
' | while read -r app; do
  pod="$(kubectl get pod -n ndmastery -l "app.kubernetes.io/name=${app}" -o jsonpath='{.items[0].metadata.name}')"
  echo "Deleting one pod for ${app}: ${pod}"
  kubectl delete pod -n ndmastery "$pod" --wait=false
  kubectl argo rollouts status "$app" -n ndmastery --timeout=180s
done
