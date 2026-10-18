# DevOps runbook

## Project identity

- Repository: https://github.com/Rushhaabhhh/Microservices-Backend-System
- Baseline commit: `95104a45495f443a133fb22cc244cfdbaf7b39bf`
- Baseline permanent link: https://github.com/Rushhaabhhh/Microservices-Backend-System/commit/95104a45495f443a133fb22cc244cfdbaf7b39bf
- Final commit: fill after the improvement work is committed.
- Pull request: fill after the improvement branch is pushed.

The baseline commit predates the DevOps changes. Keep it in repository history and use the full hash in the baseline and final forms.

## Architecture

The API gateway exposes GraphQL on port `4000`. Users, products, orders, notifications, and recommendations are independent Node.js/TypeScript services. MongoDB stores service data, Redis provides caching, and Kafka/Zookeeper carry asynchronous events. Prometheus scrapes metrics from the gateway and services; Grafana visualizes the Prometheus data.

## Local Compose deployment

Prerequisites: Docker Engine with Compose v2 and Git.

```bash
cp .env.example .env
# Replace every change-me or replace-with value in .env.
docker compose config
docker compose up --build -d
curl http://localhost:4000/healthz
docker compose ps
docker compose logs --tail=100 api-gateway
```

Useful endpoints:

- GraphQL: `http://localhost:4000/graphql`
- Gateway health: `http://localhost:4000/healthz`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`
- Service metrics: gateway `9200`, users `9201`, products `9202`, orders `9203`

Stop the environment with `docker compose down`. Add `-v` only when intentionally deleting local database and Grafana volumes.

## Build and typecheck

Run from the repository root:

```bash
for dir in gateway services/users services/orders services/products services/notifications services/recommendations; do
  (cd "$dir" && yarn install --frozen-lockfile && yarn typecheck && yarn build)
done
```

Do not use `npx tsc` unless dependencies are installed; it can download an unrelated package when `node_modules` is absent.

## Kubernetes deployment

The manifests target a local cluster such as kind or minikube. They include Redis, MongoDB, Kafka/Zookeeper, the five services, the gateway, probes, resource limits, and a NodePort gateway.

```bash
kubectl apply -k k8s/
kubectl -n microservices create secret generic service-secrets \
  --from-literal=MONGO_ROOT_USERNAME="$MONGO_ROOT_USERNAME" \
  --from-literal=MONGO_ROOT_PASSWORD="$MONGO_ROOT_PASSWORD" \
  --from-literal=USERS_MONGO_URL="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@mongo:27017/users-service?authSource=admin" \
  --from-literal=PRODUCTS_MONGO_URL="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@mongo:27017/products-service?authSource=admin" \
  --from-literal=ORDERS_MONGO_URL="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@mongo:27017/orders-service?authSource=admin" \
  --from-literal=NOTIFICATIONS_MONGO_URL="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@mongo:27017/notifications-service?authSource=admin" \
  --from-literal=API_SECRET="$API_SECRET" \
  --from-literal=SMTP_USER="${SMTP_USER:-}" \
  --from-literal=SMTP_PASS="${SMTP_PASS:-}" \
  --from-literal=SENDER_EMAIL="${SENDER_EMAIL:-}" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n microservices get pods
kubectl -n microservices rollout status deployment/api-gateway
kubectl -n microservices port-forward service/api-gateway 4000:4000
curl http://localhost:4000/healthz
```

The CI workflow publishes images under `ghcr.io/rushhaabhhh/microservices-backend-system/<service>:<commit-sha>`. For a release, set each deployment image to that exact SHA tag before rollout. If the registry is private, configure an image pull secret in the cluster; never commit registry credentials.

## Release and rollback

A merge to `main` must have a green `validate` and `container-scan` job. The `publish` job produces commit-SHA tags. Deploy that SHA, verify rollout and `/healthz`, then record the deployed image in the evidence.

```bash
kubectl -n microservices set image deployment/api-gateway api-gateway=ghcr.io/rushhaabhhh/microservices-backend-system/gateway:<commit-sha>
kubectl -n microservices rollout status deployment/api-gateway
kubectl -n microservices rollout history deployment/api-gateway
kubectl -n microservices rollout undo deployment/api-gateway
```

Rollback is to the previous ReplicaSet, followed by a health check and log inspection. Never use `latest` as the evidence version.

## Verification evidence

Capture the CI run URL, final commit SHA, deployed image SHA, successful gateway health response, a representative GraphQL or API request, `kubectl get pods`, and relevant application logs. Record Prometheus targets as up and include a dashboard or query screenshot if requested by the course form.

## Baseline form notes

At the baseline, the repository already had Dockerfiles and Docker Compose for the microservices, MongoDB, Redis, Kafka/Zookeeper, Prometheus, and Grafana. It did not have Kubernetes manifests, GitHub Actions CI/CD, release rollback automation, or a documented health-check workflow. The baseline Compose file contained hard-coded database, Grafana, JWT, and SMTP credentials; those credentials must be rotated because the baseline commit remains in Git history.

## Known limitations

- The local Kubernetes manifests use single replicas and non-persistent development databases; this is not a production high-availability deployment.
- Notifications require a real SMTP account for email delivery; leaving SMTP values empty allows infrastructure checks but not email delivery.
- Kafka/Zookeeper use the existing development images and should be replaced with maintained images for a production deployment.
- No Terraform or cloud deployment is included; the assignment allows local deployment.
