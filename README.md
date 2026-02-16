# FleetClaim

Automated incident evidence packaging for Geotab fleets. Generates professional PDF reports with GPS trails, speed analysis, diagnostics, and weather data for insurance claims and fleet management.

## Features

- **Automatic Incident Detection**: Polls Geotab for ExceptionEvents (harsh braking, collisions, speeding)
- **Evidence Packaging**: Collects GPS trail, speed data, diagnostics, and weather conditions
- **Professional PDF Reports**: Generated using QuestPDF with customizable branding
- **Shareable Links**: Stateless web viewer for reports without Geotab login
- **Notifications**: Email (SendGrid/SMTP) and webhook support
- **Multi-tenant**: Supports multiple Geotab databases from a single deployment

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Customer's Geotab                        │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ExceptionEvent│  │ LogRecord  │  │      AddInData       │  │
│  │ (incidents)  │  │  (GPS)     │  │ (reports + config)   │  │
│  └──────┬───────┘  └─────┬──────┘  └──────────┬───────────┘  │
└─────────┼────────────────┼────────────────────┼──────────────┘
          │                │                    ▲
          ▼                ▼                    │
┌─────────────────────────────────────────────────────────────┐
│                  FleetClaim Worker (GCP)                     │
│  Cloud Run Job - Scheduled every 5 minutes                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Incident   │  │   Report    │  │    Notification     │  │
│  │   Poller    │──▶│  Generator  │──▶│     Service         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  FleetClaim API (GCP)                        │
│  Cloud Run Service - Public share links                      │
│  GET /r/{token} - Renders HTML report                        │
│  GET /r/{token}/pdf - Downloads PDF                          │
└─────────────────────────────────────────────────────────────┘
```

## Components

| Project | Description |
|---------|-------------|
| `FleetClaim.Core` | Shared models, services, Geotab integration |
| `FleetClaim.Worker` | Background job for polling and report generation |
| `FleetClaim.Api` | Web API for shareable report links |
| `FleetClaim.Tests` | Unit tests |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | .NET 8 |
| PDF Generation | QuestPDF |
| Email | SendGrid / SMTP |
| Weather | Open-Meteo (free API) |
| Maps | Google Static Maps (optional) |
| Hosting | GCP Cloud Run |
| Secrets | GCP Secret Manager |
| Scheduling | GCP Cloud Scheduler |

## Quick Start

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
- A GCP project with billing enabled

### Build

```bash
# Clone and build
cd fleetclaim
dotnet restore
dotnet build
dotnet test
```

### Deploy to GCP

```bash
# Quick deployment using shell script
cd infra
./deploy.sh your-project-id us-central1

# Or using Terraform
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings
terraform init
terraform apply
```

### Configure Geotab Credentials

For each customer database, create a secret in Secret Manager:

```bash
# Create credentials file
cat > creds.json << EOF
{
  "database": "customer_db_name",
  "userName": "fleetclaim-integration@company.com",
  "password": "your-password",
  "server": "my.geotab.com"
}
EOF

# Create secret
gcloud secrets create fleetclaim-creds-customer_db_name \
    --data-file=creds.json \
    --project=your-project-id

# Grant access to service account
gcloud secrets add-iam-policy-binding fleetclaim-creds-customer_db_name \
    --member="serviceAccount:fleetclaim@your-project-id.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Clean up
rm creds.json
```

### Customer Configuration

Customers configure FleetClaim through AddInData in their Geotab database:

```json
{
  "addInId": "fleetClaim",
  "data": {
    "type": "config",
    "notifyEmails": ["safety@company.com", "fleet@company.com"],
    "notifyWebhook": "https://your-webhook.com/fleetclaim",
    "severityThreshold": "medium",
    "autoGenerateRules": ["HarshBraking", "Collision", "Speeding"]
  }
}
```

## Configuration

### Worker Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GCP_PROJECT_ID` | Yes | GCP project ID for Secret Manager |
| `SHARE_LINK_SIGNING_KEY` | Yes | Secret key for signing share link tokens |
| `SHARE_LINK_BASE_URL` | Yes | Base URL for share links (API URL) |
| `PDF_COMPANY_NAME` | No | Company name in PDF header (default: FleetClaim) |
| `GOOGLE_MAPS_API_KEY` | No | For static map images in PDFs |
| `USE_SENDGRID` | No | Set to "true" to use SendGrid for email |
| `SENDGRID_API_KEY` | No | SendGrid API key |
| `SMTP_HOST` | No | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USE_SSL` | No | Use SSL for SMTP (default: true) |
| `SMTP_USERNAME` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `FROM_EMAIL` | No | From email address (default: noreply@fleetclaim.app) |
| `FROM_NAME` | No | From name (default: FleetClaim) |

### API Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GCP_PROJECT_ID` | Yes | GCP project ID for Secret Manager |
| `SHARE_LINK_SIGNING_KEY` | Yes | Must match worker's signing key |

## Local Development

```bash
# Set up local secrets (for testing without GCP)
export GCP_PROJECT_ID=your-dev-project
export SHARE_LINK_SIGNING_KEY=dev-secret-key
export SHARE_LINK_BASE_URL=http://localhost:5001

# Run API
cd src/FleetClaim.Api
dotnet run

# Run Worker (in another terminal)
cd src/FleetClaim.Worker
dotnet run
```

## Data Flow

### Automatic Processing (Normal Flow)

1. Worker polls Geotab ExceptionEvents via GetFeed
2. New incident detected → collect evidence (GPS, diagnostics, weather)
3. Generate PDF report with QuestPDF
4. Save report to customer's AddInData
5. Send email/webhook notifications
6. Report visible in MyGeotab Add-In

### Manual Request (On-Demand)

1. User clicks "Request Report" in MyGeotab Add-In
2. Add-In writes ReportRequest to AddInData
3. Worker picks up request on next poll
4. Generates report → saves to AddInData
5. Add-In shows report on refresh

## AddInData Schema

### Report

```json
{
  "type": "report",
  "payload": {
    "id": "rpt_abc123",
    "incidentId": "ExceptionEvent-xyz",
    "vehicleId": "b123",
    "vehicleName": "Truck 42",
    "driverId": "d456",
    "driverName": "John Smith",
    "occurredAt": "2024-02-15T14:32:00Z",
    "generatedAt": "2024-02-15T14:35:00Z",
    "severity": "high",
    "summary": "Hard braking event involving Truck 42 at 85 km/h (Rain conditions)",
    "evidence": {
      "gpsTrail": [...],
      "maxSpeedKmh": 105,
      "speedAtEventKmh": 45,
      "decelerationMps2": -8.2,
      "weatherCondition": "Rain",
      "temperatureCelsius": 15,
      "diagnostics": [...]
    },
    "pdfBase64": "...",
    "shareUrl": "https://fleetclaim.app/r/abc123"
  }
}
```

### Report Request

```json
{
  "type": "reportRequest",
  "payload": {
    "id": "req_xyz789",
    "incidentId": "ExceptionEvent-xyz",
    "requestedBy": "user@company.com",
    "requestedAt": "2024-02-15T15:00:00Z",
    "status": "pending"
  }
}
```

### Customer Config

```json
{
  "type": "config",
  "payload": {
    "notifyEmails": ["safety@company.com"],
    "notifyWebhook": "https://...",
    "severityThreshold": "medium",
    "autoGenerateRules": ["HarshBraking", "Collision", "Speeding"]
  }
}
```

## Security

- **Credential Isolation**: Each customer's Geotab credentials are stored in separate secrets
- **Signed Share Links**: Share URLs contain HMAC-signed tokens that prevent tampering
- **Stateless API**: Share link API fetches fresh data from Geotab on each request
- **Short-lived Cache**: 5-minute cache to reduce API load, not for persistence
- **No Cross-tenant Access**: Worker processes each database in isolation

## License

QuestPDF is used under the Community License. See [QuestPDF License](https://www.questpdf.com/license.html) for details.
