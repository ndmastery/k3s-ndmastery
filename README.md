# NDMastery K3s Production Manifests

This repository deploys all NDMastery applications into one K3s namespace, `ndmastery`, on a single Ubuntu 24.04 Tencent Cloud Lighthouse VM.

The repo intentionally does **not** commit guessed CPU, memory, probe, timeout, HPA, or rollout timing values. Those files are generated after running benchmarks on the target VM.

## VM Runbook

Follow the full step-by-step Tencent VM guide in [docs/VM_DEPLOYMENT_RUNBOOK.md](docs/VM_DEPLOYMENT_RUNBOOK.md).

The recommended server layout is:

```bash
/opt/ndmastery/k3s
/opt/ndmastery/apps/<application-repository>
```

After cloning the app repositories on the VM, rewrite `catalog.json` paths with:

```bash
./scripts/configure-vm-catalog-paths.mjs --write --require-existing
```

## Flow

```bash
./scripts/bootstrap-vm-prereqs.sh
./scripts/install-controllers.sh
./scripts/preflight-vm.sh
./scripts/build-images.sh --push
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs
./scripts/verify.sh --dry-run
./scripts/apply.sh
./scripts/verify.sh
```

For a normal release after the VM is already prepared:

```bash
./scripts/deploy-all.sh
```

## Availability Note

This configuration maximizes application availability inside one VM using two pods per app, strict probes, canary rollouts, Traefik load balancing, HPA, PDBs, and automatic rollout abort. A single VM still has unavoidable single points of failure: VM, public IP, disk, and cloud networking.

## Secrets

Production secrets must be committed only as SOPS age encrypted `*.enc.yaml` files. Plain Kubernetes Secrets with real values are not allowed in this repository.

## Generated Files

`apps/*/generated/*.yaml` and `platform/generated/*.yaml` are generated from `benchmarks/results/*.json`. If benchmark data is missing or unsafe for a 4 CPU / 8 GB VM, generation fails.
