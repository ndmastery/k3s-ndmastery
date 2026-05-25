#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_DNS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-dns) SKIP_DNS=1; shift ;;
    --help|-h)
      cat <<'USAGE'
usage: scripts/preflight-vm.sh [--skip-dns]

Checks VM prerequisites before build, benchmark, and deploy.
USAGE
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 64 ;;
  esac
done

cd "$ROOT"

failures=0
warnings=0

ok() {
  printf '[OK] %s\n' "$*"
}

warn() {
  warnings=$((warnings + 1))
  printf '[WARN] %s\n' "$*" >&2
}

fail() {
  failures=$((failures + 1))
  printf '[FAIL] %s\n' "$*" >&2
}

need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "command found: $1"
  else
    fail "missing command: $1"
  fi
}

need_cmd git
need_cmd curl
need_cmd jq
need_cmd node
need_cmd npm
need_cmd docker
need_cmd helm
need_cmd sops
need_cmd age
need_cmd kubectl
need_cmd dig

if kubectl argo rollouts version >/dev/null 2>&1; then
  ok "kubectl argo rollouts plugin works"
else
  fail "kubectl argo rollouts plugin is missing or not working"
fi

if systemctl is-active --quiet k3s 2>/dev/null; then
  ok "k3s service is active"
else
  warn "k3s service is not active or systemctl is unavailable"
fi

if kubectl get nodes >/dev/null 2>&1; then
  ok "kubectl can reach the cluster"
  if kubectl get nodes --no-headers | awk '{print $2}' | grep -q '^Ready'; then
    ok "at least one Kubernetes node is Ready"
  else
    fail "no Kubernetes node is Ready"
  fi
else
  fail "kubectl cannot reach the cluster"
fi

if docker info >/dev/null 2>&1; then
  ok "Docker daemon is reachable"
else
  fail "Docker daemon is not reachable"
fi

if docker buildx inspect ndmastery-builder >/dev/null 2>&1; then
  ok "Docker Buildx builder ndmastery-builder exists"
else
  warn "Docker Buildx builder ndmastery-builder is missing; run scripts/bootstrap-vm-prereqs.sh"
fi

cpu_count="$(nproc 2>/dev/null || echo 0)"
memory_mib="$(awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo 2>/dev/null || echo 0)"
if [[ "$cpu_count" -ge 4 ]]; then
  ok "CPU count is ${cpu_count}"
else
  warn "CPU count is ${cpu_count}; expected at least 4"
fi
if [[ "$memory_mib" -ge 7600 ]]; then
  ok "memory is ${memory_mib}Mi"
else
  warn "memory is ${memory_mib}Mi; expected roughly 8GiB"
fi

if grep -q 'REPLACE_WITH_AGE_PUBLIC_KEY' .sops.yaml; then
  fail ".sops.yaml still contains REPLACE_WITH_AGE_PUBLIC_KEY"
else
  ok ".sops.yaml age recipient is configured"
fi

while IFS=$'\t' read -r name path; do
  if [[ -d "$path" ]]; then
    ok "application path exists: ${name} ${path}"
  else
    fail "application path missing: ${name} ${path}"
  fi
done < <(jq -r '.apps[] | [.name, .projectPath] | @tsv' catalog.json)

while read -r app; do
  if [[ -f "apps/${app}/secrets.enc.yaml" ]]; then
    ok "encrypted secret exists: apps/${app}/secrets.enc.yaml"
  else
    fail "missing encrypted secret: apps/${app}/secrets.enc.yaml"
  fi
done < <(node -e 'const c=require("./catalog.json"); for (const app of c.apps.filter((item) => item.secretKeys?.length)) console.log(app.name)')

if [[ "$SKIP_DNS" == "0" ]]; then
  public_ip="$(curl -fsS4 --max-time 10 ifconfig.me 2>/dev/null || true)"
  if [[ -z "$public_ip" ]]; then
    warn "could not determine public IPv4 address"
  else
    ok "public IPv4 address is ${public_ip}"
    while read -r domain; do
      mapfile -t answers < <(dig +short A "$domain" | grep -E '^[0-9.]+$' || true)
      if [[ "${#answers[@]}" -eq 0 ]]; then
        fail "DNS has no A record: ${domain}"
      elif printf '%s\n' "${answers[@]}" | grep -qx "$public_ip"; then
        ok "DNS ${domain} points to ${public_ip}"
      else
        fail "DNS ${domain} resolves to ${answers[*]}, expected ${public_ip}"
      fi
    done < <(jq -r '.apps[].domain' catalog.json)
  fi
else
  warn "DNS checks skipped"
fi

if [[ -f platform/generated/resource-policy.yaml ]]; then
  ok "generated platform resource policy exists"
else
  warn "generated platform resource policy is missing; run benchmarks and scripts/generate-resource-overlays.mjs before apply"
fi

missing_generated=0
while read -r app; do
  for file in rollout.yaml hpa.yaml analysis-template.yaml; do
    if [[ ! -f "apps/${app}/generated/${file}" ]]; then
      missing_generated=$((missing_generated + 1))
    fi
  done
done < <(jq -r '.apps[].name' catalog.json)

if [[ "$missing_generated" -eq 0 ]]; then
  ok "all generated app manifests exist"
else
  warn "${missing_generated} generated app manifest files are missing; run benchmarks and scripts/generate-resource-overlays.mjs before apply"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "Preflight failed with ${failures} failure(s) and ${warnings} warning(s)." >&2
  exit 1
fi

echo "Preflight passed with ${warnings} warning(s)."
