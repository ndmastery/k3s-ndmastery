# server-ndmastery

Project: `/Users/dimasyudha/proj/server-ndmastery`  
Domain: `https://server.ndmastery.com`  
Container port: `4000`  
Runtime: `zig-gateway`

The final Rollout, HPA, and analysis manifests in `generated/` are benchmark-derived. Run:

```bash
./scripts/build-images.sh
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs --image-tag "$(git -C /Users/dimasyudha/proj/server-ndmastery rev-parse --short=12 HEAD)"
```

Do not hand-fill CPU, memory, probe, timeout, HPA, or rollout timing values in this directory.
