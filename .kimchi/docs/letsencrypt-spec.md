# Let's Encrypt TLS for rabble.jgarr.net

## Goal
Enable HTTPS for the kind-deployed Rabble app so Bluesky OAuth `private_key_jwt` works against the public domain `rabble.jgarr.net`.

## Prerequisite (user responsibility)
The DNS A record for `rabble.jgarr.net` resolves to `10.1.1.19` (the host LAN IP). Let's Encrypt HTTP-01 requires the host's router to forward **public** port 80 (and ideally 443) to `10.1.1.19:80` / `10.1.1.19:443`. The kind cluster already maps host ports 80/443 to the ingress controller. If port forwarding is not active, cert issuance will hang/fail.

## Chunks

### Chunk 1 — Install cert-manager
**Files changed:** none (cluster state only)
**Goal:** Install cert-manager CRDs and controller in the kind cluster.
**Steps:**
1. Apply cert-manager manifest: `kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml`
2. Wait for cert-manager pods to be Ready in `cert-manager` namespace.

**Accept when:** `kubectl -n cert-manager get pods` shows `cert-manager-*` pods Running.

### Chunk 2 — Let's Encrypt Issuer + Certificate
**Files changed:**
- `k8s/cert-manager/cluster-issuer.yaml` (new)
- `k8s/cert-manager/certificate.yaml` (new)
- `k8s/cert-manager/kustomization.yaml` (new)

**Goal:** Create a Let's Encrypt staging ClusterIssuer and a Certificate for `rabble.jgarr.net`.

**Manifest details:**
- `ClusterIssuer` named `letsencrypt-staging`
- ACME server: `https://acme-staging-v02.api.letsencrypt.org/directory`
- Email: `admin@rabble.town`
- Solver: `http01` with `ingress.class: nginx`
- `Certificate` named `rabble-tls` in `bluesky-spaces` namespace
- Secret name: `rabble-tls`
- DNS name: `rabble.jgarr.net`
- Issuer ref: `letsencrypt-staging`

**Accept when:** `kubectl -n bluesky-spaces describe certificate rabble-tls` shows a successfully issued certificate (Ready=True), or explains that it is waiting for HTTP-01 if port forwarding is not yet active.

### Chunk 3 — Wire TLS into Ingress
**Files changed:** `k8s/ingress.yaml`
**Goal:** Configure the existing ingress to terminate TLS on port 443 using the `rabble-tls` secret.

**Changes:**
- Add `tls:` block:
  ```yaml
  tls:
    - hosts:
        - rabble.jgarr.net
      secretName: rabble-tls
  ```
- Ensure the `host` rule remains `rabble.jgarr.net`.

**Accept when:** `kubectl -n bluesky-spaces apply -f k8s/ingress.yaml` succeeds and the ingress shows the TLS host.

### Chunk 4 — App ConfigMap for HTTPS public URL
**Files changed:** `k8s/base/app.yaml`
**Goal:** Set `PUBLIC_URL=https://rabble.jgarr.net` and `LOGO_URL=https://rabble.jgarr.net/logo.png` in the ConfigMap.

**Accept when:** `kubectl -n bluesky-spaces describe cm rabble-app-env` shows the HTTPS URL.

### Chunk 5 — Rebuild, load, restart, verify
**Files changed:** none (build + cluster state)
**Goal:** Build the app image with current source, load it into kind, restart the deployment, and verify HTTPS.

**Steps:**
1. `docker build -t rabble:local .`
2. `kind load docker-image rabble:local --name rabble`
3. `kubectl -n bluesky-spaces rollout restart deployment/rabble-app`
4. Wait for Ready.
5. Test `curl -k https://rabble.jgarr.net/api/health` (or via external host).
6. Test `curl https://rabble.jgarr.net/oauth-client-metadata.json` returns valid HTTPS metadata.

**Accept when:** HTTPS health and metadata endpoints respond.

## Notes
- The current app is in loopback mode because `PUBLIC_URL` was emptied. Setting it to HTTPS will re-enable `private_key_jwt`.
- The existing Secret `rabble-app-secrets` already contains `JWKS_PRIVATE_KEY` and `JWKS_PUBLIC_KEY`.
- If staging succeeds and a real cert is desired, create a second `ClusterIssuer` for `https://acme-v02.api.letsencrypt.org/directory` and update the Certificate.
