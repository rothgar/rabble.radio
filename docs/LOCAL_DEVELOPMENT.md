# Local Development with kind

This guide walks you through running **Rabble** on a local
[kind](https://kind.sigs.k8s.io/) cluster, including the NGINX Ingress
controller, the in-cluster Postgres, the Next.js app, and the LiveKit SFU.

If you only need to poke at the UI and don't care about K8s, see the
"Quick start (no Kubernetes)" section in [`README.md`](../README.md).

## Prerequisites

Install on Linux (or WSL2 / macOS with Docker Desktop):

- **Docker** — any recent build (Docker Engine 24+ or Docker Desktop).
- **kind** — `go install sigs.k8s.io/kind@latest` or a release binary.
- **kubectl** — match the version bundled with kind if possible.

Verify:

```bash
docker --version
kind --version
kubectl version --client
```

The bootstrap script also needs `curl` (it pulls the NGINX Ingress
manifest from `raw.githubusercontent.com`).

## One-shot bootstrap

From the repo root:

```bash
./scripts/dev-cluster.sh
```

What it does (idempotent):

1. Checks for `kind`, `kubectl`, `docker`.
2. Creates the `bluesky-spaces` kind cluster from `k8s/kind-config.yaml`
   (mapping host ports 80, 443 and 8080 into the cluster).
3. Builds the `bluesky-spaces:local` Docker image.
4. Loads that image into kind so the cluster can pull it without a
   registry.
5. Installs the NGINX Ingress controller from
   `https://raw.githubusercontent.com/kubernetes/ingress-nginx/...`
   (kind-friendly static manifest) and waits for its controller pod.
6. Applies the `k8s/overlays/kind` kustomization, which includes the
   base (namespace, Postgres, app, migration Job, LiveKit) **plus**
   the Ingress for `bluesky-spaces.local` (see `k8s/ingress.yaml`).
7. Waits for Postgres, the `prisma migrate deploy` Job, and the app pod
   to become ready.
8. Prints `/etc/hosts` instructions and quick-check commands.

Useful env knobs:

| Var | Effect |
| --- | --- |
| `CLUSTER_NAME=foo` | use / create a different kind cluster |
| `DOMAIN=rabble.town` | host used by the Ingress and printed access hints |
| `LAN_IP=192.168.1.100` | override the detected LAN IP for multi-machine hints |
| `SKIP_IMAGE=1` | skip `docker build` and `kind load docker-image` |
| `SKIP_INGRESS=1` | skip the ingress-nginx install |
| `IMAGE_NAME=my/app:dev` | override the image name to build / load |
| `OVERLAY_DIR=...` | point at a different kustomize overlay |

## /etc/hosts

The Ingress listens on host port 80 (mapped in `k8s/kind-config.yaml`).
Add one line to `/etc/hosts` so your browser can resolve
`rabble.town` to that port:

```
127.0.0.1 rabble.town
```

sudo required on Linux. On macOS / WSL the same line works.

If you want a different local domain, set `DOMAIN` when running the
script:

```bash
DOMAIN=spaces.local ./scripts/dev-cluster.sh
```

## Verify

Three quick sanity checks:

```bash
# 1) Health endpoint through the Ingress (port 80, the canonical path):
curl -H "Host: rabble.town" http://localhost/api/health

# 2) Same endpoint via NodePort (no /etc/hosts needed):
curl -H "Host: rabble.town" http://localhost:8080/api/health

# 3) Spaces listing:
curl -H "Host: rabble.town" http://localhost/spaces
```

You should see JSON `{"status":"ok", ...}` for the health probe and an
HTML response from `/spaces`. To drive the full OAuth / Space flow,
visit `http://rabble.town` in your browser.

## Inspecting the cluster

```bash
kubectl -n bluesky-spaces get pods
kubectl -n bluesky-spaces get ingress
kubectl -n bluesky-spaces logs -l app=rabble-app
kubectl -n bluesky-spaces logs -l app=livekit
kubectl -n bluesky-spaces logs -l app=rabble-migrate
```

The Ingress controller lives in `ingress-nginx`:

```bash
kubectl -n ingress-nginx get pods
kubectl -n ingress-nginx logs -l app.kubernetes.io/component=controller
```

## LiveKit dev-mode limitations

`k8s/livekit.yaml` starts LiveKit with `--dev`. That means:

- **No real authentication.** `--dev` accepts any API key/secret, which
  matches the dev key/secret baked into the app ConfigMap. **Do not**
  run `--dev` outside of local kind or CI.
- **Single UDP ICE port.** `--dev` exposes one UDP candidate (7882). For
  a real browser audio path you usually want a port range
  (e.g. `50000-50100`) plus a TURN server for restrictive NATs. See
  [`KUBERNETES.md`](KUBERNETES.md#livekit-udp-and-turn) for production
  guidance.
- **No persistence.** Sessions are in-memory; restarting the pod
  disconnects everyone.
- **No TURN / no relay.** Browsers behind symmetric NATs will fall back
  to host candidates inside kind, which works on a single host; over
  the public internet they will fail.

## Testing from another machine (no `/etc/hosts`)

`scripts/dev-cluster.sh` detects the host machine's primary LAN IP and
prints a curl command you can run from any other machine on the same
network:

```bash
curl -H "Host: rabble.town" http://<HOST_LAN_IP>:8080/api/health
```

For a browser on the other machine, pick one of these DNS options (all
avoid installing `dnsmasq` on the host):

1. **Own the domain (recommended).** Point a public DNS `A` record for
   `rabble.town` at the host's LAN IP (or public IP if port-forwarding).
   This is the cleanest option and matches the eventual production setup.

2. **Router DNS override.** Many routers let you add a static DNS entry
   that resolves `rabble.town` to a local IP for all devices on the LAN.
   No per-client configuration is required.

3. **mDNS / Avahi.** If both machines are on the same LAN, you can use
   an mDNS name for the host (e.g. `myhost.local`) and access the app at
   `http://myhost.local:8080` with the `Host: rabble.town` header. Browsers
   do not send arbitrary `Host:` headers, so this still requires a DNS
   name that resolves to the host — use option 1 or 2 for the domain.

4. **One-off `/etc/hosts` on the other machine.** If the other machine is
   under your control, add a line there (not on the host). Replace
   `127.0.0.1` with the host's LAN IP:

   ```
   192.168.1.42 rabble.town
   ```

5. **Direct IP with a browser extension.** For quick manual checks you
   can use a browser extension that lets you override the `Host` header
   and request `http://<HOST_LAN_IP>:8080`. This is useful for one-off
   testing but not a substitute for real DNS.

The NodePort on `:8080` is mapped into the kind node, so it is
reachable from the LAN as long as the host's firewall allows incoming
TCP 8080. If you changed `DOMAIN` (e.g. `DOMAIN=spaces.local`), replace
`rabble.town` accordingly.

For the MVP local flow (single host, a handful of participants) `--dev`
is plenty.

## Optional: TLS via cert-manager

`k8s/certificate.yaml` declares a self-signed `ClusterIssuer` and
`Certificate` for `rabble.town`. TLS is **not required** for the MVP
(the OAuth loopback flow used in dev is HTTP), but if you want it:

```bash
# 1) install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl -n cert-manager rollout status deploy/cert-manager --timeout=180s

# 2) apply the self-signed issuer + certificate
kubectl apply -f k8s/certificate.yaml

# 3) uncomment the `tls:` block in k8s/ingress.yaml and re-apply
kubectl apply -f k8s/ingress.yaml
```

Browsers will still warn about the self-signed cert; that's expected
for kind.

If you changed `DOMAIN`, remember that `k8s/ingress.yaml` and
`k8s/certificate.yaml` are committed with `rabble.town`. For a
persistent local domain you can maintain your own overlay under
`k8s/overlays/<name>/` and set `OVERLAY_DIR` accordingly.

## Tear down

```bash
kind delete cluster --name bluesky-spaces
```

This drops the cluster and all pods (Postgres data is ephemeral - it's
an emptyDir in the local overlay). Re-running `./scripts/dev-cluster.sh`
recreates everything from scratch.
