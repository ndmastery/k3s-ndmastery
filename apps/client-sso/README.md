# client-sso

Project: `/Users/dimasyudha/projects/web_sso`  
Domain: `https://sso.ndmastery.com`  
Container port: `3103`  
Runtime: `qwik-node`

The final Rollout, HPA, and analysis manifests in `generated/` are benchmark-derived. Run:

```bash
./scripts/build-images.sh
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs --image-tag "$(git -C /Users/dimasyudha/projects/web_sso rev-parse --short=12 HEAD)"
```

Do not hand-fill CPU, memory, probe, timeout, HPA, or rollout timing values in this directory.
