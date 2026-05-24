# SOPS Secrets

Production Kubernetes Secrets must be stored only as SOPS age encrypted files named `apps/<app>/secrets.enc.yaml`.

1. Put real values in a local env file outside Git, using the matching `secrets.env.example`.
2. Make sure `.sops.yaml` contains the real age public key.
3. Run:

```bash
./scripts/create-sops-secret.sh server-ndmastery /path/to/server-ndmastery.env
```

The deploy script decrypts `*.enc.yaml` with `sops -d` and applies them before applying app manifests.
