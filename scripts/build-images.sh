#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUSH=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 64 ;;
  esac
done

node -e '
const c = require("./catalog.json");
for (const app of c.apps) {
  const tag = process.env.IMAGE_TAG || "manual-" + Date.now();
  console.log([app.name, app.projectPath, app.runtime, tag].join("\t"));
}
' | while IFS=$'\t' read -r name project runtime tag; do
  image="${registry:-registry.ndmastery.com}/${name}:${tag}"
  if git -C "$project" rev-parse --short=12 HEAD >/dev/null 2>&1; then
    sha="$(git -C "$project" rev-parse --short=12 HEAD)"
    image="${registry:-registry.ndmastery.com}/${name}:${sha}"
  fi
  echo "==> Building ${image}"
  args=(docker buildx build --build-context "app=${project}" -f "${ROOT}/images/${name}/Dockerfile" -t "${image}" "${ROOT}")
  if [[ "${PUSH}" == "1" ]]; then
    args+=(--push)
  else
    args+=(--load)
  fi
  "${args[@]}"
done
