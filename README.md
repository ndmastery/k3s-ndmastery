# NDMastery K3s Production Manifests

This repository deploys all NDMastery applications into one K3s namespace, `ndmastery`, on a single Ubuntu 24.04 Tencent Cloud Lighthouse VM.

The repo intentionally does **not** commit guessed CPU, memory, probe, timeout, HPA, or rollout timing values. Those files are generated after running benchmarks on the target VM.

## Flow

```bash
./scripts/install-controllers.sh
./scripts/build-images.sh --push
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs --image-tag "$(git rev-parse --short=12 HEAD)"
./scripts/verify.sh --dry-run
./scripts/apply.sh
./scripts/verify.sh
```

## Availability Note

This configuration maximizes application availability inside one VM using two pods per app, strict probes, canary rollouts, Traefik load balancing, HPA, PDBs, and automatic rollout abort. A single VM still has unavoidable single points of failure: VM, public IP, disk, and cloud networking.

## Secrets

Production secrets must be committed only as SOPS age encrypted `*.enc.yaml` files. Plain Kubernetes Secrets with real values are not allowed in this repository.

## Generated Files

`apps/*/generated/*.yaml` and `platform/generated/*.yaml` are generated from `benchmarks/results/*.json`. If benchmark data is missing or unsafe for a 4 CPU / 8 GB VM, generation fails.
