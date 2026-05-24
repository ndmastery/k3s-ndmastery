# web-curricanvas

Project: `/Users/dimasyudha/projects/next-curricanvas`  
Domain: `https://curricanvas.com`  
Container port: `3002`  
Runtime: `static-qwik`

The final Rollout, HPA, and analysis manifests in `generated/` are benchmark-derived. Run:

```bash
./scripts/build-images.sh
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs --image-tag "$(git -C /Users/dimasyudha/projects/next-curricanvas rev-parse --short=12 HEAD)"
```

Do not hand-fill CPU, memory, probe, timeout, HPA, or rollout timing values in this directory.
