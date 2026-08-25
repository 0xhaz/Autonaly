#!/usr/bin/env bash
# Cutover: build both service images and deploy the four Cloud Run services.
#
# Idempotent — re-running redeploys in place. Reads the Clerk keys from
# web/.env.local so no secret is ever typed into a command line or committed.
#
#   ./scripts/deploy.sh            # build + deploy everything
#   ./scripts/deploy.sh --no-build # redeploy the current images
set -euo pipefail

PROJECT=${AUTONALY_PROJECT_ID:-autonaly-hackathon}
REGION=${AUTONALY_LOCATION:-us-central1}
REPO="$REGION-docker.pkg.dev/$PROJECT/autonaly"
TAG=${TAG:-v1}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENGINE_SA="autonaly-engine@$PROJECT.iam.gserviceaccount.com"
AGENT_SA="autonaly-agent@$PROJECT.iam.gserviceaccount.com"
WEB_SA="autonaly-web@$PROJECT.iam.gserviceaccount.com"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "==> building engine + agent images"
  gcloud builds submit --project="$PROJECT" --region="$REGION" \
    --config=infra/cloudbuild.yaml --substitutions=_TAG="$TAG" .
fi

# --- 1. engine -------------------------------------------------------------
# Public: it serves only public reference data and has no write surface. Its
# service account carries no aiplatform role, so the deterministic boundary is
# enforced by IAM as well as by the image (which has no google-genai at all).
echo "==> deploying engine"
gcloud run deploy autonaly-engine --project="$PROJECT" --region="$REGION" \
  --image="$REPO/engine:$TAG" \
  --service-account="$ENGINE_SA" \
  --allow-unauthenticated \
  --memory=2Gi --cpu=2 --min-instances=0 --max-instances=4 \
  --add-volume=name=artifacts,type=cloud-storage,bucket=autonaly-artifacts,readonly=true \
  --add-volume-mount=volume=artifacts,mount-path=/artifacts \
  --set-env-vars="AUTONALY_ENV=gcp,AUTONALY_PROJECT_ID=$PROJECT,AUTONALY_ARTIFACT_ROOT=/artifacts" \
  --quiet
ENGINE_URL=$(gcloud run services describe autonaly-engine --project="$PROJECT" --region="$REGION" --format="value(status.url)")
echo "    engine: $ENGINE_URL"

# --- 2. agent API ----------------------------------------------------------
# Private: every call spends Vertex tokens, and the web app is the only
# legitimate caller (it presents a Cloud Run ID token — see lib/serviceAuth.ts).
echo "==> deploying agent api"
gcloud run deploy autonaly-agent --project="$PROJECT" --region="$REGION" \
  --image="$REPO/agent:$TAG" \
  --service-account="$AGENT_SA" \
  --no-allow-unauthenticated \
  --memory=1Gi --cpu=1 --min-instances=0 --max-instances=3 --timeout=300 \
  --set-env-vars="AUTONALY_ENV=gcp,AUTONALY_PROJECT_ID=$PROJECT,AUTONALY_ENGINE_URL=$ENGINE_URL,AUTONALY_VERTEX_LOCATION=global,AUTONALY_GEMINI_MODEL=gemini-3.7-flash,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_LOCATION=global" \
  --quiet
AGENT_URL=$(gcloud run services describe autonaly-agent --project="$PROJECT" --region="$REGION" --format="value(status.url)")
echo "    agent:  $AGENT_URL"

# --- 3. worker -------------------------------------------------------------
# A pull subscriber wrapped in a health server (worker_service.py explains
# why): Cloud Run requires an HTTP listener, and the loop needs an instance
# that stays alive and keeps its CPU between messages.
echo "==> deploying worker"
gcloud run deploy autonaly-worker --project="$PROJECT" --region="$REGION" \
  --image="$REPO/agent:$TAG" \
  --service-account="$AGENT_SA" \
  --no-allow-unauthenticated \
  --memory=1Gi --cpu=1 --min-instances=1 --max-instances=1 --no-cpu-throttling \
  --command=uvicorn --args=autonaly_ingest.worker_service:app,--host,0.0.0.0,--port,8080 \
  --set-env-vars="AUTONALY_ENV=gcp,AUTONALY_PROJECT_ID=$PROJECT,AUTONALY_ENGINE_URL=$ENGINE_URL,AUTONALY_VERTEX_LOCATION=global,AUTONALY_GEMINI_MODEL=gemini-3.7-flash,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_LOCATION=global" \
  --quiet

# --- 4. review UI ----------------------------------------------------------
# NEXT_PUBLIC_* is inlined at build time, so the publishable key is a build arg
# while the secret stays a runtime variable.
echo "==> building + deploying web"
CLERK_PK=$(grep -m1 '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=' web/.env.local | cut -d= -f2-)
CLERK_SK=$(grep -m1 '^CLERK_SECRET_KEY=' web/.env.local | cut -d= -f2-)
# Optional: without these the Docs export hides itself rather than erroring.
GOOG_ID=$(grep -m1 '^GOOGLE_OAUTH_CLIENT_ID=' web/.env.local | cut -d= -f2- || true)
GOOG_SECRET=$(grep -m1 '^GOOGLE_OAUTH_CLIENT_SECRET=' web/.env.local | cut -d= -f2- || true)
gcloud builds submit --project="$PROJECT" --region="$REGION" \
  --config=infra/cloudbuild.web.yaml \
  --substitutions=_TAG="$TAG",_CLERK_PK="$CLERK_PK" .
gcloud run deploy autonaly-web --project="$PROJECT" --region="$REGION" \
  --image="$REPO/web:$TAG" \
  --service-account="$WEB_SA" \
  --allow-unauthenticated \
  --memory=1Gi --cpu=1 --min-instances=0 --max-instances=4 \
  --set-env-vars="^|^AUTONALY_PROJECT_ID=$PROJECT|AUTONALY_ENGINE_URL=$ENGINE_URL|AUTONALY_AGENT_API_URL=$AGENT_URL|CLERK_SECRET_KEY=$CLERK_SK|GOOGLE_OAUTH_CLIENT_ID=$GOOG_ID|GOOGLE_OAUTH_CLIENT_SECRET=$GOOG_SECRET" \
  --quiet
WEB_URL=$(gcloud run services describe autonaly-web --project="$PROJECT" --region="$REGION" --format="value(status.url)")

# The UI calls the private agent API on the user's behalf.
gcloud run services add-iam-policy-binding autonaly-agent --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:$WEB_SA" --role=roles/run.invoker --quiet >/dev/null

echo
echo "engine: $ENGINE_URL"
echo "agent:  $AGENT_URL  (private)"
echo "web:    $WEB_URL"
