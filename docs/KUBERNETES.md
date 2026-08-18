# Production Kubernetes deployment

This guide covers deploying **Rabble** to a production-grade
Kubernetes cluster (EKS, GKE, AKS, or a self-managed cluster). It assumes
you already have:

- A reachable Kubernetes cluster (`kubectl` pointed at it).
- A public DNS name that resolves to your Ingress (e.g.
  `spaces.example.com`).
- A managed Postgres database (RDS / Cloud SQL / Azure Database) with TLS.
- An object store (S3 / GCS / Azure Blob) if you decide to back up
  session state externally.

The `k8s/` directory is structured as:

```
k8s/
  base/                # namespace, postgres, app, migration Job, RBAC, livekit
  overlays/kind/       # kind-only: includes the Ingress (cluster-local)
  ingress.yaml         # standalone Ingress (customize host + TLS for prod)
  certificate.yaml     # OPTIONAL cert-manager Certificate
  livekit.yaml         # LiveKit SFU (sized for dev; tune for prod)
  secret.example.yaml  # example Secret - DO NOT commit the real one
```

For production you typically:

1. Copy `k8s/base/` into your own GitOps repo (or kustomize it inline).
2. Drop the `postgres.yaml` from the overlay (use managed Postgres).
3. Replace `secret.example.yaml` with a real Secret managed by your
   secret store (Sealed Secrets, External Secrets, SOPS, etc.).
4. Drop `k8s/livekit.yaml` into a production-tuned overlay (resource
   requests, replica count, real API keys, UDP ICE port range).
5. Apply `k8s/ingress.yaml` with your host + TLS.
6. (Optional) Apply `k8s/certificate.yaml` against your production
   cert-manager `Issuer` (Let's Encrypt `prod`).

## Required secrets

`k8s/secret.example.yaml` is the source of truth for the Secret shape.
The keys the app actually reads are:

| Key | Required | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32 random bytes, hex-encoded (`openssl rand -hex 32`). Used by `iron-session` for cookie sealing. |
| `PUBLIC_URL` | yes | The canonical public URL, e.g. `https://spaces.example.com`. Drives the OAuth `client_id`. |
| `JWKS_PRIVATE_KEY` | yes (prod) | PEM-encoded PKCS#8 ES256 private key for `private_key_jwt`. |
| `JWKS_PUBLIC_KEY` | optional | JWKS JSON served at `/.well-known/jwks.json` if you want to host the public keyset directly. |
| `LIVEKIT_API_KEY` | yes | Must match the key configured in the LiveKit server. |
| `LIVEKIT_API_SECRET` | yes | Must match the secret configured in the LiveKit server. |
| `LIVEKIT_URL` | yes | `ws://livekit:7880` (in-cluster) or `wss://livekit.example.com` (split deploy). |
| `DATABASE_URL` | yes | Postgres connection string with `?sslmode=require`. |

Never commit a real Secret. Recommended patterns:

- **External Secrets Operator** + AWS Secrets Manager / GCP Secret Manager.
- **Sealed Secrets** for GitOps-friendly encryption-at-rest.
- **SOPS** + age / KMS if you prefer plain YAML with an encrypted
  `data:` block.

## LiveKit UDP and TURN

LiveKit is an SFU: the browser opens a WebSocket for signalling (port
7880 in-cluster) and one or more UDP candidates for media. The
production requirements are:

1. **UDP ICE port range.** Pick a contiguous range (e.g.
   `50000-50100`, 100 ports is enough for ~50 simultaneous publishers
   per SFU pod). Set `LIVEKIT_UDP_PORT_RANGE` in the LiveKit
   ConfigMap, then expose the range on the `livekit` Service. On a
   managed cluster the cleanest path is a `LoadBalancer` Service with
   `spec.healthCheckNodePort` disabled and the UDP range forwarded to
   the pod via `externalTrafficPolicy: Local` or a node-port-per-pod
   mapping.
2. **TURN server (coturn).** Browsers behind symmetric NATs cannot
   establish direct UDP paths. Run a coturn instance reachable on UDP
   `3478` and TLS `443` (or `5349`); pass the `turns:` URL into the
   Next.js app via the LiveKit token-mint call (already done in
   `src/lib/livekit.ts`). Sharing port 443 with the Ingress is the
   common pattern — use a separate `Service` and a different
   hostname (`turn.example.com`).
3. **Auth.** Replace `--dev` with an explicit `livekit.yaml` mounted
   from a Secret that contains real `api_key` / `api_secret` pairs and
   the TURN configuration. Disable `--dev` entirely.
4. **Resource sizing.** LiveKit is CPU-sensitive during fan-out. For a
   production audio-only MVP start with `500m-2000m` CPU and
   `512Mi-2Gi` memory per pod, plus a `HorizontalPodAutoscaler` on CPU.

`k8s/livekit.yaml` documents the dev defaults and shows the commented
fields you need to flip for production.

## Ingress + TLS

The provided `k8s/ingress.yaml` is a vanilla NGINX Ingress resource.
For production:

1. Change `spec.rules[0].host` from `rabble.town` to your public
   hostname (or leave it as `rabble.town` if that is your domain).
2. Install cert-manager and an `Issuer` (Let's Encrypt `prod`).
3. (Optional) Generate a `Certificate` resource (see
   `k8s/certificate.yaml`) and uncomment the `tls:` block on the
   Ingress, pointing `secretName` at the cert-manager-managed
   `Secret`.
4. If you're on a managed Kubernetes, install the cloud provider's
   NGINX Ingress controller (or use the cloud's managed LB +
   cert-manager). For EKS the AWS LB controller + cert-manager is the
   common combo.

Annotations worth keeping:

- `nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"` — LiveKit
  websockets are long-lived; default 60s will cut them off.
- `nginx.ingress.kubernetes.io/proxy-body-size: "8m"` — the post
  carousel uploads medium-sized images.

## Resource limits and health probes

The base Deployment already sets:

- `resources.requests` / `resources.limits` for CPU and memory.
- `readinessProbe.httpGet` against `/api/health` on port 3000.
- `livenessProbe.httpGet` against `/api/health` on port 3000.

For production tune the requests to match observed load. A reasonable
starting point for the Next.js pod:

```yaml
resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi
```

Add an HPA on CPU if you expect variable load.

## Steps to deploy

1. **Build and push the image** to your registry:

   ```bash
   docker build -t registry.example.com/rabble:v0.1.0 .
   docker push registry.example.com/rabble:v0.1.0
   ```

   Update `k8s/base/app.yaml` (or your overlay) to use that image +
   `imagePullPolicy: IfNotPresent`.

2. **Provision the database** in your cloud. Note the
   `DATABASE_URL` with `?sslmode=require`.

3. **Create the namespace and Secret**:

   ```bash
   kubectl create namespace bluesky-spaces

   kubectl -n bluesky-spaces apply -f secret.example.yaml
   # (or, more commonly, have External Secrets / Sealed Secrets do this)
   ```

4. **Generate JWKS** (see
   [`docs/BLUE_SKY_OAUTH_SETUP.md`](BLUE_SKY_OAUTH_SETUP.md)) and bake
   `JWKS_PRIVATE_KEY` into the Secret.

5. **Apply base manifests**:

   ```bash
   kubectl -n bluesky-spaces apply -k k8s/base
   ```

   For production drop `postgres.yaml` from the base; everything else
   applies as-is.

6. **Run the migration Job once**:

   ```bash
   kubectl -n bluesky-spaces create job --from=cronjob/<name> rabble-migrate-manual
   # or simply re-apply the Job; it will run once and complete.
   ```

   `k8s/base/migration-job.yaml` is a one-shot `Job`. Apply it once per
   deploy that includes a schema change.

7. **Apply the Ingress**:

   ```bash
   kubectl -n bluesky-spaces apply -f k8s/ingress.yaml
   ```

8. **Verify**:

   ```bash
   kubectl -n bluesky-spaces get pods
   kubectl -n bluesky-spaces get ingress
   curl https://rabble.town/api/health
   ```

9. **Scale**: bump the `replicas` on `rabble-app` (and
   `livekit` once it supports multiple replicas behind a Redis
   signalling store).

## What this manifest set does NOT yet cover

These are intentionally out of scope for Chunk 7:

- Multiple LiveKit replicas (needs Redis signalling store).
- Horizontal autoscaling HPA objects.
- PodDisruptionBudgets.
- NetworkPolicies.
- Backup / restore for Postgres.
- Observability stack (Prometheus, Grafana, OpenTelemetry).

Each of these is a separate chunk once the MVP is validated.
