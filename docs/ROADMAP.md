# FleetClaim Product Roadmap

**Purpose:** Structured task list for autonomous agent iteration.  
**Last Updated:** 2026-02-18

---

## How To Use This File

Sub-agents should:
1. Find the next `[ ]` unchecked item in priority order (P0 → P1 → P2)
2. Implement it fully (code, test, commit)
3. Mark it `[x]` when done
4. Add notes about what was done
5. Deploy if all tests pass

---

## Current Sprint: MVP Polish

### P0 - Critical (Do First)

- [x] **Fix PDF download "coming soon" bug** (v19)
  - Removed duplicate function, PDF now works for new reports
  
- [x] **Fix shareUrl domain mismatch** 
  - Updated SHARE_LINK_BASE_URL env var on worker
  
- [x] **Add Settings tab for email notifications** (v20)
  - Email list management, webhook URL, severity threshold
  
- [x] **Add Notes/Driver Statement field** (v21)
  - Editable notes in report detail, saved to AddInData, included in PDF

- [ ] **Deploy v21 and verify**
  - Check build status, deploy all services, run E2E test
  - Verify notes save/load correctly
  - Verify PDF includes notes

- [ ] **Email notification integration**
  - Configure SMTP or SendGrid credentials in worker
  - Test email delivery when report is generated
  - Ensure shareUrl is included in email

### P1 - High Priority (This Sprint)

- [x] **Replace JavaScript alerts with toast notifications** (v22)
  - Removed all 10 `alert()` calls from fleetclaim.js
  - Added toast component (bottom of screen, slides up, auto-dismiss 3.5s)
  - Styles: green (success), red (error), blue (info)

- [x] **Add delete functionality for reports and requests**
  - Delete button on completed reports (with confirmation)
  - Delete button on completed/failed requests
  - Remove from AddInData via API
  - Refresh list after delete
  - Added confirmation modal (not browser alert)

- [ ] **Add sorting for reports and requests**
  - Sort dropdown: Date (newest/oldest), Severity, Vehicle name
  - Remember last sort preference
  - Apply to both Reports and Requests tabs

- [ ] **Add date filtering with 1-week default**
  - Date range picker for reports list
  - Default to last 7 days on load
  - "All time" option available
  - Filter applied before rendering

- [ ] **Insurance claim requirements audit**
  - Research what insurance companies require for fleet accident claims
  - Audit current PDF against requirements
  - Add missing fields to report model and PDF
  - Key items to verify:
    - Date/time/location of incident
    - Driver information (license, contact)
    - Vehicle details (VIN, plate, year/make/model)
    - Weather conditions at time of incident
    - Speed data and driving behavior
    - Witness information fields
    - Police report number field
    - Damage description/photos
    - Third-party vehicle/driver info
  - Update PDF layout for insurance readability

- [ ] **Add "Send to Email" button in report detail**
  - Quick button to email report to specific address
  - Pre-fill with configured notification emails
  - Include PDF attachment

- [ ] **Add report status indicators**
  - Show "New" badge for reports < 24h old
  - Show "Has Notes" indicator in list view
  - Color-code by severity in list

- [ ] **Improve request feedback**
  - Show toast notification when request submitted
  - Auto-refresh when new report detected
  - Show estimated processing time

- [ ] **Add "Regenerate PDF" for old reports**
  - Button to request fresh PDF for reports without shareUrl
  - Worker endpoint to regenerate PDF for existing report

### P2 - Medium Priority (Next Sprint)

- [ ] **Third-party vehicle info field**
  - Add otherVehicleInfo to report model
  - Input fields: plate number, make/model, driver name, insurance
  - Include in PDF

- [ ] **Photo upload capability**
  - Allow attaching photos to reports
  - Store as base64 or external URL
  - Display in report detail and PDF

- [ ] **Map preview in Add-In**
  - Render GPS trail on embedded map
  - Use Leaflet.js (free) or Google Maps
  - Click to open full-screen

- [ ] **Report search improvements**
  - Search by date range
  - Filter by vehicle
  - Sort options (date, severity)

### P3 - Low Priority (Future)

- [ ] **Batch report export**
  - Select multiple reports, download as ZIP
  - Combined PDF option

- [ ] **Insurance company portal**
  - Dedicated read-only view for adjusters
  - Access via share link with extended permissions

- [ ] **Dashcam video integration**
  - Link to external video URLs
  - Embed video player in report

- [ ] **AI-generated incident summary**
  - Use LLM to summarize GPS/speed data
  - Suggest probable cause

- [ ] **Report expiry/retention policy**
  - Auto-archive after X days
  - Configurable per-customer

---

## Technical Debt

- [ ] **Migrate old reports to include shareUrl**
  - Script to regenerate shareUrl for existing reports
  
- [ ] **Add integration tests**
  - E2E test for full request → report → PDF flow
  - Mock Geotab API for CI

- [ ] **Hardcoded API URL in Add-In**
  - Move to config or auto-detect

- [ ] **Add request timeout handling**
  - Mark stale requests as Failed after 10 min

---

## Completed Archive

| Version | Date | Features |
|---------|------|----------|
| v19 | 2026-02-18 | PDF download fix |
| v20 | 2026-02-18 | Settings tab |
| v21 | 2026-02-18 | Notes feature |

---

## Notes for Agents

### Build & Deploy Process
```bash
# Check build status
gcloud builds list --project=fleetclaim --region=us-central1 --limit=3

# Start new build
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=COMMIT_SHA=vXX-feature-name \
  --region=us-central1 --project=fleetclaim \
  --service-account=projects/fleetclaim/serviceAccounts/cloudbuild-sa@fleetclaim.iam.gserviceaccount.com

# Deploy specific service
gcloud run deploy SERVICE_NAME --image=us-central1-docker.pkg.dev/fleetclaim/fleetclaim/IMAGE:TAG \
  --platform=managed --region=us-central1 --project=fleetclaim
```

### Key Files
- Add-In UI: `src/FleetClaim.AddIn/`
- Core logic: `src/FleetClaim.Core/`
- Worker: `src/FleetClaim.Worker/`
- API: `src/FleetClaim.Api/`

### Testing
- No dotnet in sandbox - rely on CI for tests
- Manual test via Geotab API calls (node scripts in /tmp)

### Credentials
- Stored in `.secrets/` (gitignored)
- GCP secrets: `fleetclaim-creds-demo_fleetclaim`
