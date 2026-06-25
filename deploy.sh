#!/usr/bin/env bash
# Tadaima POS — build + push + deploy a Google Cloud Run
set -euo pipefail

# ─── Config (sobreescribe con env vars si quieres) ────────────────────────────
PROJECT_ID="${PROJECT_ID:-impusodigitaldorado}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-tadaima}"
REPO="${REPO:-tadaima}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%s)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:${IMAGE_TAG}"
IMAGE_LATEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

# URL pública del servicio (se conoce tras el primer deploy)
PUBLIC_URL="${PUBLIC_URL:-https://${SERVICE}-${PROJECT_ID}.${REGION}.run.app}"
VITE_API_URL="${VITE_API_URL:-${PUBLIC_URL}}"
# Dominio custom — si está configurado se usa como APP_URL y en Sanctum
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-}"

echo "──────────────────────────────────────────────────────"
echo " Project:      ${PROJECT_ID}"
echo " Region:       ${REGION}"
echo " Service:      ${SERVICE}"
echo " Image:        ${IMAGE}"
echo " VITE_API_URL: ${VITE_API_URL}"
echo "──────────────────────────────────────────────────────"

# ─── Cloud SQL & Storage config ──────────────────────────────────────────────
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-impusodigitaldorado:us-west1:pos-lite-db}"
DB_NAME="${DB_NAME:-tadaimaposlite}"
DB_USER="${DB_USER:-tadaima_app}"
GCS_BUCKET="${GCS_BUCKET:-tadaima-media}"

# Supabase loyalty (socios Tadaima). La URL no es secreta; la service key va en
# Secret Manager (como APP_KEY/DB_PASSWORD) para no exponerla ni perderla en deploys.
TADAIMA_SUPABASE_URL="${TADAIMA_SUPABASE_URL:-https://tfbhysypjuoadgnwjaba.supabase.co}"
SUPABASE_KEY_SECRET="${SUPABASE_KEY_SECRET:-tadaima-supabase-service-key}"

# ─── 1. Pre-flight ────────────────────────────────────────────────────────────
gcloud config set project "${PROJECT_ID}" > /dev/null

gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    sqladmin.googleapis.com \
    storage.googleapis.com > /dev/null

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

# ─── 2b. Supabase service key en Secret Manager ──────────────────────────────
# Si el secreto no existe, lo crea desde TADAIMA_SUPABASE_SERVICE_KEY (exporta la
# key antes de correr el deploy la primera vez). Una vez creado, ya no se necesita
# la env var: Cloud Run la inyecta desde Secret Manager en cada deploy.
if ! gcloud secrets describe "${SUPABASE_KEY_SECRET}" > /dev/null 2>&1; then
    if [ -z "${TADAIMA_SUPABASE_SERVICE_KEY:-}" ]; then
        echo "[deploy] ERROR: falta el secreto '${SUPABASE_KEY_SECRET}' en Secret Manager"
        echo "         y no se exportó TADAIMA_SUPABASE_SERVICE_KEY. Créalo una vez con:"
        echo "           printf '%s' '<service_role key>' | gcloud secrets create ${SUPABASE_KEY_SECRET} \\"
        echo "               --replication-policy=automatic --data-file=-"
        echo "         o exporta TADAIMA_SUPABASE_SERVICE_KEY y vuelve a correr ./deploy.sh"
        exit 1
    fi
    echo "[deploy] Creando secreto ${SUPABASE_KEY_SECRET}"
    printf '%s' "${TADAIMA_SUPABASE_SERVICE_KEY}" | \
        gcloud secrets create "${SUPABASE_KEY_SECRET}" \
            --replication-policy=automatic \
            --data-file=-
fi

# ─── 3. Build (linux/amd64 — Cloud Run no corre arm64) ───────────────────────
echo "[deploy] Construyendo imagen"
docker build \
    --platform=linux/amd64 \
    --build-arg VITE_API_URL="" \
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
    --cpu=2 \
    --memory=1Gi \
    --min-instances=0 \
    --max-instances=10 \
    --concurrency=40 \
    --timeout=300 \
    --execution-environment=gen2 \
    --cpu-boost \
    --add-cloudsql-instances="${CLOUD_SQL_INSTANCE}" \
    --set-env-vars="^@^APP_ENV=production@APP_DEBUG=false@APP_URL=${CUSTOM_DOMAIN:-${PUBLIC_URL}}@LOG_CHANNEL=stderr@LOG_LEVEL=info@DB_CONNECTION=mysql@DB_SOCKET=/cloudsql/${CLOUD_SQL_INSTANCE}@DB_DATABASE=${DB_NAME}@DB_USERNAME=${DB_USER}@SESSION_DRIVER=database@SESSION_SECURE_COOKIE=true@CACHE_STORE=database@QUEUE_CONNECTION=sync@FILESYSTEM_DISK=gcs@GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}@GOOGLE_CLOUD_STORAGE_BUCKET=${GCS_BUCKET}@MAIL_MAILER=log@SANCTUM_STATEFUL_DOMAINS=${CUSTOM_DOMAIN#https://}${CUSTOM_DOMAIN:+,}${PUBLIC_URL#https://}@TADAIMA_SUPABASE_URL=${TADAIMA_SUPABASE_URL}" \
    --set-secrets="APP_KEY=tadaima-app-key:latest,DB_PASSWORD=tadaima-db-password:latest,TADAIMA_SUPABASE_SERVICE_KEY=${SUPABASE_KEY_SECRET}:latest"

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
