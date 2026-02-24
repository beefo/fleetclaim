# FleetClaim Security Review

**Date:** 2026-02-18  
**Reviewer:** OpenClaw Security Subagent  
**Scope:** Full codebase security review  
**Version:** 1.0.0

---

## Executive Summary

This security review identified **3 Critical**, **5 High**, **6 Medium**, and **4 Low** severity findings across the FleetClaim codebase. The most significant issues involve overly permissive CORS configuration, API key exposure via query strings, and potential for sensitive data logging. The codebase demonstrates good practices in several areas including use of GCP Secret Manager for credentials, HMAC token signing, and input validation on some endpoints.

---

## Findings Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 3 | CORS wildcard, API key in query string, command injection risk |
| 🟠 High | 5 | Token signature truncation, missing rate limiting, no HTTPS enforcement, sensitive data in logs, Swagger in production |
| 🟡 Medium | 6 | Floating NuGet versions, hardcoded email, weak email validation, no Content-Security-Policy, exception message leakage, admin gcloud shell exec |
| 🟢 Low | 4 | Missing audit logging, verbose error pages, no secret rotation, test secrets |

---

## 🔴 Critical Findings

### CRIT-01: Overly Permissive CORS Policy - AllowAnyOrigin

**File:** `src/FleetClaim.Api/Program.cs:103-108`

```csharp
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});
```

**Risk:** Any website can make API requests to FleetClaim endpoints, enabling CSRF-like attacks and data exfiltration. An attacker could embed malicious JavaScript on any site to access reports if a user has a valid share token.

**Remediation:**
```csharp
builder.Services.AddCors(options =>
{
    var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() 
        ?? new[] { "https://fleetclaim.app", "https://my.geotab.com" };
    
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});
```

---

### CRIT-02: Admin API Key Exposed via Query String

**File:** `src/FleetClaim.Admin/ApiKeyAuthHandler.cs:23-28`

```csharp
if (!Request.Headers.TryGetValue("X-API-Key", out var apiKeyHeader))
{
    // Also check query string for convenience
    if (!Request.Query.TryGetValue("api_key", out var apiKeyQuery))
    {
        return Task.FromResult(AuthenticateResult.Fail("Missing API key"));
    }
    apiKeyHeader = apiKeyQuery;
}
```

**Risk:** API keys in query strings are logged in server access logs, proxy logs, browser history, and can leak via Referer headers. The comment "for convenience" suggests this was a development shortcut that should not be in production.

**Remediation:** Remove query string authentication entirely:
```csharp
protected override Task<AuthenticateResult> HandleAuthenticateAsync()
{
    if (!Request.Headers.TryGetValue("X-API-Key", out var apiKeyHeader))
    {
        return Task.FromResult(AuthenticateResult.Fail("Missing API key header"));
    }
    // ... rest of validation
}
```

---

### CRIT-03: Shell Command Injection Risk in Admin Service

**File:** `src/FleetClaim.Admin/AdminService.cs:143-159`

```csharp
var psi = new System.Diagnostics.ProcessStartInfo
{
    FileName = "gcloud",
    Arguments = $"run jobs executions list --job=fleetclaim-worker --project={_config.ProjectId} --region=us-central1 --limit={limit} --format=json",
    ...
};
```

**Risk:** While `ProjectId` comes from configuration (not user input) and `limit` is an integer, this pattern is dangerous. If any user-controlled data were interpolated into shell commands, it would enable command injection.

**Remediation:** Use the Google Cloud client library instead of shelling out:
```csharp
// Use Google.Cloud.Run.V2 client library
var client = await JobsClient.CreateAsync();
var executions = client.ListExecutions(new ListExecutionsRequest { ... });
```

Or if shell execution is required, validate all inputs explicitly and consider using argument arrays instead of string interpolation.

---

## 🟠 High Findings

### HIGH-01: Truncated HMAC Signature Weakens Token Security

**File:** `src/FleetClaim.Core/Services/ShareLinkService.cs:79-81`

```csharp
var hash = hmac.ComputeHash(data);
// Take first 8 bytes for compact signature
return Convert.ToBase64String(hash[..8]).TrimEnd('=');
```

**Risk:** Truncating a 256-bit HMAC to 64 bits reduces collision resistance to 2^32 (birthday attack). With sufficient requests, an attacker could forge valid tokens.

**Remediation:** Use at least 16 bytes (128 bits) for security margin:
```csharp
return Convert.ToBase64String(hash[..16]).TrimEnd('=');
```

---

### HIGH-02: Missing Rate Limiting on Critical Endpoints

**File:** `src/FleetClaim.Api/Program.cs:132-181`

The `/r/{token}` and `/r/{token}/pdf` endpoints have no rate limiting, only the `/api/reports/{token}/pdf` endpoint does. This enables:
- Token brute-forcing attempts
- Resource exhaustion via PDF generation

**Remediation:** Apply rate limiting to all share link endpoints:
```csharp
app.MapGet("/r/{token}", ...).RequireRateLimiting("shareLink");
app.MapGet("/r/{token}/pdf", ...).RequireRateLimiting("pdf");
```

---

### HIGH-03: No HTTPS Enforcement or HSTS Header

**File:** `src/FleetClaim.Api/Program.cs:117-123`

Security headers are added but missing:
- `Strict-Transport-Security` (HSTS)
- HTTPS redirect enforcement

**Risk:** Man-in-the-middle attacks, credential theft, session hijacking.

**Remediation:**
```csharp
// Add HTTPS redirection
app.UseHttpsRedirection();

// Add HSTS header
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    // ... existing headers
    await next();
});
```

---

### HIGH-04: Sensitive Data Potentially Logged

**File:** `src/FleetClaim.Admin/AdminService.cs:303`

```csharp
_logger.LogInformation("Stored credentials for {Database}", database);
```

While the credential values aren't logged here, the pattern of storing credentials should use debug-level logging and the code should be audited to ensure no sensitive data flows into logs.

**Files to audit:**
- `AdminService.cs:285-303` - Secret operations
- `OnboardDatabaseAsync` - Receives password in plaintext

**Remediation:**
1. Use structured logging with sensitive data redaction
2. Set log level to Debug for credential operations
3. Configure log filtering to exclude sensitive parameter names

---

### HIGH-05: Swagger/OpenAPI Enabled in Production

**File:** `src/FleetClaim.Admin/Program.cs:48-49`

```csharp
app.UseSwagger();
app.UseSwaggerUI();
```

**Risk:** Exposes complete API documentation including all endpoints, parameters, and schemas to attackers.

**Remediation:**
```csharp
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

---

## 🟡 Medium Findings

### MED-01: Floating NuGet Package Versions

**File:** `src/FleetClaim.Core/FleetClaim.Core.csproj`

```xml
<PackageReference Include="Geotab.Checkmate.ObjectModel" Version="*" />
<PackageReference Include="Google.Cloud.SecretManager.V1" Version="*" />
<PackageReference Include="QuestPDF" Version="2024.10.*" />
```

**Risk:** Builds are non-reproducible, vulnerable package versions could be pulled unexpectedly, supply chain attacks.

**Remediation:** Pin all package versions and use Dependabot/Renovate for controlled updates:
```xml
<PackageReference Include="Geotab.Checkmate.ObjectModel" Version="6.1.0" />
<PackageReference Include="Google.Cloud.SecretManager.V1" Version="2.7.0" />
```

---

### MED-02: Hardcoded Email Address

**Files:** 
- `src/FleetClaim.Api/Program.cs:31`
- `src/FleetClaim.Core/Services/GmailEmailService.cs:28`

```csharp
?? "clawbif@gmail.com";
```

**Risk:** If configuration is missing, emails are sent from a default address that may not be authorized or monitored.

**Remediation:** Require explicit configuration, fail if not provided:
```csharp
var gmailFromEmail = builder.Configuration["GMAIL_FROM_EMAIL"]
    ?? Environment.GetEnvironmentVariable("GMAIL_FROM_EMAIL")
    ?? throw new InvalidOperationException("GMAIL_FROM_EMAIL is required");
```

---

### MED-03: Weak Email Validation

**File:** `src/FleetClaim.Api/Program.cs:307`

```csharp
if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
```

**Risk:** Accepts malformed emails like `@`, `test@`, `@test.com`. Could be used for header injection or spam.

**Remediation:**
```csharp
if (string.IsNullOrWhiteSpace(request.Email) || 
    !System.Text.RegularExpressions.Regex.IsMatch(request.Email, 
        @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
{
    return Results.BadRequest(new { error = "Valid email address required" });
}
```

---

### MED-04: Missing Content-Security-Policy Header

**File:** `src/FleetClaim.Api/Program.cs:117-123`

The security headers include X-Frame-Options and X-XSS-Protection but not CSP.

**Risk:** XSS attacks via inline scripts, external resource injection.

**Remediation:**
```csharp
context.Response.Headers.Append("Content-Security-Policy", 
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://unpkg.com; " +
    "img-src 'self' data: https://*.tile.openstreetmap.org https://maps.geoapify.com;");
```

---

### MED-05: Exception Messages Leaked to Clients

**File:** `src/FleetClaim.Api/Program.cs:340`

```csharp
return Results.Problem(
    detail: "Error sending email: " + ex.Message,
```

**Risk:** Internal exception details may reveal implementation information, stack traces, or sensitive data.

**Remediation:**
```csharp
_logger.LogError(ex, "Error sending email to {Email}", request.Email);
return Results.Problem(
    detail: "Failed to send email. Please try again later.",
    statusCode: 500,
    title: "Error");
```

---

### MED-06: Database Credentials Passed Through Admin API

**File:** `src/FleetClaim.Admin/Program.cs:75-90`

```csharp
admin.MapPost("/databases", async (OnboardDatabaseRequest request, AdminService svc) =>
{
    // ... validation
    var result = await svc.OnboardDatabaseAsync(
        request.Database, 
        request.Username, 
        request.Password,  // Password in request body
        request.Server ?? "my.geotab.com");
```

**Risk:** Geotab credentials are transmitted through the admin API. While protected by API key auth, credentials pass through more system components than necessary.

**Recommendation:** Consider an alternative onboarding flow where credentials are entered directly into Secret Manager UI, or use a secure credential exchange mechanism.

---

## 🟢 Low Findings

### LOW-01: No Audit Logging for Security Events

Authentication failures, successful admin operations, and data access are not logged in a structured, auditable format.

**Recommendation:** Implement structured audit logging:
```csharp
_logger.LogInformation("Admin action: {@AuditEvent}", new {
    Action = "DatabaseOnboarded",
    Database = database,
    Timestamp = DateTime.UtcNow,
    // Don't log credentials
});
```

---

### LOW-02: Verbose Error Pages in HTML Rendering

**File:** `src/FleetClaim.Api/Program.cs:569-581`

Error page shows minimal info but could be enhanced with less debugging detail in production.

---

### LOW-03: No Secret Rotation Mechanism

Credentials stored in Secret Manager are not rotated. Consider implementing:
- Credential version tracking
- Rotation notifications
- Automated rotation where possible

---

### LOW-04: Test File Contains Weak Test Secret

**File:** `src/FleetClaim.Tests/ShareLinkServiceTests.cs:15`

```csharp
SigningKey = "test-secret-key-12345"
```

While this is test code, ensure this pattern isn't copy-pasted to production configuration.

---

## Positive Security Practices

The codebase demonstrates several good security practices:

1. ✅ **GCP Secret Manager** for credential storage (`GcpCredentialStore.cs`)
2. ✅ **HMAC-SHA256 signed tokens** for share links (`ShareLinkService.cs`)
3. ✅ **Timing-safe comparison** for signature validation (`CryptographicOperations.FixedTimeEquals`)
4. ✅ **Input validation regex** on `/api/reports/{token}/pdf` endpoint
5. ✅ **HTML encoding** in email templates (`HttpUtility.HtmlEncode`)
6. ✅ **XSS protection** in JS via `escapeHtml()` function
7. ✅ **Rate limiting** infrastructure is in place (just needs broader application)
8. ✅ **Security headers** (X-Frame-Options, X-Content-Type-Options, etc.)
9. ✅ **Workload Identity Federation** for GitHub Actions (no long-lived keys)
10. ✅ **No hardcoded production credentials** in source code

---

## Recommended Remediations Priority

### Immediate (This Sprint)
1. Fix CORS configuration (CRIT-01)
2. Remove API key query string auth (CRIT-02)
3. Add rate limiting to share endpoints (HIGH-02)
4. Disable Swagger in production (HIGH-05)

### Short-term (Next 2 Weeks)
5. Extend HMAC signature length (HIGH-01)
6. Add HTTPS/HSTS enforcement (HIGH-03)
7. Pin NuGet package versions (MED-01)
8. Improve email validation (MED-03)
9. Add Content-Security-Policy (MED-04)

### Medium-term (Next Month)
10. Replace gcloud shell exec with client library (CRIT-03)
11. Audit and sanitize logging (HIGH-04)
12. Implement audit logging (LOW-01)
13. Add generic error messages (MED-05)

---

## Dependencies to Review

Run vulnerability scans with:
```bash
dotnet list package --vulnerable
npm audit  # For Add-In dependencies
```

Packages with floating versions should be pinned and audited:
- `Geotab.Checkmate.ObjectModel`
- `Google.Cloud.SecretManager.V1`
- `QuestPDF`
- `SendGrid`
- `Google.Apis.Gmail.v1`

---

## Conclusion

FleetClaim has a generally sound security architecture with proper use of cloud security services and signed tokens. However, the **critical CORS misconfiguration** and **API key in query string** issues should be addressed immediately before any production deployment. The recommendations above are prioritized to address the highest-risk items first while building a more robust security posture over time.

---

*Report generated by OpenClaw Security Subagent*
