#!/usr/bin/env bash
# Tadaima POS — build + push + deploy a Google Cloud Run
set -euo pipefail

# ─── Config (sobreescribe con env vars si quieres) ────────────────────────────
PROJECT_ID="${PROJECT_ID:-tadaima-pos}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-tadaima}"
REPO="${REPO:-tadaima}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:${IMAGE_TAG}"
IMAGE_LATEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

# URL pública del servicio (se conoce tras el primer deploy)
PUBLIC_URL="${PUBLIC_URL:-https://${SERVICE}-${PROJECT_ID}.${REGION}.run.app}"
VITE_API_URL="${VITE_API_URL:-${PUBLIC_URL}}"

echo "──────────────────────────────────────────────────────"
echo " Project:      ${PROJECT_ID}"
echo " Region:       ${REGION}"
echo " Service:      ${SERVICE}"
echo " Image:        ${IMAGE}"
echo " VITE_API_URL: ${VITE_API_URL}"
echo "──────────────────────────────────────────────────────"

# ─── 1. Pre-flight ────────────────────────────────────────────────────────────
gcloud config set project "${PROJECT_ID}" > /dev/null

gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com > /dev/null

# Crear Artifact Registry repo si no existe
if ! gcloud artifacts repositories describe "${REPO}" --location="${REGION}" > /dev/null 2>&1; then
    echo "[deploy] Creando Artifact Registry repo '${REPO}'"
    gcloud artifacts repositories create "${REPO}" \
        --repository-format=docker \
        --location="${REGION}" \
        --description="Tadaima POS images"
fi

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ─── 2. APP_KEY en Secret Manager ─────────────────────────────────────────────
if ! gcloud secrets describe tadaima-app-key > /dev/null 2>&1; then
    echo "[deploy] Creando secreto APP_KEY"
    APP_KEY_VALUE="base64:$(openssl rand -base64 32)"
    printf '%s' "${APP_KEY_VALUE}" | \
        gcloud secrets create tadaima-app-key \
            --replication-policy=automatic \
            --data-file=-
fi

# ─── 3. Build (linux/amd64 — Cloud Run no corre arm64) ───────────────────────
echo "[deploy] Construyendo imagen"
docker build \
    --platform=linux/amd64 \
    --build-arg "VITE_API_URL=${VITE_API_URL}" \
    -t "${IMAGE}" \
    -t "${IMAGE_LATEST}" \
    .

# ─── 4. Push ──────────────────────────────────────────────────────────────────
echo "[deploy] Subiendo imagen"
docker push "${IMAGE}"
docker push "${IMAGE_LATEST}"

# ─── 5. Deploy a Cloud Run ────────────────────────────────────────────────────
echo "[deploy] Desplegando en Cloud Run"
gcloud run deploy "${SERVICE}" \
    --image="${IMAGE}" \
    --region="${REGION}" \
    --platform=managed \
    --allow-unauthenticated \
    --port=8080 \
    --cpu=1 \
    --memory=512Mi \
    --min-instances=0 \
    --max-instances=4 \
    --concurrency=80 \
    --timeout=300 \
    --execution-environment=gen2 \
    --cpu-boost \
    --set-env-vars="APP_ENV=production,APP_DEBUG=false,APP_URL=${PUBLIC_URL},LOG_CHANNEL=stderr,LOG_LEVEL=info,DB_CONNECTION=sqlite,DB_DATABASE=/var/www/database/database.sqlite,DB_FOREIGN_KEYS=true,SESSION_DRIVER=database,SESSION_SECURE_COOKIE=true,CACHE_STORE=database,QUEUE_CONNECTION=sync,FILESYSTEM_DISK=local,MAIL_MAILER=log,SANCTUM_STATEFUL_DOMAINS=${PUBLIC_URL#https://}" \
    --set-secrets="APP_KEY=tadaima-app-key:latest"

# ─── 6. URL final ─────────────────────────────────────────────────────────────
DEPLOYED_URL=$(gcloud run services describe "${SERVICE}" \
    --region="${REGION}" \
    --format='value(status.url)')

echo "──────────────────────────────────────────────────────"
echo " Desplegado: ${DEPLOYED_URL}"
echo " Tag:        ${IMAGE_TAG}"
echo "──────────────────────────────────────────────────────"

if [ "${VITE_API_URL}" != "${DEPLOYED_URL}" ]; then
    echo ""
    echo "AVISO: VITE_API_URL (${VITE_API_URL}) difiere de la URL desplegada."
    echo "Primer deploy normal — vuelve a correr con:"
    echo "  PUBLIC_URL=${DEPLOYED_URL} VITE_API_URL=${DEPLOYED_URL} ./deploy.sh"
fi
