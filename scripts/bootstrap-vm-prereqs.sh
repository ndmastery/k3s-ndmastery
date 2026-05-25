#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-22}"
SOPS_VERSION="${SOPS_VERSION:-v3.11.0}"
ARGO_ROLLOUTS_VERSION="${ARGO_ROLLOUTS_VERSION:-v1.9.0}"

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

log() {
  printf '==> %s\n' "$*"
}

need_arch() {
  case "$(dpkg --print-architecture)" in
    amd64) printf 'amd64' ;;
    arm64) printf 'arm64' ;;
    *)
      echo "Unsupported architecture: $(dpkg --print-architecture)" >&2
      exit 70
      ;;
  esac
}

install_base_packages() {
  log "Installing base packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    age \
    build-essential \
    ca-certificates \
    curl \
    dnsutils \
    git \
    gnupg \
    jq \
    lsb-release \
    nano \
    unzip
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed"
  else
    log "Installing Docker Engine"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
      gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
  fi

  systemctl enable --now docker
  if docker buildx inspect ndmastery-builder >/dev/null 2>&1; then
    docker buildx use ndmastery-builder >/dev/null
  else
    docker buildx create --use --name ndmastery-builder >/dev/null
  fi
  docker buildx inspect --bootstrap >/dev/null
}

install_node() {
  local current_major=""
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  fi

  if [[ "${current_major}" == "${NODE_MAJOR}" ]]; then
    log "Node.js ${NODE_MAJOR} already installed"
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
}

install_helm() {
  if command -v helm >/dev/null 2>&1; then
    log "Helm already installed"
    return
  fi

  log "Installing Helm"
  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
}

install_sops() {
  local arch
  arch="$(need_arch)"

  if command -v sops >/dev/null 2>&1 && sops --version 2>/dev/null | grep -q "${SOPS_VERSION#v}"; then
    log "SOPS ${SOPS_VERSION} already installed"
    return
  fi

  log "Installing SOPS ${SOPS_VERSION}"
  local tmp
  tmp="$(mktemp)"
  curl -fsSL -o "$tmp" "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.${arch}"
  install -m 0755 "$tmp" /usr/local/bin/sops
  rm -f "$tmp"
}

install_argo_rollouts_plugin() {
  local arch
  arch="$(need_arch)"

  if command -v kubectl-argo-rollouts >/dev/null 2>&1; then
    log "Argo Rollouts kubectl plugin already installed"
    return
  fi

  log "Installing Argo Rollouts kubectl plugin ${ARGO_ROLLOUTS_VERSION}"
  local tmp
  tmp="$(mktemp)"
  curl -fsSL -o "$tmp" "https://github.com/argoproj/argo-rollouts/releases/download/${ARGO_ROLLOUTS_VERSION}/kubectl-argo-rollouts-linux-${arch}"
  install -m 0755 "$tmp" /usr/local/bin/kubectl-argo-rollouts
  rm -f "$tmp"
}

configure_kubectl() {
  if ! command -v kubectl >/dev/null 2>&1 && command -v k3s >/dev/null 2>&1; then
    log "Creating kubectl symlink to k3s"
    ln -sf "$(command -v k3s)" /usr/local/bin/kubectl
  fi

  if [[ -f /etc/rancher/k3s/k3s.yaml ]]; then
    log "Configuring kubeconfig for ${SUDO_USER:-root}"
    local target_user target_home
    target_user="${SUDO_USER:-root}"
    if [[ "${target_user}" == "root" ]]; then
      target_home="/root"
    else
      target_home="$(getent passwd "$target_user" | cut -d: -f6)"
    fi
    mkdir -p "${target_home}/.kube"
    cp /etc/rancher/k3s/k3s.yaml "${target_home}/.kube/config"
    chmod 600 "${target_home}/.kube/config"
    chown -R "${target_user}:${target_user}" "${target_home}/.kube" || true
  fi
}

install_base_packages
install_docker
install_node
install_helm
install_sops
install_argo_rollouts_plugin
configure_kubectl

log "Installed versions"
docker --version || true
docker buildx version || true
node --version || true
npm --version || true
helm version --short || true
sops --version || true
age --version || true
kubectl version --client=true || true
kubectl argo rollouts version || true

log "VM prerequisites are ready"
