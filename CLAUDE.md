# CLAUDE.md - FleetClaim Project Guide

**This is an open-source public repository.** Never commit secrets, internal URLs, GCP project numbers, service account emails, or database names into this file or any tracked file.

**Keep this file up to date.** When you add, remove, or rename components, endpoints, models, services, or test files, update the relevant sections of this CLAUDE.md in the same commit.

## Project Overview

**FleetClaim** is a MyGeotab Add-In for automated vehicle incident evidence collection and reporting. It integrates with Geotab's telematics platform to generate PDF reports containing GPS trails, accelerometer data, photos, weather conditions, and vehicle diagnostics.

### Architecture

```
MyGeotab Portal (iframe)                    Geotab Drive App (mobile)
  └─ FleetClaim Add-In (React+TS, nginx)     └─ FleetClaim Drive Add-In (React+TS, nginx)
       │                                           │  offline: localStorage/IndexedDB
       ▼                                           │  online: → AddInData sync
  FleetClaim API (Cloud Run, .NET 10, Minimal APIs)│
  • PDF generation (QuestPDF)      • Session verification
  • Email reports (Gmail OAuth)     • Rate limiting (10/min PDF, 5/min email)
       │                                           │
       ├── Geotab API (AddInData, MediaFile, ExceptionEvents)
       ├── FleetClaim Worker (Cloud Run Job, .NET 10) — polls collisions, merges driver submissions
       └── GCP Services (Secret Manager, Artifact Registry, Cloud Build)
```

### Key Components

| Component | Path | Tech | Purpose |
|-----------|------|------|---------|
| **Add-In** | `src/FleetClaim.AddIn.React/` | React 18, TypeScript 5.5, Webpack 5, Zenith 1.15 | UI in MyGeotab iframe |
| **Drive Add-In** | `src/FleetClaim.DriveAddIn/` | React 18, TypeScript 5.5, Webpack 5, Zenith 1.15 | Mobile incident capture in Geotab Drive |
| **API** | `src/FleetClaim.Api/` | .NET 10, Minimal APIs | PDF generation, email, auth |
| **Worker** | `src/FleetClaim.Worker/` | .NET 10, Cloud Run Job | Feed-based collision polling, driver submission merging |
| **Core** | `src/FleetClaim.Core/` | .NET 10 Class Library | Models, Geotab integration, PDF renderer, services |
| **Admin** | `src/FleetClaim.Admin/` | .NET 10, Razor Pages | Admin portal |
| **Tests** | `src/FleetClaim.Tests/` | xUnit, Moq | 176 unit tests |

---

## Critical Rules

### Every Bug Fix Needs a Test

Before committing any bug fix: write a test that catches the bug, verify it fails without the fix, apply the fix, verify it passes. No exceptions.

### Every API Endpoint Must Be Authenticated

All endpoints in `src/FleetClaim.Api/Program.cs` (except `/health`) must call `VerifyCredentialsAsync` and reject unauthenticated requests. When adding a new endpoint, always include credential verification. Never expose an unauthenticated route that accesses Geotab data or performs actions.

### Never Commit Secrets

- **NEVER** hardcode passwords, API keys, or credentials
- Use `.secrets/` directories (gitignored) for local dev
- Use GCP Secret Manager for production

### Rebuild dist/ Before Committing Add-In Changes

The active pre-commit hook (`scripts/hooks/pre-commit`) checks that `dist/` is rebuilt when Add-In source files change. It does NOT run tests automatically.

```bash
cd src/FleetClaim.AddIn.React && NODE_OPTIONS="" npm run build
git add src/FleetClaim.AddIn.React/dist/
```

---

## Geotab Development Guidelines

### Use Zenith Design System

All Add-In UI must use [Geotab Zenith](https://developers.geotab.com/zenith-storybook/?path=/docs/introduction--docs) React components (`@geotab/zenith`). This ensures consistent look-and-feel with the MyGeotab portal. Never use raw HTML elements or third-party UI libraries when a Zenith component exists for the same purpose (buttons, modals, inputs, tables, tabs, toasts, etc.).

### Use generator-addin for Local Dev & Testing

The [generator-addin](https://github.com/Geotab/generator-addin) scaffolding tool enables local development with mocked Geotab API objects, so you can run and debug the Add-In without deploying to a test database. Use it to manually test UI changes and write web tests.

### Use Property Selectors for Device and User

Device and User objects are large. Always use `propertySelector` to request only the fields you need. This reduces payload size and server load significantly.

```typescript
// Add-In: only fetch id and name for device dropdowns
const devices = await call('Get', {
    typeName: 'Device',
    propertySelector: { fields: ['id', 'name'], isIncluded: true }
});
```

```csharp
// API: verify session with minimal User fields
await api.CallAsync<User[]>("Get", typeof(User), new {
    search = new { name = userName },
    propertySelector = new { fields = new[] { "id", "name" } }
});
```

### Respect MyGeotab Rate and Result Limits

The Geotab API has default result limits. When fetching large datasets, use paging with `resultsLimit` and `fromVersion`/`toVersion` (for `GetFeed`) or result offsets. Never assume all results fit in a single call.

### AddInData Storage Best Practices

Store data in Geotab's AddInData rather than managing a separate database. Key rules:

1. **Separate items, not lists** — Store each record as its own AddInData entry. The naive approach of storing arrays in a single record is problematic: to remove one item you must delete the entire record and re-add it. Separate entries allow individual CRUD.
2. **10KB per record** — Each AddInData record is limited to 10,000 characters. Compact large objects (see compaction strategy in `AddInDataRepository`).
3. **Static GUID as AddInId** — The AddInId must be a static, pre-generated GUID (not dynamic). This project uses `aji_jHQGE8k2TDodR8tZrpw` everywhere. The documentation doesn't make this obvious but it must be consistent across all components.
4. **Data merging on update** — `Set` merges properties, it doesn't replace the record. Old properties persist unless explicitly overwritten.

See [AddInData docs](https://developers.geotab.com/myGeotab/addIns/addInStorage/).

---

## File Structure

```
fleetclaim/
├── .github/workflows/          # CI (ci.yml) and deploy (deploy.yml)
├── .githooks/                  # Alternate hook (runs tests, not currently active)
├── docs/                       # Design docs, security audit, roadmap
├── infra/                      # Terraform (main.tf, variables.tf)
├── scripts/
│   └── hooks/pre-commit        # ACTIVE hook: checks dist/ is rebuilt
├── src/
│   ├── FleetClaim.AddIn.React/
│   │   └── app/
│   │       ├── components/     # 14 React components (App, ReportsTab, ReportDetailPage, etc.)
│   │       ├── contexts/       # GeotabContext (session, credentials, devices, users)
│   │       ├── hooks/          # useReports, useRequests, useToast
│   │       ├── services/       # reportService (CRUD, PDF, email), photoService (MediaFile upload)
│   │       ├── types/          # geotab.ts, report.ts
│   │       └── __tests__/      # 9 Jest test files
│   ├── FleetClaim.DriveAddIn/
│   │   ├── app/
│   │   │   ├── components/     # 10 components (DriveApp, SafetyScreen, wizard steps, etc.)
│   │   │   ├── contexts/       # DriveContext (api, mobile state, online status)
│   │   │   ├── hooks/          # useSubmission, useOnlineStatus, useCamera, useToast
│   │   │   ├── services/       # storageService (offline), syncService (AddInData sync)
│   │   │   ├── types/          # geotab.ts (Drive-extended), driverSubmission.ts, report.ts
│   │   │   └── __tests__/      # Jest test files
│   │   └── .dev/               # Dev mode with mock api.mobile
│   ├── FleetClaim.Api/
│   │   └── Program.cs          # Minimal API (517 lines): /health, /api/pdf, /api/email
│   ├── FleetClaim.Core/
│   │   ├── Models/             # IncidentReport, AddInDataWrapper, DriverSubmission, ReportRequest
│   │   ├── Geotab/             # AddInDataRepository, GcpCredentialStore, GeotabClientFactory
│   │   └── Services/           # QuestPdfRenderer (1800+ lines), ReportGenerator, IncidentCollector, etc.
│   ├── FleetClaim.Worker/
│   │   ├── Program.cs          # DI setup
│   │   └── IncidentPollerWorker.cs  # Feed polling, collision detection, driver submission merging
│   ├── FleetClaim.Admin/       # Razor Pages admin portal
│   └── FleetClaim.Tests/       # 11 test files, 176 tests
└── fleetclaim.sln              # Solution file (5 .NET projects)
```

---

## Geotab SDK Gotchas

### Server Hostname (Critical)

The Add-In runs in an iframe from Cloud Run. `window.location.hostname` returns the Cloud Run URL, **not** the Geotab server. Always get the server from `api.getSession()`:

```typescript
api.getSession((creds, server) => {
  const host = server || creds.server; // "my.geotab.com", "alpha.geotab.com", etc.
});
```

### Geotab API Constructor

The SDK expects hostname only, **not** a full URL:

```csharp
// Wrong: new API("user", "sessionId", null, "https://my.geotab.com");
// Right:
new API("user", "sessionId", null, "my.geotab.com");
```

### api.getSession() Signature (Critical)

The second parameter is `newSession` — a **BOOLEAN**, not an error callback. Passing a function (or any truthy value) as the second argument tells the framework to create a new session, which **triggers a login redirect loop** in Geotab Drive.

```typescript
// WRONG — function is truthy, interpreted as newSession=true → login redirect!
api.getSession((creds, server) => { ... }, (err) => { ... });

// RIGHT — only pass the success callback
api.getSession((creds, server) => {
  // creds.database, creds.userName, creds.sessionId
  // server: "my.geotab.com" or similar
});
```

Handle errors with try/catch around the `getSession()` call, not with a second callback argument.

### Credential Warmup

Credentials must be captured AFTER the first Geotab API call. Before warmup, `sessionId` may be empty. The GeotabContext handles this by calling `captureCredentials()` after API initialization.

### Federation Mismatch

Databases exist in specific federations (`my.geotab.com`, `alpha.geotab.com`, `gov.geotab.com`). Calling the wrong server returns 401 or federation errors. Always use the server from `api.getSession()`.

---

## API Endpoints & Authentication

### Endpoints

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|------------|---------|
| GET | `/health` | None | None | Health check |
| POST | `/api/pdf` | X-headers or body | 10/min | Generate PDF |
| GET | `/api/pdf/{database}/{reportId}` | X-headers | 10/min | Generate PDF by path |
| POST | `/api/email` | X-headers | 5/min | Email report |

### X-Header Authentication

All authenticated endpoints require these headers:

```
X-Geotab-Database: <database>
X-Geotab-UserName: <userName>
X-Geotab-SessionId: <sessionId>
X-Geotab-Server: <server>
```

The API verifies sessions by calling Geotab's `Get User` method with a `propertySelector` for efficiency.

### CORS

Allowed origins: `*.geotab.com`, `*.geotab.ca`, `localhost`, `*.run.app`

---

## Key Implementation Patterns

### AddInData Storage & 10KB Limit

Reports are stored in Geotab's AddInData as JSON via `AddInDataWrapper`:

```csharp
// Type-discriminated wrapper: type = "report" | "reportRequest" | "config" | "workerState" | "driverSubmission"
{ "type": "report", "payload": { /* IncidentReport */ } }
{ "type": "driverSubmission", "payload": { /* DriverSubmission */ } }
```

**Critical constraint:** AddInData has a **10KB limit per record**. The `AddInDataRepository` compacts reports before saving:
- GPS trail: max 20 points (sampled to include start, end, incident point)
- Hard events: max 5 before incident
- Accelerometer: max 5 around incident
- Diagnostics: max 10
- PdfBase64: never stored (generated on-demand)

### Photos via MediaFile

Photos are stored as Geotab MediaFile entities (not base64 in AddInData). Reports reference photos by MediaFile ID. The Add-In uploads via XMLHttpRequest FormData following Geotab's official pattern (see `photoService.ts`).

### JSON Serialization

```csharp
// camelCase with string enums
private static readonly JsonSerializerOptions SerializerOptions = new()
{
    PropertyNameCaseInsensitive = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
};
```

### Flexible Enum Handling

For enums that might have unknown values in stored data:

```csharp
[JsonPropertyName("category")]
public string? CategoryString { get; set; }

[JsonIgnore]
public PhotoCategory Category =>
    Enum.TryParse<PhotoCategory>(CategoryString, true, out var cat)
    ? cat : PhotoCategory.General;
```

### Worker: Feed-Based Collision Polling & Submission Merging

The Worker runs as a single-execution Cloud Run Job:
1. Loads database credentials from GCP Secret Manager
2. Uses Geotab `GetFeed` API for incremental ExceptionEvent polling
3. Filters to stock collision rule IDs: `RuleAccidentId`, `RuleEnhancedMajorCollisionId`, `RuleEnhancedMinorCollisionId`
4. Generates reports via `ReportGenerator` → compacts → saves to AddInData
5. Processes manual `ReportRequest`s (marks stale ones as failed after 10 min)
6. **Merges driver submissions** — matches `DriverSubmission` to auto-reports by `DeviceId` + `OccurredAt` within 30 minutes, fills empty fields, appends photos/notes. Submissions unmatched after 24h become standalone reports.
7. Saves feed version to AddInData for next poll

### Drive Add-In: Offline-First Storage

The Drive Add-In uses two-tier offline storage:
- **localStorage** — submission metadata (`fleetclaim_drive_submissions` index, `fleetclaim_drive_sub_<id>` per record)
- **IndexedDB** — photo binary data (`fleetclaim_drive` database, `photos` object store)

Photos are resized to max 1920px via canvas before storage. On reconnect, `syncService` uploads photos as Geotab MediaFile entities, then saves the submission to AddInData as `type: "driverSubmission"`.

---

## Testing

### Run Tests

```bash
# .NET tests (176 tests)
dotnet test

# Add-In tests (requires jest-environment-jsdom)
cd src/FleetClaim.AddIn.React && npm test

# Drive Add-In tests
cd src/FleetClaim.DriveAddIn && npm test
```

### Test Files (.NET)

| File | Coverage |
|------|----------|
| ApiAuthenticationTests | X-header validation |
| ApiEndpointTests | Endpoint integration |
| ModelTests | Serialization, enum handling |
| QuestPdfRendererTests | PDF generation |
| AddInDataRepositoryTests | AddInData CRUD, compaction |
| ReportGeneratorTests | Report data collection |
| IncidentCollectorTests | GPS, diagnostics, weather |
| NotificationServiceTests | Email/webhook |
| OpenMeteoWeatherServiceTests | Weather API |
| ShareLinkServiceTests | Secure share links |
| DriverSubmissionMergeTests | Worker merge logic (15 tests) |

---

## Deployment

### Automatic (GitHub Actions)

Pushes to `main` trigger conditional deploys via `dorny/paths-filter@v3`:
- `src/FleetClaim.Api/**` or `src/FleetClaim.Core/**` → Deploy API
- `src/FleetClaim.AddIn.React/**` → Deploy Add-In
- `src/FleetClaim.DriveAddIn/**` → Deploy Drive Add-In
- `src/FleetClaim.Worker/**` or `src/FleetClaim.Core/**` → Deploy Worker
- `src/FleetClaim.Admin/**` → Deploy Admin

Authentication: GCP Workload Identity Federation

### Manual Deploy

```bash
gcloud builds submit --config=cloudbuild-api.yaml
gcloud builds submit --config=cloudbuild-addin.yaml
gcloud builds submit --config=cloudbuild-drive.yaml
gcloud builds submit --config=cloudbuild-worker.yaml
```

### Docker Images

- API/Worker: multi-stage `mcr.microsoft.com/dotnet/sdk:10.0` → `aspnet:10.0`
- Add-In / Drive Add-In: `nginx:alpine` serving static build from `dist/`
- Registry: GCP Artifact Registry (`us-central1-docker.pkg.dev`)

---

## Environment

| Resource | Value |
|----------|-------|
| GCP Project | `fleetclaim` |
| Region | `us-central1` |
| API URL | `https://fleetclaim-api-<project-number>.us-central1.run.app` |
| Add-In URL | `https://fleetclaim-addin-react-<project-number>.us-central1.run.app` |
| Drive Add-In URL | `https://fleetclaim-drive-addin-<project-number>.us-central1.run.app` |
| Add-In Solution ID | `aji_jHQGE8k2TDodR8tZrpw` |
| Demo Database | See `.secrets/` for database and server details |

### Key Environment Variables

**API**: `GCP_PROJECT_ID`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GOOGLE_MAPS_API_KEY` (optional)

**Worker**: `GCP_PROJECT_ID`, `SHARE_LINK_BASE_URL`, `SHARE_LINK_SIGNING_KEY`

---

## Add-In Component Map (MyGeotab)

| Component | Purpose |
|-----------|---------|
| App | Root: tabbed interface (Reports, Requests, Settings, About) |
| ReportsTab | Report list with filters (search, severity, date range, vehicle) |
| ReportDetailPage | Full-page report view with edit capabilities, merge provenance banner |
| ReportDetailModal | Quick-view modal for report preview |
| RequestsTab | Manual report request management |
| NewRequestModal | Form to create new report requests |
| SettingsTab | Configuration UI |
| AboutTab | Add-In info and description |
| PhotosSection | Photo upload/download via MediaFile |
| GpsMap | GPS trail visualization (Leaflet) |
| DamageAssessmentForm | Damage details input |
| ThirdPartyInfoForm | Other-party information |
| ToastContainer | Toast notification system |

## Drive Add-In Component Map (Geotab Drive)

| Component | Purpose |
|-----------|---------|
| DriveApp | Root: wizard flow controller with step navigation and progress indicator |
| SafetyScreen | Safety-first screen with 911 call button, entry to wizard or past submissions |
| IncidentBasicsStep | Auto-populated vehicle/driver/location, description, severity |
| DamageAssessmentStep | Single-column damage level, driveability, description, cost estimate |
| PhotoCaptureStep | Camera integration via `api.mobile.camera`, category selection, photo grid |
| ThirdPartyStep | Other driver/vehicle info, police report, injuries, witnesses |
| ReviewSubmitStep | Summary review, online submit or offline save-for-later |
| SubmissionsList | Past/pending submissions with status, resume draft, delete |
| SyncStatusBanner | Online/offline indicator with pending sync count |
| ToastContainer | Mobile-adapted toast notifications |

---

## Commit Message Prefixes

`feat:` `fix:` `test:` `chore:` `docs:` `perf:`

## Known Warnings (Safe to Ignore)

1. **NU1510** - System.Text.Json unnecessary package warning
2. **SkiaSharp** - Obsolete API usage in QuestPdfRenderer (cosmetic)
