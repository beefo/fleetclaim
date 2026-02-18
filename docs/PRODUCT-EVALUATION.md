# FleetClaim Product Evaluation

**Evaluator:** Bif (AI Assistant)  
**Date:** 2026-02-18  
**Perspective:** Fleet Manager filing insurance claims

---

## Executive Summary

FleetClaim provides a solid foundation for automated incident evidence collection, but several gaps exist before it's ready for production use by fleet managers dealing with insurance claims.

**Strengths:**
- Automatic collision detection via Geotab rules
- GPS trail collection with weather context
- Professional PDF reports
- Simple request interface

**Critical Gaps:**
- No email/notification when report is ready
- No incident photos or dashcam integration
- No driver statement collection
- Limited incident context (no other vehicles involved)

---

## User Journey Analysis

### Scenario: Fleet Manager files claim after vehicle collision

**Current Flow:**
1. Manager learns of incident (phone call, driver report)
2. Logs into MyGeotab → Opens FleetClaim Add-In
3. Clicks "Request Report" → Selects vehicle and time range
4. Waits (up to 2 min) for worker to process
5. Clicks Refresh to see report
6. Downloads PDF
7. Emails PDF to insurance company

**Pain Points:**
- ❌ Must manually check back for report (no notification)
- ❌ Must manually email PDF (no direct send)
- ❌ Must remember exact time of incident
- ❌ Cannot add driver statement or photos
- ❌ No third-party vehicle information

**Ideal Flow:**
1. Collision detected → FleetClaim auto-generates report
2. Fleet manager gets email: "Incident report ready for Demo-05"
3. Manager clicks link → Reviews report in browser
4. Adds driver statement, uploads photos
5. Clicks "Send to Insurance" → Report delivered
6. Insurance company accesses via share link

---

## Feature Priority Matrix

| Feature | Customer Impact | Effort | Priority |
|---------|----------------|--------|----------|
| Email notification when report ready | High | Medium | P0 |
| Driver statement field | High | Low | P0 |
| Photo attachment upload | High | Medium | P1 |
| Direct share to insurance | Medium | Medium | P1 |
| Auto-detect incident time from rule | High | Low | P1 |
| Incident notes/comments | Medium | Low | P2 |
| Third-party vehicle info | Medium | Low | P2 |
| Map preview in Add-In | Low | Medium | P3 |
| Batch report export | Low | High | P3 |

---

## Competitive Analysis

**vs. Manual Process:**
- FleetClaim saves ~30 min per incident collecting GPS data
- Automated weather/speed data adds credibility
- Professional PDF format vs. screenshots

**vs. Other Solutions:**
- Most competitors require separate dashcam systems
- FleetClaim leverages existing Geotab infrastructure
- Unique value: Instant automated evidence package

---

## Technical Debt

1. **Old reports lack shareUrl** - Need migration script or regeneration option
2. **Hardcoded API URL in Add-In** - Should use config
3. **No offline capability** - Reports require live API access
4. **No caching** - Every refresh hits Geotab API

---

## Recommendations

### Immediate (This Sprint):
1. Add email notification when report is generated
2. Add "Regenerate PDF" button for old reports
3. Fix shareUrl domain (fleetclaim.app vs Cloud Run)

### Next Sprint:
1. Driver statement text field
2. Photo upload capability
3. "Send to Email" button in Add-In

### Future:
1. Insurance company portal (dedicated view)
2. Dashcam video integration
3. AI-generated incident summary

---

## Metrics to Track

- Time from incident to report generation
- PDF download rate
- Share link click-through rate
- Reports per customer per month
- Customer feedback scores
