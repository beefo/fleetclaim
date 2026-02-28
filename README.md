# FleetClaim

Automated incident evidence packaging for Geotab fleets. Generates professional PDF reports with GPS trails, speed analysis, diagnostics, and weather data for insurance claims and fleet management.

## Features

- **MyGeotab Add-In**: React-based Add-In built with Geotab Zenith design system
- **Automatic Incident Detection**: Polls Geotab for ExceptionEvents (harsh braking, collisions, speeding)
- **Evidence Packaging**: Collects GPS trail, speed data, diagnostics, and weather conditions
- **Photo Evidence**: Upload and attach photos to reports via Geotab MediaFile API
- **Professional PDF Reports**: Generated using QuestPDF with customizable branding
- **Email Sharing**: Send reports via email with PDF attachments
- **Notifications**: Email (Gmail OAuth) and webhook support
- **Multi-tenant**: Supports multiple Geotab databases from a single deployment

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Customer's MyGeotab                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              FleetClaim Add-In (React)                  │  │
│  │   - View/manage incident reports                        │  │
│  │   - Upload photo evidence                               │  │
│  │   - Request on-demand reports                           │  │
│  │   - Download PDFs, send emails                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                                │
│  ┌──────────────┐  ┌────────┴───────┐  ┌────────────────┐   │
│  │ExceptionEvent│  │   AddInData    │  │   MediaFile    │   │
│  │ (incidents)  │  │(reports/config)│  │ (photo storage)│   │
│  └──────┬───────┘  └───────┬────────┘  └───────┬────────┘   │
└─────────┼──────────────────┼───────────────────┼────────────┘
          │                  │                   │
          ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                  FleetClaim API (GCP Cloud Run)              │
│  - POST /api/pdf - Generate PDF with user credentials        │
│  - POST /api/email - Send report via email                   │
│  - GET /api/pdf/{db}/{id} - Service account PDF download     │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                  FleetClaim Worker (GCP Cloud Run Job)       │
│  - Scheduled polling for new incidents                       │
│  - Automatic report generation                               │
│  - Process on-demand report requests                         │
└─────────────────────────────────────────────────────────────┘
```

## Components

| Project | Description |
|---------|-------------|
| `FleetClaim.AddIn.React` | MyGeotab Add-In (React + Zenith) |
| `FleetClaim.Core` | Shared models, services, Geotab integration |
| `FleetClaim.Worker` | Background job for polling and report generation |
| `FleetClaim.Api` | Web API for PDF generation and email |
| `FleetClaim.Admin` | Admin dashboard (optional) |
| `FleetClaim.Tests` | Unit tests |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Add-In Frontend | React 18, TypeScript, Geotab Zenith |
| Runtime | .NET 8 |
| PDF Generation | QuestPDF |
| Email | Gmail OAuth2 |
| Weather | Open-Meteo (free API) |
| Maps | Google Static Maps (optional) |
| Hosting | GCP Cloud Run |
| Secrets | GCP Secret Manager |
| CI/CD | GitHub Actions (conditional deploys) |

## Quick Start

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/) (for Add-In development)
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
- A GCP project with billing enabled

### Build

```bash
# Clone and build
cd fleetclaim
dotnet restore
dotnet build
dotnet test

# Build Add-In
cd src/FleetClaim.AddIn.React
npm install
npm run build
npm test
```

### Local Add-In Development

```bash
cd src/FleetClaim.AddIn.React
npm run dev
```

Then configure your MyGeotab Add-In to point to `http://localhost:9000`.

### Deploy to GCP

The project uses GitHub Actions with conditional deployments - only changed components are deployed:

```bash
# Push to main triggers CI/CD
git push origin main

# Or manually trigger specific components via GitHub Actions
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

# Clean up
rm creds.json
```

## Add-In Features

### Reports Tab
- View all incident reports with filtering (severity, date range, vehicle)
- Date filter defaults to "Last 30 days"
- Click any report to view details, photos, and damage assessment
- Download PDF or send via email

### Requests Tab
- Submit on-demand report requests for specific vehicles/time ranges
- Track request status (pending, processing, completed, failed)
- "Force Report" option to generate reports even without detected incidents

### Settings Tab
- Configure notification preferences
- Set severity thresholds
- Manage webhook integrations

## API Endpoints

See [docs/API.md](docs/API.md) for full API documentation.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Health check |
| `POST /api/pdf` | X-Geotab-* headers | Generate PDF with user session |
| `GET /api/pdf/{db}/{id}` | Query param | PDF via service account |
| `POST /api/email` | X-Geotab-* headers | Send report via email |

## Configuration

### API Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GCP_PROJECT_ID` | Yes | GCP project ID for Secret Manager |
| `GMAIL_CLIENT_ID` | No | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | No | Gmail OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | No | Gmail OAuth refresh token |
| `GMAIL_FROM_EMAIL` | No | From email address |
| `PDF_COMPANY_NAME` | No | Company name in PDF header |
| `GOOGLE_MAPS_API_KEY` | No | For static map images in PDFs |

### Worker Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GCP_PROJECT_ID` | Yes | GCP project ID for Secret Manager |
| `POLL_INTERVAL_MINUTES` | No | Polling interval (default: 5) |

## GitHub Actions

The project uses conditional deployments via `dorny/paths-filter`:

- **API changes** (`src/FleetClaim.Api/**`, `src/FleetClaim.Core/**`) → Deploy API
- **Add-In changes** (`src/FleetClaim.AddIn.React/**`) → Deploy Add-In
- **Worker changes** (`src/FleetClaim.Worker/**`, `src/FleetClaim.Core/**`) → Deploy Worker
- **Admin changes** (`src/FleetClaim.Admin/**`) → Deploy Admin

Tests must pass before any deployment.

## Security

- **Session-based Auth**: API endpoints verify user credentials via Geotab GetSystemTime call
- **X-Header Authentication**: Credentials passed via `X-Geotab-Database`, `X-Geotab-UserName`, `X-Geotab-SessionId`
- **Credential Isolation**: Each customer's Geotab credentials stored in separate secrets
- **Rate Limiting**: PDF (10/min) and email (5/min) endpoints are rate limited
- **CORS Restricted**: Only allows requests from `*.geotab.com`, `*.geotab.ca`, and Cloud Run domains

## Testing

```bash
# Run .NET tests
dotnet test

# Run Add-In tests (97 tests)
cd src/FleetClaim.AddIn.React
npm test
```

## License

QuestPDF is used under the Community License. See [QuestPDF License](https://www.questpdf.com/license.html) for details.
