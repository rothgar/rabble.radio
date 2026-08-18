#!/usr/bin/env bash
#
# scripts/dev-cluster.sh
#
# Bootstraps the local kind-based development cluster for Rabble.
# - Verifies required tools (kind, kubectl, docker).
# - Creates the kind cluster defined in k8s/kind-config.yaml if missing.
# - Installs the NGINX Ingress controller (kind-friendly manifest) if not
#   already present.
# - Builds the docker image `rabble:local`.
# - Loads the image into kind.
# - Applies manifests via kustomize (k8s/overlays/kind) which includes the
#   base (namespace, postgres, app, migration Job, LiveKit) plus the
#   Ingress for `rabble.town`.
# - Waits for postgres pod, migration Job, and app pods to be ready.
# - Prints DNS / access instructions for rabble.town and for multi-machine
#   testing over the LAN without editing /etc/hosts on every client.
#
# Usage:
#   ./scripts/dev-cluster.sh                  # full bootstrap
#   CLUSTER_NAME=myname ./scripts/dev-cluster.sh
#   DOMAIN=spaces.local ./scripts/dev-cluster.sh  # override Ingress host
#   SKIP_INGRESS=1 ./scripts/dev-cluster.sh   # do not install ingress-nginx
#   SKIP_IMAGE=1   ./scripts/dev-cluster.sh   # do not rebuild / reload image
#

set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-rabble}"
IMAGE_NAME="${IMAGE_NAME:-rabble:local}"
KIND_CONFIG="${KIND_CONFIG:-k8s/kind-config.yaml}"
OVERLAY_DIR="${OVERLAY_DIR:-k8s/overlays/kind}"
APP_LABEL="${APP_LABEL:-app=rabble-app}"
DB_LABEL="${DB_LABEL:-app=postgres}"
MIGRATE_JOB="${MIGRATE_JOB:-rabble-migrate}"
NAMESPACE="${NAMESPACE:-bluesky-spaces}"
DOMAIN="${DOMAIN:-rabble.town}"
SKIP_INGRESS="${SKIP_INGRESS:-0}"
SKIP_IMAGE="${SKIP_IMAGE:-0}"

# Best-effort primary LAN IP for multi-machine instructions.
LAN_IP="${LAN_IP:-$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<HOST_IP>')}"

# NGINX Ingress manifest URL (kind-friendly). Pinned to a stable release.
NGINX_INGRESS_URL="${NGINX_INGRESS_URL:-https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/kind/deploy.yaml}"

# Colors (if attached to a terminal).
# Use $'...' so the escape sequences are actual bytes. This works both in
# printf and in the final here-doc; otherwise the here-doc prints the raw
# backslash sequences when output is captured or piped.
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'
  C_GREEN=$'\033[0;32m'
  C_YELLOW=$'\033[0;33m'
  C_RED=$'\033[0;31m'
  C_RESET=$'\033[0m'
else
  C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi

log()  { printf "%b[dev-cluster]%b %s\n" "$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%b[ ok ]%b %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf "%b[warn]%b %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%b[fail]%b %s\n" "$C_RED" "$C_RESET" "$*" >&2; }

require_tool() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    err "Required tool '$tool' is not installed or not in PATH."
    exit 1
  fi
}

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    err "Required file '$file' not found."
    exit 1
  fi
}

wait_for_job_complete() {
  local job="$1"
  local ns="$2"
  local timeout_s="${3:-600}"
  local deadline=$((SECONDS + timeout_s))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if kubectl get job "$job" -n "$ns" >/dev/null 2>&1; then
      local complete failed active
      complete=$(kubectl get job "$job" -n "$ns" -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || echo "")
      failed=$(kubectl get job "$job" -n "$ns" -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || echo "")
      active=$(kubectl get job "$job" -n "$ns" -o jsonpath='{.status.active}' 2>/dev/null || echo "0")
      if [ "$complete" = "True" ]; then
        return 0
      fi
      if [ "$failed" = "True" ]; then
        err "Migration Job '$job' failed. Check: kubectl -n $ns describe job $job"
        err "Logs: kubectl -n $ns logs -l app=rabble-migrate"
        return 1
      fi
      log "Migration job '$job' still running (active=${active:-?}). Waiting..."
    else
      log "Migration job '$job' not yet created. Waiting..."
    fi
    sleep 5
  done
  err "Timed out waiting for Job '$job' to complete after ${timeout_s}s."
  return 1
}

# ---------- 1. Tooling checks ----------
log "Checking required tools (kind, kubectl, docker)..."
require_tool kind
require_tool kubectl
require_tool docker
ok "Tools available."

# ---------- 2. Cluster create (if needed) ----------
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; then
  ok "kind cluster '$CLUSTER_NAME' already exists."
else
  require_file "$KIND_CONFIG"
  log "Creating kind cluster '$CLUSTER_NAME' from $KIND_CONFIG..."
  kind create cluster --name "$CLUSTER_NAME" --config "$KIND_CONFIG"
  ok "kind cluster '$CLUSTER_NAME' created."
fi

# Make sure kubectl is talking to the right context.
kubectl cluster-info >/dev/null 2>&1 || {
  err "kubectl cannot reach a cluster. Did kind create succeed?"
  exit 1
}

# Wait for the kind node(s) and core networking to be ready before we
# try to schedule workloads. On slower machines kind create returns
# before the node reports Ready, so an immediate apply can fail.
log "Waiting for kind node(s) to be Ready..."
if kubectl wait --for=condition=ready node --all --timeout=120s >/dev/null 2>&1; then
  ok "kind node(s) are Ready."
else
  warn "kind node(s) did not report Ready within 120s; continuing anyway."
fi

log "Waiting for kube-system pods to be Ready..."
if kubectl -n kube-system wait --for=condition=ready pod --all --timeout=120s >/dev/null 2>&1; then
  ok "kube-system pods are Ready."
else
  warn "kube-system pods did not all become Ready within 120s; continuing anyway."
fi

# ---------- 3. Build + load image (skip with SKIP_IMAGE=1) ----------
if [ "$SKIP_IMAGE" = "1" ]; then
  warn "SKIP_IMAGE=1, skipping docker build and kind load."
else
  log "Building docker image '$IMAGE_NAME'..."
  docker build -t "$IMAGE_NAME" .
  ok "Image built: $IMAGE_NAME"

  log "Loading image '$IMAGE_NAME' into kind cluster '$CLUSTER_NAME'..."
  kind load docker-image "$IMAGE_NAME" --name "$CLUSTER_NAME"
  ok "Image loaded into kind."
fi

# ---------- 4. Install NGINX Ingress controller (kind-friendly) ----------
if [ "$SKIP_INGRESS" = "1" ]; then
  warn "SKIP_INGRESS=1, not installing ingress-nginx. Apply manifests manually:"
  warn "  kubectl apply -f $NGINX_INGRESS_URL"
else
  if kubectl get namespace ingress-nginx >/dev/null 2>&1; then
    ok "ingress-nginx namespace already present."
  else
    log "Installing NGINX Ingress controller for kind from $NGINX_INGRESS_URL ..."
    if kubectl apply -f "$NGINX_INGRESS_URL"; then
      ok "Ingress controller manifests applied."
    else
      warn "Could not auto-install ingress-nginx from upstream. Apply manually:"
      warn "  kubectl apply -f $NGINX_INGRESS_URL"
      warn "Continuing without it; you can still reach the app via NodePort:"
      warn "  curl -H 'Host: ${DOMAIN}' http://localhost:8080/api/health"
      warn "  curl -H 'Host: ${DOMAIN}' http://${LAN_IP}:8080/api/health  (from another machine)"
    fi
  fi

  log "Waiting for ingress-nginx controller pod to be ready..."
  if kubectl wait --namespace ingress-nginx \
      --for=condition=ready pod \
      -l app.kubernetes.io/component=controller \
      --timeout=180s 2>/dev/null; then
    ok "ingress-nginx controller is ready."
  else
    warn "ingress-nginx controller did not become ready within 180s."
    warn "Continuing; the app and Ingress will deploy anyway."
  fi
fi

# ---------- 5. Apply manifests (kustomize overlay) ----------
require_file "$OVERLAY_DIR/kustomization.yaml"
log "Applying manifests from $OVERLAY_DIR..."
if command -v kustomize >/dev/null 2>&1; then
  kustomize build "$OVERLAY_DIR" | kubectl apply -f -
else
  kubectl apply -k "$OVERLAY_DIR"
fi
ok "Base manifests applied."

# Apply LiveKit separately (see k8s/base/kustomization.yaml comment).
LIVEKIT_FILE="k8s/livekit.yaml"
if [ -f "$LIVEKIT_FILE" ]; then
  log "Applying LiveKit from $LIVEKIT_FILE..."
  kubectl apply -f "$LIVEKIT_FILE"
  ok "LiveKit applied."
fi

# Apply the standalone Ingress (not part of the kustomization; see
# k8s/overlays/kind/kustomization.yaml comment for why).
INGRESS_FILE="k8s/ingress.yaml"
if [ -f "$INGRESS_FILE" ]; then
  log "Applying Ingress from $INGRESS_FILE..."
  kubectl apply -f "$INGRESS_FILE"
  ok "Ingress applied."
else
  warn "No $INGRESS_FILE found; skipping Ingress apply."
fi

# Apply the optional cert-manager Certificate (no-op if cert-manager is
# not installed and the CRD is absent).
CERT_FILE="k8s/certificate.yaml"
if [ -f "$CERT_FILE" ]; then
  if kubectl api-resources 2>/dev/null | grep -q "certificates.cert-manager.io"; then
    log "Applying Certificate from $CERT_FILE..."
    kubectl apply -f "$CERT_FILE" || warn "Failed to apply $CERT_FILE (continuing)."
  else
    warn "cert-manager CRDs not installed; skipping $CERT_FILE."
    warn "Install cert-manager and re-run to enable TLS on ${DOMAIN}."
    warn "The TLS secret name in k8s/ingress.yaml is 'rabble-tls'."
  fi
fi

# ---------- 6. Wait for postgres ----------
log "Waiting for postgres pod (label=$DB_LABEL) to be ready..."
if kubectl wait --namespace "$NAMESPACE" \
    --for=condition=ready pod \
    -l "$DB_LABEL" \
    --timeout=300s; then
  ok "postgres pod is ready."
else
  err "postgres pod did not become ready within 300s."
  err "Inspect with: kubectl -n $NAMESPACE describe pod -l $DB_LABEL"
  exit 1
fi

# ---------- 7. Wait for migration Job to complete ----------
log "Waiting for migration Job '$MIGRATE_JOB' to complete..."
if wait_for_job_complete "$MIGRATE_JOB" "$NAMESPACE" 600; then
  ok "Migration Job '$MIGRATE_JOB' completed successfully."
else
  err "Migration Job did not complete successfully."
  exit 1
fi

# ---------- 8. Wait for app pod ----------
log "Waiting for app pod (label=$APP_LABEL) to be ready..."
if kubectl wait --namespace "$NAMESPACE" \
    --for=condition=ready pod \
    -l "$APP_LABEL" \
    --timeout=300s; then
  ok "app pod is ready."
else
  err "App pod did not become ready within 300s."
  err "Inspect with: kubectl -n $NAMESPACE describe pod -l $APP_LABEL"
  exit 1
fi

# ---------- 9. DNS / access instructions ----------
HOSTS_LINE="127.0.0.1 ${DOMAIN}"
HOSTS_FILE="/etc/hosts"

cat <<EOF

${C_BOLD}Cluster is up.${C_RESET}

${C_BOLD}Quick check from this machine:${C_RESET}
  ${C_GREEN}curl -H "Host: ${DOMAIN}" http://localhost/api/health${C_RESET}

${C_BOLD}Quick check from another machine on the same LAN (no /etc/hosts needed):${C_RESET}
  ${C_GREEN}curl -H "Host: ${DOMAIN}" http://${LAN_IP}:8080/api/health${C_RESET}

${C_BOLD}DNS options for browser access:${C_RESET}
  A) Point ${DOMAIN} A record to ${LAN_IP} (if you own the domain).
  B) Add a static DNS entry on your router resolving ${DOMAIN} -> ${LAN_IP}
     (covers all devices on the LAN with no per-host configuration).
  C) For one-off testing, add this line to the other machine's ${HOSTS_FILE}:
       ${HOSTS_LINE}
     (replace 127.0.0.1 with ${LAN_IP} when editing a different machine).

Useful commands:
  kubectl -n ${NAMESPACE} get pods
  kubectl -n ${NAMESPACE} get ingress
  kubectl -n ${NAMESPACE} logs -l ${APP_LABEL}
  kubectl -n ${NAMESPACE} logs -l app=rabble-migrate
  kubectl -n ${NAMESPACE} logs -l app=livekit
  kind delete cluster --name ${CLUSTER_NAME}

To skip steps next time:
  SKIP_INGRESS=1 ./scripts/dev-cluster.sh
  SKIP_IMAGE=1   ./scripts/dev-cluster.sh
EOF
