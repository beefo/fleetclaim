# CLAUDE.md - FleetClaim Project Guide

This file provides context for AI agents working in the FleetClaim codebase.

## Project Overview

**FleetClaim** is a MyGeotab Add-In for automated vehicle incident evidence collection and reporting. It integrates with Geotab's telematics platform to generate PDF reports containing GPS trails, accelerometer data, photos, weather conditions, and vehicle diagnostics.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MyGeotab Portal                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  FleetClaim Add-In (iframe)               │  │
│  │                    React + TypeScript                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FleetClaim API (Cloud Run)                   │
│                         .NET 10                                  │
│  • PDF Generation (QuestPDF)                                    │
│  • Session Verification                                          │
│  • Report Management                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────────┐  ┌──────────┐
        │  Geotab  │   │ FleetClaim   │  │  GCP     │
        │   API    │   │   Worker     │  │ Services │
        └──────────┘   │ (Cloud Run)  │  │          │
                       └──────────────┘  └──────────┘
```

### Key Components

| Component | Path | Tech | Purpose |
|-----------|------|------|---------|
| **Add-In** | `src/FleetClaim.AddIn.React/` | React, TypeScript, Webpack | UI in MyGeotab iframe |
| **API** | `src/FleetClaim.Api/` | .NET 10, Minimal APIs | PDF generation, auth |
| **Worker** | `src/FleetClaim.Worker/` | .NET 10, Background Service | Async report generation |
| **Core** | `src/FleetClaim.Core/` | .NET 10 Class Library | Shared business logic |
| **Admin** | `src/FleetClaim.Admin/` | .NET 10, Razor | Admin portal |
| **Tests** | `src/FleetClaim.Tests/` | xUnit | Unit tests |

---

## Critical Rules

### 🔴 Rule 0: Every Bug Fix Needs a Test

**Before committing any bug fix:**
1. Write a test that would have caught the bug
2. Verify the test fails without the fix
3. Apply the fix
4. Verify the test passes

This prevents regressions. No exceptions.

### 🔴 Rule 1: Never Commit Secrets

- **NEVER** hardcode passwords, API keys, or credentials
- Use `.secrets/` directories (gitignored) for local dev
- Use GCP Secret Manager for production
- Run `grep -r "password\|secret\|apikey" --include="*.cs" --include="*.ts"` before committing

### 🔴 Rule 2: Tests Must Pass Before Deploy

The pre-commit hook runs:
1. .NET tests (113+ tests)
2. Add-In Jest tests (101+ tests)

If tests fail, the commit is rejected.

---

## Geotab SDK Gotchas

### Server Hostname

The Add-In runs in an iframe from Cloud Run. `window.location.hostname` returns the Cloud Run URL, **not** the Geotab server.

**Wrong:**
```typescript
const server = window.location.hostname; // Returns Cloud Run URL!
```

**Right:**
```typescript
// Get server from api.getSession() callback
api.getSession((creds, server) => {
  const host = server || creds.server; // e.g., "my.geotab.com" or "alpha.geotab.com"
});
```

### Geotab API Constructor

The SDK expects hostname only, **not** a full URL:

**Wrong:**
```csharp
new API("username", "sessionId", "password", "https://my.geotab.com"); // NO!
```

**Right:**
```csharp
new API("username", "sessionId", null, "my.geotab.com"); // Just hostname
```

### api.getSession() Signature

```typescript
// getSession(callback, newSession?)
// - callback: (credentials, server?) => void
// - newSession: BOOLEAN (not an error callback!)
api.getSession((creds, server) => {
  // creds.database, creds.userName, creds.sessionId
  // server: "my.geotab.com" or similar
});
```

### Federation Mismatch

Databases exist in specific federations:
- `my.geotab.com` - Production
- `alpha.geotab.com` - Alpha/staging (e.g., `g560` database)
- `gov.geotab.com` - Government

Calling the wrong server returns **401** or federation errors. Always use the server from `api.getSession()`.

---

## API Authentication

All API endpoints require X-header authentication:

```
X-Geotab-Database: demo_fleetclaim
X-Geotab-UserName: user@example.com
X-Geotab-SessionId: abc123...
X-Geotab-Server: my.geotab.com
```

The API validates sessions by calling Geotab's `Get User` method with a `propertySelector` for efficiency.

---

## Common Patterns

### JSON Serialization (AddInDataWrapper)

Reports are stored in Geotab's AddInData as JSON. The `AddInDataWrapper` handles serialization:

```csharp
// Uses camelCase and JsonStringEnumConverter
private static readonly JsonSerializerOptions SerializerOptions = new()
{
    PropertyNameCaseInsensitive = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
};
```

**Gotcha:** Enum values must be strings in JSON. Unknown enum values should default gracefully (see `PhotoCategory` pattern).

### Flexible Enum Handling

For enums that might have unknown values in stored data:

```csharp
// Store as string, parse on access
[JsonPropertyName("category")]
public string? CategoryString { get; set; }

[JsonIgnore]
public PhotoCategory Category => 
    Enum.TryParse<PhotoCategory>(CategoryString, true, out var cat) 
    ? cat : PhotoCategory.General;
```

---

## Deployment

### Automatic (GitHub Actions)

Pushes to `main` trigger conditional deploys:
- Changes in `src/FleetClaim.Api/` or `src/FleetClaim.Core/` → Deploy API
- Changes in `src/FleetClaim.AddIn.React/` → Deploy Add-In
- Changes in `src/FleetClaim.Worker/` → Deploy Worker
- Changes in `src/FleetClaim.Admin/` → Deploy Admin

### Manual Deploy

```bash
# Deploy specific component
gcloud builds submit --config=cloudbuild-api.yaml
gcloud builds submit --config=cloudbuild-addin.yaml
```

### Verify Deployment

```bash
# Check latest revision
gcloud run revisions list --service fleetclaim-api --region us-central1 --limit 3

# Check logs
gcloud run services logs read fleetclaim-api --region us-central1 --limit 50
```

---

## Testing

### Run Tests Locally

```bash
# .NET tests
dotnet test

# Add-In tests
cd src/FleetClaim.AddIn.React
npm test
```

### Test Coverage Areas

- **ApiAuthenticationTests** - X-header validation
- **ModelTests** - Serialization, enum handling
- **QuestPdfRendererTests** - PDF generation
- **AddInDataRepositoryTests** - Geotab data operations

---

## Environment

| Resource | Value |
|----------|-------|
| GCP Project | `fleetclaim` |
| Region | `us-central1` |
| API URL | `https://fleetclaim-api-589116575765.us-central1.run.app` |
| Add-In Solution ID | `aji_jHQGE8k2TDodR8tZrpw` |
| Demo Database | `demo_fleetclaim` on `my.geotab.com` |

---

## Known Issues / Tech Debt

1. **SkiaSharp warnings** - Obsolete API usage in QuestPdfRenderer (cosmetic, works fine)
2. **System.Text.Json warning** - NU1510 about unnecessary package (can ignore)
3. **GPS Map path** - Leaflet integration works in PDF but needs verification in Add-In

---

## File Structure Conventions

```
src/
├── FleetClaim.AddIn.React/
│   └── app/
│       ├── components/     # React components
│       ├── contexts/       # React contexts (GeotabContext)
│       ├── hooks/          # Custom hooks
│       ├── services/       # API services
│       ├── types/          # TypeScript types
│       └── __tests__/      # Jest tests
├── FleetClaim.Api/
│   └── Program.cs          # Minimal API endpoints
├── FleetClaim.Core/
│   ├── Models/             # Shared models (IncidentReport, etc.)
│   ├── Geotab/             # Geotab integration
│   └── Services/           # Business logic
└── FleetClaim.Tests/       # xUnit tests
```

---

## Quick Reference

### Commit Message Prefixes

- `feat:` - New feature
- `fix:` - Bug fix
- `test:` - Adding/updating tests
- `chore:` - Maintenance, cleanup
- `docs:` - Documentation
- `perf:` - Performance improvement
- `debug:` - Temporary debugging (remove before merge)

### Useful Commands

```bash
# Check for secrets before committing
grep -rn "password\|secret\|apikey" src/ --include="*.cs" --include="*.ts" --include="*.tsx"

# Find usages
grep -rn "searchTerm" src/ --include="*.cs"

# Check API logs
gcloud run services logs read fleetclaim-api --region us-central1 --limit 50

# View recent deploys
gcloud run revisions list --service fleetclaim-api --region us-central1 --limit 5
```
