# Benchmarking

Run these scripts on the Tencent Cloud Lighthouse VM after image builds. The output JSON files in `benchmarks/results/` are the only accepted source for generated resources, probes, HPA, and rollout timings.

```bash
./scripts/build-images.sh
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs
```
