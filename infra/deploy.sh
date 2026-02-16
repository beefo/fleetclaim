#!/bin/bash
set -euo pipefail

# FleetClaim Deployment Script
# Usage: ./deploy.sh <project-id> [region]

if [ $# -lt 1 ]; then
    echo "Usage: $0 <project-id> [region]"
    echo "Example: $0 my-gcp-project us-central1"
    exit 1
fi

PROJECT_ID="$1"
REGION="${2:-us-central1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== FleetClaim Deployment ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    secretmanager.googleapis.com \
    cloudscheduler.googleapis.com \
    cloudbuild.googleapis.com \
    --project="$PROJECT_ID"

# Build and push Docker images
echo ""
echo "Building Docker images..."

WORKER_IMAGE="gcr.io/$PROJECT_ID/fleetclaim-worker:latest"
API_IMAGE="gcr.io/$PROJECT_ID/fleetclaim-api:latest"

# Build worker
echo "Building worker image..."
cd "$REPO_ROOT"
gcloud builds submit \
    --project="$PROJECT_ID" \
    --tag="$WORKER_IMAGE" \
    --file=src/FleetClaim.Worker/Dockerfile \
    .

# Build API
echo "Building API image..."
gcloud builds submit \
    --project="$PROJECT_ID" \
    --tag="$API_IMAGE" \
    --file=src/FleetClaim.Api/Dockerfile \
    .

# Generate signing key if not exists
SIGNING_KEY_SECRET="fleetclaim-share-link-signing-key"
if ! gcloud secrets describe "$SIGNING_KEY_SECRET" --project="$PROJECT_ID" &>/dev/null; then
    echo ""
    echo "Creating share link signing key secret..."
    SIGNING_KEY=$(openssl rand -base64 32)
    echo -n "$SIGNING_KEY" | gcloud secrets create "$SIGNING_KEY_SECRET" \
        --project="$PROJECT_ID" \
        --data-file=-
else
    echo "Signing key secret already exists."
fi

# Create service account
SA_NAME="fleetclaim"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
    echo ""
    echo "Creating service account..."
    gcloud iam service-accounts create "$SA_NAME" \
        --project="$PROJECT_ID" \
        --display-name="FleetClaim Service Account"
fi

# Grant secret access
echo ""
echo "Granting secret access..."
gcloud secrets add-iam-policy-binding "$SIGNING_KEY_SECRET" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet

# Deploy worker job
echo ""
echo "Deploying worker job..."
gcloud run jobs create fleetclaim-worker \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$WORKER_IMAGE" \
    --service-account="$SA_EMAIL" \
    --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID" \
    --set-secrets="SHARE_LINK_SIGNING_KEY=$SIGNING_KEY_SECRET:latest" \
    --memory=512Mi \
    --cpu=1 \
    --task-timeout=300s \
    --max-retries=1 \
    2>/dev/null || \
gcloud run jobs update fleetclaim-worker \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$WORKER_IMAGE" \
    --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID" \
    --set-secrets="SHARE_LINK_SIGNING_KEY=$SIGNING_KEY_SECRET:latest" \
    --memory=512Mi \
    --cpu=1 \
    --task-timeout=300s \
    --max-retries=1

# Deploy API service
echo ""
echo "Deploying API service..."
gcloud run deploy fleetclaim-api \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$API_IMAGE" \
    --service-account="$SA_EMAIL" \
    --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID" \
    --set-secrets="SHARE_LINK_SIGNING_KEY=$SIGNING_KEY_SECRET:latest" \
    --memory=256Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --allow-unauthenticated

API_URL=$(gcloud run services describe fleetclaim-api \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format="value(status.url)")

# Update worker with share link base URL
echo ""
echo "Updating worker with API URL..."
gcloud run jobs update fleetclaim-worker \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,SHARE_LINK_BASE_URL=$API_URL"

# Create scheduler job
echo ""
echo "Creating Cloud Scheduler job..."
SCHEDULER_SA="$SA_EMAIL"

gcloud scheduler jobs create http fleetclaim-worker-trigger \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/fleetclaim-worker:run" \
    --http-method=POST \
    --oauth-service-account-email="$SCHEDULER_SA" \
    --time-zone="UTC" \
    2>/dev/null || \
gcloud scheduler jobs update http fleetclaim-worker-trigger \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/fleetclaim-worker:run" \
    --http-method=POST \
    --oauth-service-account-email="$SCHEDULER_SA" \
    --time-zone="UTC"

# Grant scheduler permission to invoke worker
gcloud run jobs add-iam-policy-binding fleetclaim-worker \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --member="serviceAccount:$SCHEDULER_SA" \
    --role="roles/run.invoker" \
    --quiet

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "API URL: $API_URL"
echo "Worker Job: fleetclaim-worker"
echo "Scheduler: fleetclaim-worker-trigger (runs every 5 minutes)"
echo ""
echo "Next steps:"
echo "1. Add Geotab credentials to Secret Manager:"
echo "   gcloud secrets create fleetclaim-creds-<database> --data-file=creds.json"
echo ""
echo "2. Grant secret access to service account:"
echo "   gcloud secrets add-iam-policy-binding fleetclaim-creds-<database> \\"
echo "       --member=\"serviceAccount:$SA_EMAIL\" \\"
echo "       --role=\"roles/secretmanager.secretAccessor\""
echo ""
echo "3. (Optional) Add SendGrid API key for email notifications:"
echo "   gcloud secrets create fleetclaim-sendgrid-api-key --data-file=-"
echo "   Then update worker with USE_SENDGRID=true and the secret."
