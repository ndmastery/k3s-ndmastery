# NDMastery Tencent VM Deployment Runbook

This is the production runbook for deploying the NDMastery K3s repository on one Tencent Cloud Lighthouse VM with Ubuntu 24.04, 4 CPU cores, and 8 GB RAM.

The short answer:

- Clone or copy this K3s repository to the VM.
- Clone every application repository to the VM if you will build and benchmark on the VM.
- Build and push every image to `registry.ndmastery.com/<app-name>:<git-sha>`.
- Let K3s pull images from the registry. Do not depend on Docker-local images.
- Run real benchmarks on the VM before generating CPU, memory, probe, timeout, HPA, and rollout values.

The VM is still a single point of failure. This setup improves application availability inside that VM, but true infrastructure high availability requires more than one VM, replicated storage, and an external load balancer.

## 1. Server Layout

Use Linux-native paths on the VM:

```bash
/opt/ndmastery/k3s
/opt/ndmastery/apps/client-annajah
/opt/ndmastery/apps/client-register
/opt/ndmastery/apps/client-scorexam
/opt/ndmastery/apps/client-serveregistry
/opt/ndmastery/apps/server-ndmastery
/opt/ndmastery/apps/next-curricanvas
/opt/ndmastery/apps/web_calconversion
/opt/ndmastery/apps/web_sso
/opt/ndmastery/apps/web_curricanvas-app
```

The committed `catalog.json` may contain local development paths such as `/Users/dimasyudha/...`. On the VM, rewrite them with:

```bash
cd /opt/ndmastery/k3s
./scripts/configure-vm-catalog-paths.mjs --write --require-existing
```

## 2. Connect To The VM

From your local machine:

```bash
ssh root@<VM_PUBLIC_IP>
```

Then on the VM:

```bash
sudo -i
hostnamectl
free -h
nproc
```

Confirm K3s is alive:

```bash
systemctl status k3s --no-pager
k3s kubectl get nodes -o wide
```

Create a normal kubeconfig:

```bash
mkdir -p ~/.kube
cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
chmod 600 ~/.kube/config

kubectl get nodes
kubectl get pods -A
```

## 3. Install Minimal Fetch Tools

On a fresh VM, install only the tools needed to fetch this repository:

```bash
apt update
apt install -y git curl ca-certificates rsync
```

The full bootstrap script runs after the repository is cloned.

## 4. DNS And Firewall

Find the VM public IP:

```bash
curl -4 ifconfig.me
```

Create DNS `A` records:

```text
annajahfoundation.sch.id  -> <VM_PUBLIC_IP>
web.formapper.com         -> <VM_PUBLIC_IP>
web.scorexam.com          -> <VM_PUBLIC_IP>
web.storagarage.com       -> <VM_PUBLIC_IP>
server.ndmastery.com      -> <VM_PUBLIC_IP>
curricanvas.com           -> <VM_PUBLIC_IP>
calconversion.com         -> <VM_PUBLIC_IP>
sso.ndmastery.com         -> <VM_PUBLIC_IP>
web.curricanvas.com       -> <VM_PUBLIC_IP>
registry.ndmastery.com    -> your registry server or registry provider
```

Open only these inbound ports in Tencent Cloud Lighthouse:

```text
TCP 22   SSH
TCP 80   Let's Encrypt HTTP-01 validation
TCP 443  HTTPS application traffic
```

Do not expose app ports such as `3001`, `3100`, or `4000` publicly. Traefik receives public traffic and routes to internal services.

Check DNS:

```bash
dig +short annajahfoundation.sch.id
dig +short web.formapper.com
dig +short server.ndmastery.com
```

If `dig` is not available yet, it will be installed by the bootstrap script later.

## 5. Clone Repositories

Create the directory structure:

```bash
mkdir -p /opt/ndmastery/apps
cd /opt/ndmastery
```

Clone this K3s repository:

```bash
git clone <k3s-config-repo-url> /opt/ndmastery/k3s
```

If this repository only exists locally, copy it from your machine:

```bash
rsync -av /Users/dimasyudha/k3s/ root@<VM_PUBLIC_IP>:/opt/ndmastery/k3s/
```

Clone every application repository:

```bash
git clone <client-annajah-repo-url> /opt/ndmastery/apps/client-annajah
git clone <client-register-repo-url> /opt/ndmastery/apps/client-register
git clone <client-scorexam-repo-url> /opt/ndmastery/apps/client-scorexam
git clone <client-serveregistry-repo-url> /opt/ndmastery/apps/client-serveregistry
git clone <server-ndmastery-repo-url> /opt/ndmastery/apps/server-ndmastery
git clone <next-curricanvas-repo-url> /opt/ndmastery/apps/next-curricanvas
git clone <web-calconversion-repo-url> /opt/ndmastery/apps/web_calconversion
git clone <web-sso-repo-url> /opt/ndmastery/apps/web_sso
git clone <web-curricanvas-app-repo-url> /opt/ndmastery/apps/web_curricanvas-app
```

Rewrite `catalog.json` to the VM paths:

```bash
cd /opt/ndmastery/k3s
./scripts/configure-vm-catalog-paths.mjs --write --require-existing
```

Verify paths:

```bash
while read -r name path; do
  test -d "$path" && echo "OK $name $path" || echo "MISSING $name $path"
done < <(jq -r '.apps[] | [.name, .projectPath] | @tsv' catalog.json)
```

## 6. Install VM Tools

Run the full bootstrap script:

```bash
cd /opt/ndmastery/k3s
sudo ./scripts/bootstrap-vm-prereqs.sh
```

The script installs the required operator tools:

- Docker and Buildx for image builds and benchmark containers.
- Node.js for repository scripts.
- Helm for cert-manager installation.
- SOPS and age for encrypted Kubernetes secrets.
- Argo Rollouts kubectl plugin for rollout status and rollback.
- DNS utilities such as `dig` for public domain checks.

Verify:

```bash
docker version
docker buildx version
node --version
npm --version
helm version
sops --version
age --version
kubectl argo rollouts version
```

## 7. Registry Access

Log Docker into the registry for image pushes:

```bash
docker login registry.ndmastery.com
```

If the registry requires authentication for pulls, configure K3s/containerd:

```bash
mkdir -p /etc/rancher/k3s

cat > /etc/rancher/k3s/registries.yaml <<'YAML'
configs:
  registry.ndmastery.com:
    auth:
      username: "<REGISTRY_USERNAME>"
      password: "<REGISTRY_PASSWORD>"
    tls:
      insecure_skip_verify: false
YAML

chmod 600 /etc/rancher/k3s/registries.yaml
systemctl restart k3s
```

Wait for K3s:

```bash
kubectl get nodes
kubectl get pods -A
```

If the registry allows anonymous pulls, the K3s registry file is optional, but Docker still needs push access.

## 8. Install Platform Controllers

Install cert-manager and Argo Rollouts:

```bash
cd /opt/ndmastery/k3s
./scripts/install-controllers.sh
```

Verify:

```bash
kubectl get pods -n cert-manager
kubectl get pods -n argo-rollouts
kubectl get pods -n kube-system | grep traefik
kubectl get ingressclass
```

## 9. Create Encrypted Secrets

Generate an age key:

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt

grep "public key" ~/.config/sops/age/keys.txt
```

Put the public key into `.sops.yaml` by replacing `REPLACE_WITH_AGE_PUBLIC_KEY`:

```bash
nano /opt/ndmastery/k3s/.sops.yaml
```

Create the production env file for `server-ndmastery`:

```bash
mkdir -p /root/ndmastery-secrets
cp /opt/ndmastery/k3s/apps/server-ndmastery/secrets.env.example /root/ndmastery-secrets/server-ndmastery.env
chmod 600 /root/ndmastery-secrets/server-ndmastery.env

nano /root/ndmastery-secrets/server-ndmastery.env
```

Encrypt the Kubernetes Secret:

```bash
cd /opt/ndmastery/k3s
./scripts/create-sops-secret.sh server-ndmastery /root/ndmastery-secrets/server-ndmastery.env
```

Verify decryption locally:

```bash
sops -d apps/server-ndmastery/secrets.enc.yaml | head
```

Back up `~/.config/sops/age/keys.txt` outside the VM. Losing this private key means losing access to decrypt production secrets.

## 10. Preflight Check

Run:

```bash
cd /opt/ndmastery/k3s
./scripts/preflight-vm.sh
```

This checks tools, K3s access, app paths, DNS, SOPS configuration, encrypted secret presence, and generated manifest readiness.

If DNS is not ready yet and you only want local checks:

```bash
./scripts/preflight-vm.sh --skip-dns
```

## 11. Build And Push Images

Build and push all app images:

```bash
cd /opt/ndmastery/k3s
./scripts/build-images.sh --push
```

Images are pushed as immutable Git SHA tags:

```text
registry.ndmastery.com/web-annajah:<git-sha>
registry.ndmastery.com/client-formapper:<git-sha>
registry.ndmastery.com/client-scorexam:<git-sha>
registry.ndmastery.com/client-storagarage:<git-sha>
registry.ndmastery.com/server-ndmastery:<git-sha>
registry.ndmastery.com/web-curricanvas:<git-sha>
registry.ndmastery.com/web-calconversion:<git-sha>
registry.ndmastery.com/client-sso:<git-sha>
registry.ndmastery.com/client-curricanvas:<git-sha>
```

K3s will later pull these images from the registry.

## 12. Run Real Benchmarks

Run the benchmark suite on the Tencent VM:

```bash
cd /opt/ndmastery/k3s
./benchmarks/run-target-benchmarks.sh
```

Inspect results:

```bash
ls -lh benchmarks/results
jq '.app, .image, .measurements.startupSeconds' benchmarks/results/web-annajah.json
jq '.app, .measurements.steady, .measurements.spike' benchmarks/results/server-ndmastery.json
```

If a benchmark fails:

```bash
docker ps -a
docker logs <failed-container-name>
```

Fix the application image, rebuild, push, and rerun the benchmark. Do not guess resource values.

## 13. Generate Benchmark-Derived Manifests

Generate resources, rollouts, probes, HPA, and capacity policy:

```bash
cd /opt/ndmastery/k3s
./scripts/generate-resource-overlays.mjs
```

Verify generated files:

```bash
ls apps/*/generated/*.yaml
ls platform/generated/resource-policy.yaml
```

If generation fails because measured capacity exceeds the safe 4 CPU / 8 GB budget, stop. Reduce app usage, reduce scale expectations, add another node, or upgrade the VM.

## 14. Dry-Run And Apply

Render the full manifest set:

```bash
kubectl kustomize /opt/ndmastery/k3s >/tmp/ndmastery-rendered.yaml
```

Server-side dry-run:

```bash
cd /opt/ndmastery/k3s
./scripts/verify.sh --dry-run
```

Apply:

```bash
./scripts/apply.sh
```

Watch pods:

```bash
kubectl get pods -n ndmastery -w
```

Watch selected rollouts:

```bash
kubectl argo rollouts get rollout web-annajah -n ndmastery --watch
kubectl argo rollouts get rollout client-formapper -n ndmastery --watch
kubectl argo rollouts get rollout server-ndmastery -n ndmastery --watch
```

## 15. Verify Production

Check rollouts and core resources:

```bash
kubectl argo rollouts list rollouts -n ndmastery
kubectl get pods -n ndmastery -o wide
kubectl get svc -n ndmastery
kubectl get ingressroute -n ndmastery
kubectl get hpa -n ndmastery
kubectl get pdb -n ndmastery
```

Check certificates:

```bash
kubectl get certificate -n ndmastery
kubectl get certificaterequest -n ndmastery
kubectl get order,challenge -A
```

Check public HTTPS:

```bash
for domain in \
  annajahfoundation.sch.id \
  web.formapper.com \
  web.scorexam.com \
  web.storagarage.com \
  server.ndmastery.com \
  curricanvas.com \
  calconversion.com \
  sso.ndmastery.com \
  web.curricanvas.com
do
  echo "Checking https://$domain"
  curl -I --max-time 20 "https://$domain"
done
```

At rest, each app should have two healthy pods unless HPA has scaled it due to real load:

```bash
for app in \
  web-annajah \
  client-formapper \
  client-scorexam \
  client-storagarage \
  server-ndmastery \
  web-curricanvas \
  web-calconversion \
  client-sso \
  client-curricanvas
do
  echo "$app"
  kubectl get pods -n ndmastery -l app.kubernetes.io/name="$app"
done
```

## 16. Normal Release Example

When `client-scorexam` has a new release:

```bash
cd /opt/ndmastery/apps/client-scorexam
git pull --ff-only
```

Then run the deployment pipeline:

```bash
cd /opt/ndmastery/k3s
./scripts/deploy-all.sh
```

Or run the individual steps:

```bash
./scripts/build-images.sh --push
./benchmarks/run-target-benchmarks.sh
./scripts/generate-resource-overlays.mjs
./scripts/verify.sh --dry-run
./scripts/apply.sh
./scripts/verify.sh
```

Watch the rollout:

```bash
kubectl argo rollouts get rollout client-scorexam -n ndmastery --watch
```

If the canary fails analysis, Argo Rollouts aborts and keeps stable traffic on the previous version.

Manual rollback:

```bash
./scripts/rollback.sh client-scorexam
```

## 17. Failure Drill Example

Delete one pod and confirm traffic survives:

```bash
pod=$(kubectl get pod -n ndmastery \
  -l app.kubernetes.io/name=web-annajah \
  -o jsonpath='{.items[0].metadata.name}')

kubectl delete pod -n ndmastery "$pod"
kubectl get pods -n ndmastery -l app.kubernetes.io/name=web-annajah -w
```

Check the public site:

```bash
curl -I https://annajahfoundation.sch.id
kubectl argo rollouts status web-annajah -n ndmastery
```

To drill every app:

```bash
./scripts/disaster-smoke-test.sh
```

## 18. Troubleshooting Commands

Certificate failures:

```bash
kubectl get certificate,certificaterequest,order,challenge -A
kubectl describe challenge -A
kubectl logs -n cert-manager deploy/cert-manager
```

Pod failures:

```bash
kubectl describe pod -n ndmastery <pod-name>
kubectl logs -n ndmastery <pod-name>
```

Rollout failures:

```bash
kubectl argo rollouts get rollout <app-name> -n ndmastery
kubectl describe rollout <app-name> -n ndmastery
./scripts/rollback.sh <app-name>
```

Image pull failures:

```bash
kubectl describe pod -n ndmastery <pod-name>
cat /etc/rancher/k3s/registries.yaml
docker pull registry.ndmastery.com/<app-name>:<git-sha>
```

## 19. Operational Rules

- Never commit plaintext production secrets.
- Never generate resource manifests from local laptop benchmarks.
- Never use `latest` image tags for production.
- Never expose application ports directly to the internet.
- Always run server-side dry-run before apply.
- Always keep the SOPS age private key backed up outside the VM.
