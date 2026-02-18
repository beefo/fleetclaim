# FleetClaim Security Audit
**Date:** 2026-02-18
**Auditor:** Bif (AI Assistant)

## Summary

| Category | Status | Severity |
|----------|--------|----------|
| Hardcoded Secrets | 🔴 CRITICAL | High |
| API Authentication | 🟡 PARTIAL | Medium |
| Rate Limiting | 🔴 MISSING | Medium |
| Input Validation | 🟡 PARTIAL | Medium |
| CORS | 🟢 OK | Low |
| Injection Attacks | 🟢 OK | N/A |

---

## 🔴 Critical Issues

### 1. Hardcoded Passwords in Scripts (CRITICAL)

**Location:** `scripts/*.js`

Multiple scripts contain hardcoded credentials:
- `PASSWORD = 'Evidence#Report2026'`
- `PASSWORD = 'Incident87d60490Report2026!'`

**Risk:** If repo goes public, credentials are exposed.

**Fix:** 
1. Add `scripts/` to `.gitignore`
2. Remove from git history with `git filter-repo`
3. Rotate ALL exposed passwords immediately
4. Use environment variables: `process.env.GEOTAB_PASSWORD`

### 2. Unauthenticated PDF Endpoint (HIGH)

**Location:** `src/FleetClaim.Api/Program.cs:133`

```csharp
app.MapGet("/api/reports/{database}/{reportId}/pdf", ...)
```

This endpoint is publicly accessible with `allUsers` IAM policy. Anyone can:
- Enumerate databases by name
- Enumerate report IDs
- Generate PDFs for any report

**Fix:** Add authentication or make it internal-only.

---

## 🟡 Medium Issues

### 3. No Rate Limiting

**Location:** All API endpoints

Cloud Run allows 80 concurrent connections per instance, max 20 instances.
No application-level rate limiting exists.

**Risk:** DoS attacks, API abuse, cost explosion.

**Fix:** Add rate limiting middleware:
```csharp
builder.Services.AddRateLimiter(options => {
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
        context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { 
                PermitLimit = 100, 
                Window = TimeSpan.FromMinutes(1) 
            }));
});
```

### 4. Input Validation on Database/ReportId

**Location:** `src/FleetClaim.Api/Program.cs`

`database` and `reportId` parameters are passed directly to the Geotab client.
While Geotab API will reject invalid values, we should validate:

**Fix:**
```csharp
if (!Regex.IsMatch(database, @"^[a-zA-Z0-9_-]{1,64}$"))
    return Results.BadRequest("Invalid database name");
    
if (!Regex.IsMatch(reportId, @"^rpt_[a-zA-Z0-9]{12}$"))
    return Results.BadRequest("Invalid report ID");
```

### 5. Share Token Not Time-Limited

**Location:** `src/FleetClaim.Core/Services/ShareLinkService.cs`

Share tokens are signed but have no expiration. Once generated, they work forever.

**Fix:** Include timestamp in token and validate age:
```csharp
var payload = $"{reportId}|{database}|{DateTime.UtcNow.Ticks}";
// On parse, check if token is < 30 days old
```

---

## 🟢 OK

### 6. CORS
No CORS headers configured - API doesn't serve cross-origin requests from browsers.
The Add-In works because it runs inside MyGeotab's iframe context.

### 7. No SQL/Command Injection
- No raw SQL (uses Geotab SDK)
- Process.Start uses hardcoded arguments only

### 8. Admin Portal Auth
Admin endpoints require API key via `X-API-Key` header.
Key stored in Secret Manager, not in code.

### 9. Geotab Credentials
Integration credentials stored in GCP Secret Manager (`fleetclaim-creds-*`).
Not in code or config files.

---

## Action Items

| Priority | Task | Est. Time |
|----------|------|-----------|
| P0 | Remove scripts/ from git, rotate passwords | 30 min |
| P0 | Add auth to `/api/reports/{db}/{id}/pdf` | 15 min |
| P1 | Add rate limiting | 30 min |
| P1 | Add input validation | 15 min |
| P2 | Add token expiration | 20 min |
| P2 | Add security headers (CSP, HSTS) | 15 min |

---

## Recommended Security Headers

```csharp
app.Use(async (context, next) => {
    context.Response.Headers.Add("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Add("X-Frame-Options", "DENY");
    context.Response.Headers.Add("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Add("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});
```
