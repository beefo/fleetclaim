# FleetClaim Product Roadmap

**Purpose:** Structured task list for development iteration.  
**Last Updated:** 2026-02-28

---

## Current Status

FleetClaim is feature-complete for MVP. The React Add-In is deployed and functional with:
- ✅ Report viewing, filtering, and management
- ✅ Photo upload via MediaFile API
- ✅ PDF generation and download
- ✅ Email sending
- ✅ On-demand report requests
- ✅ Mobile-responsive UI with Zenith components
- ✅ Conditional CI/CD pipeline

---

## Recently Completed (Feb 2026)

### React Add-In Migration
- [x] **Migrated from vanilla JS to React + TypeScript**
  - Geotab Zenith design system components
  - Proper state management with React hooks
  - 97 unit tests with Jest

### Photo Evidence
- [x] **Photo upload capability**
  - Upload photos to Geotab MediaFile API
  - Organize by category (damage, scene, other)
  - Display thumbnails with credential-authenticated URLs
  - Photos embedded in PDF reports

### Authentication & Session
- [x] **Fixed api.getSession() integration**
  - Proper credential capture after session warmup
  - Retry logic for failed captures
  - Credentials used for MediaFile uploads and API calls

### CI/CD Improvements
- [x] **Conditional deployments**
  - Uses `dorny/paths-filter` to detect changed components
  - Only deploys affected services (API, Add-In, Worker, Admin)
  - Tests must pass before any deployment
  - Manual workflow dispatch for selective deploys

### UX Improvements
- [x] **Mobile date filter visibility**
  - Date range filter shows inline on mobile
  - Default changed from 7 days to 30 days
- [x] **Request refresh after submission**
  - Requests tab refreshes automatically after creating new request
- [x] **Correct user identity**
  - "Requested By" shows email from credentials, not short username

---

## P1 - High Priority (Next)

- [ ] **Batch report export**
  - Select multiple reports, download as ZIP
  - Combined PDF option

- [ ] **Enhanced PDF with photos**
  - Include uploaded photos in generated PDFs
  - Layout optimization for multiple photos

- [ ] **Add integration tests**
  - E2E test for full request → report → PDF flow
  - Mock Geotab API for CI

---

## P2 - Medium Priority

- [ ] **Insurance company portal**
  - Dedicated read-only view for adjusters
  - Access via share link with extended permissions

- [ ] **Dashcam video integration**
  - Link to external video URLs
  - Embed video player in report

- [ ] **Report expiry/retention policy**
  - Auto-archive after X days
  - Configurable per-customer

- [ ] **Bundle size optimization**
  - Current Add-In JS is 1.95 MiB
  - Code splitting with dynamic imports
  - Tree shaking improvements

---

## P3 - Low Priority (Future)

- [ ] **AI-powered incident summary**
  - LLM integration for natural language summaries
  - Automatic severity assessment

- [ ] **Multi-language support**
  - i18n for Add-In UI
  - Localized PDF templates

- [ ] **Offline capability**
  - Cache reports for offline viewing
  - Queue uploads when offline

---

## Technical Debt

- [ ] **Migrate old reports to include shareUrl**
  - Script to regenerate shareUrl for existing reports

- [ ] **Add request timeout handling**
  - Worker checks for stale requests (Processing > 10 min)
  - Marks stale requests as Failed with timeout message

- [ ] **Reduce console.warn noise in tests**
  - Clean up expected warnings in test output

---

## Architecture Notes

### GitHub Actions Workflow

```yaml
# Conditional deploy based on changed paths
deploy-api:     # Triggers on: src/FleetClaim.Api/**, src/FleetClaim.Core/**
deploy-addin:   # Triggers on: src/FleetClaim.AddIn.React/**
deploy-worker:  # Triggers on: src/FleetClaim.Worker/**, src/FleetClaim.Core/**
deploy-admin:   # Triggers on: src/FleetClaim.Admin/**
```

### Key Files
| Component | Path |
|-----------|------|
| Add-In (React) | `src/FleetClaim.AddIn.React/app/` |
| API | `src/FleetClaim.Api/Program.cs` |
| Core/Models | `src/FleetClaim.Core/` |
| Worker | `src/FleetClaim.Worker/` |
| CI/CD | `.github/workflows/deploy.yml` |
| Cloud Build | `cloudbuild-*.yaml` |

### Testing
```bash
# .NET tests
dotnet test

# Add-In tests (97 tests)
cd src/FleetClaim.AddIn.React
npm test
```

### Deployment
```bash
# Push to main triggers CI/CD
git push origin main

# Manual deploy via GitHub Actions UI
# Go to Actions → Deploy to GCP → Run workflow
```
