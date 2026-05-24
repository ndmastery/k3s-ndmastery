# web-annajah

Project: `/Users/dimasyudha/proj/client-annajah`  
Domain: `https://annajahfoundation.sch.id`  
Container port: `3001`  
Runtime: `static-qwik`

The final Rollout, HPA, and analysis manifests in `generated/` are benchmark-derived. Run:

```bash
./scripts/build-images.sh
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs --image-tag "$(git -C /Users/dimasyudha/proj/client-annajah rev-parse --short=12 HEAD)"
```

Do not hand-fill CPU, memory, probe, timeout, HPA, or rollout timing values in this directory.
