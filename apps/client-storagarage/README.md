# client-storagarage

Project: `/Users/dimasyudha/proj/client-serveregistry`  
Primary domain: `https://web.storagarage.com`  
Menu domains:
- Storage: `https://s3.storagarage.com`
- Registry: `https://registry.storagarage.com`
- Publishing: `https://store.storagarage.com`
- Secrets: `https://ssm.storagarage.com`

Container port: `3102`  
Runtime: `qwik-node`

The final Rollout, HPA, and analysis manifests in `generated/` are benchmark-derived. Run:

```bash
./scripts/build-images.sh
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs --image-tag "$(git -C /Users/dimasyudha/proj/client-serveregistry rev-parse --short=12 HEAD)"
```

Do not hand-fill CPU, memory, probe, timeout, HPA, or rollout timing values in this directory.
