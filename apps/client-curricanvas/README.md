# client-curricanvas

Project: `/Users/dimasyudha/projects/web_curricanvas-app`  
Domain: `https://web.curricanvas.com`  
Container port: `3104`  
Runtime: `svelte-node`

The final Rollout, HPA, and analysis manifests in `generated/` are benchmark-derived. Run:

```bash
./scripts/build-images.sh
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs --image-tag "$(git -C /Users/dimasyudha/projects/web_curricanvas-app rev-parse --short=12 HEAD)"
```

Do not hand-fill CPU, memory, probe, timeout, HPA, or rollout timing values in this directory.
