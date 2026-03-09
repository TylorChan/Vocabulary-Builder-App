#!/usr/bin/env bash
set -euo pipefail

# One-command Cloud Run deploy for MARK II backend stack.
# Usage:
#   ./deploy-backend.sh
#   ./deploy-backend.sh --project gen-lang-client-0581834151 --region us-central1

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GCP_REGION:-us-central1}"

FSRS_SERVICE="mark2-fsrs"
BACKEND_SERVICE="mark2-backend"
API_SERVICE="mark2-api"
VOICE_SERVICE="mark2-voice"
MEMORY_SERVICE="mark2-memory"

CORS_ORIGIN="${CORS_ORIGIN:-*}"

MONGO_URI_SECRET="${MONGO_URI_SECRET:-mark2-mongo-uri}"
MONGODB_ATLAS_URI_SECRET="${MONGODB_ATLAS_URI_SECRET:-mark2-mongodb-atlas-uri}"
MONGODB_DATABASE_SECRET="${MONGODB_DATABASE_SECRET:-mark2-mongodb-database}"
MONGODB_VECTOR_COLLECTION_SECRET="${MONGODB_VECTOR_COLLECTION_SECRET:-mark2-mongodb-vector-collection}"
OPENAI_API_KEY_SECRET="${OPENAI_API_KEY_SECRET:-mark2-openai-api-key}"
GEMINI_API_KEY_SECRET="${GEMINI_API_KEY_SECRET:-mark2-gemini-api-key}"
DEEPGRAM_API_KEY_SECRET="${DEEPGRAM_API_KEY_SECRET:-mark2-deepgram-api-key}"

ENABLE_APIS=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --cors-origin)
      CORS_ORIGIN="$2"
      shift 2
      ;;
    --skip-enable-apis)
      ENABLE_APIS=false
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Deploy MARK II backend services to Cloud Run.

Options:
  --project <id>          GCP project id (default: gcloud active project)
  --region <region>       Cloud Run region (default: us-central1)
  --cors-origin <origin>  CORS origin for Node services (default: *)
  --skip-enable-apis      Skip enabling required Google APIs
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud not found. Install Google Cloud CLI first." >&2
  exit 1
fi

if [[ -z "${PROJECT}" ]]; then
  echo "No GCP project set. Use --project <id> or run: gcloud config set project <id>" >&2
  exit 1
fi

echo "==> Deploy target"
echo "Project: ${PROJECT}"
echo "Region : ${REGION}"
echo

gcloud config set project "${PROJECT}" >/dev/null

if [[ "${ENABLE_APIS}" == "true" ]]; then
  echo "==> Enabling required APIs (idempotent)"
  gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    cloudresourcemanager.googleapis.com \
    --project "${PROJECT}" >/dev/null
fi

echo "==> Deploying ${FSRS_SERVICE}"
gcloud run deploy "${FSRS_SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --source "${ROOT_DIR}/vocabularyBackend/fsrs-service" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --memory=256Mi \
  --cpu=1 \
  --port=8080 \
  --quiet

FSRS_URL="$(gcloud run services describe "${FSRS_SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
if [[ -z "${FSRS_URL}" ]]; then
  echo "Failed to resolve FSRS service URL." >&2
  exit 1
fi

echo "==> Deploying ${BACKEND_SERVICE} (FSRS_BASE_URL=${FSRS_URL})"
gcloud run deploy "${BACKEND_SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --source "${ROOT_DIR}/vocabularyBackend" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --port=8080 \
  --set-env-vars "FSRS_BASE_URL=${FSRS_URL}" \
  --set-secrets "MONGODB_URI=${MONGO_URI_SECRET}:latest,MONGODB_DATABASE=${MONGODB_DATABASE_SECRET}:latest" \
  --quiet

echo "==> Deploying ${API_SERVICE}"
gcloud run deploy "${API_SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --source "${ROOT_DIR}/Mark1" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --port=8080 \
  --timeout=3600 \
  --command=node \
  --args=server.js \
  --set-env-vars "CORS_ORIGIN=${CORS_ORIGIN}" \
  --set-secrets "OPENAI_API_KEY=${OPENAI_API_KEY_SECRET}:latest,GEMINI_API_KEY=${GEMINI_API_KEY_SECRET}:latest,DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY_SECRET}:latest" \
  --quiet

echo "==> Deploying ${VOICE_SERVICE}"
gcloud run deploy "${VOICE_SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --source "${ROOT_DIR}/Mark1" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --memory=256Mi \
  --cpu=1 \
  --port=8080 \
  --command=node \
  --args=voiceServer.js \
  --set-env-vars "CORS_ORIGIN=${CORS_ORIGIN}" \
  --set-secrets "OPENAI_API_KEY=${OPENAI_API_KEY_SECRET}:latest" \
  --quiet

echo "==> Deploying ${MEMORY_SERVICE}"
gcloud run deploy "${MEMORY_SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --source "${ROOT_DIR}/Mark1" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --port=8080 \
  --command=node \
  --args=memory/memoryServer.js \
  --set-env-vars "CORS_ORIGIN=${CORS_ORIGIN}" \
  --set-secrets "MONGO_URI=${MONGO_URI_SECRET}:latest,MONGODB_ATLAS_URI=${MONGODB_ATLAS_URI_SECRET}:latest,MONGODB_DATABASE=${MONGODB_DATABASE_SECRET}:latest,MONGODB_ATLAS_DB_NAME=${MONGODB_DATABASE_SECRET}:latest,MONGODB_ATLAS_COLLECTION_NAME=${MONGODB_VECTOR_COLLECTION_SECRET}:latest,OPENAI_API_KEY=${OPENAI_API_KEY_SECRET}:latest" \
  --quiet

API_URL="$(gcloud run services describe "${API_SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
VOICE_URL="$(gcloud run services describe "${VOICE_SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
MEMORY_URL="$(gcloud run services describe "${MEMORY_SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
BACKEND_URL="$(gcloud run services describe "${BACKEND_SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"

echo
echo "✅ Deploy complete"
echo "FSRS    : ${FSRS_URL}"
echo "Backend : ${BACKEND_URL}/graphql"
echo "API     : ${API_URL}"
echo "Voice   : ${VOICE_URL}"
echo "Memory  : ${MEMORY_URL}"

