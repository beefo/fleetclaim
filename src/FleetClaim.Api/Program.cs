using FleetClaim.Api;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Configuration
var projectId = builder.Configuration["GCP_PROJECT_ID"]
    ?? Environment.GetEnvironmentVariable("GCP_PROJECT_ID")
    ?? throw new InvalidOperationException("GCP_PROJECT_ID is required");

var shareLinkSigningKey = builder.Configuration["SHARE_LINK_SIGNING_KEY"]
    ?? Environment.GetEnvironmentVariable("SHARE_LINK_SIGNING_KEY")
    ?? throw new InvalidOperationException("SHARE_LINK_SIGNING_KEY is required");

// Gmail API for email (using OAuth credentials from Secret Manager)
var gmailClientId = builder.Configuration["GMAIL_CLIENT_ID"]
    ?? Environment.GetEnvironmentVariable("GMAIL_CLIENT_ID");
var gmailClientSecret = builder.Configuration["GMAIL_CLIENT_SECRET"]
    ?? Environment.GetEnvironmentVariable("GMAIL_CLIENT_SECRET");
var gmailRefreshToken = builder.Configuration["GMAIL_REFRESH_TOKEN"]
    ?? Environment.GetEnvironmentVariable("GMAIL_REFRESH_TOKEN");
var gmailFromEmail = builder.Configuration["GMAIL_FROM_EMAIL"]
    ?? Environment.GetEnvironmentVariable("GMAIL_FROM_EMAIL")
    ?? "clawbif@gmail.com";

// PDF options
var pdfOptions = new PdfOptions
{
    CompanyName = builder.Configuration["PDF_COMPANY_NAME"] ?? "FleetClaim",
    GoogleMapsApiKey = builder.Configuration["GOOGLE_MAPS_API_KEY"]
};

// Services
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ICredentialStore>(new GcpCredentialStore(projectId));
builder.Services.AddSingleton<IGeotabClientFactory, GeotabClientFactory>();
builder.Services.AddSingleton<IAddInDataRepository, AddInDataRepository>();
builder.Services.AddSingleton<IPdfRenderer>(new QuestPdfRenderer(pdfOptions));
builder.Services.AddSingleton<IShareLinkService>(new ShareLinkService(new ShareLinkOptions
{
    SigningKey = shareLinkSigningKey
}));

// Gmail email service
if (!string.IsNullOrEmpty(gmailRefreshToken) && !string.IsNullOrEmpty(gmailClientId))
{
    builder.Services.AddSingleton<IGmailEmailService>(new GmailEmailService(
        new GmailOAuthCredentials
        {
            ClientId = gmailClientId,
            ClientSecret = gmailClientSecret ?? "",
            RefreshToken = gmailRefreshToken,
            AccessToken = "" // Will use refresh token to get new access token
        },
        gmailFromEmail,
        "FleetClaim"
    ));
}
else
{
    // Register null service if Gmail not configured
    builder.Services.AddSingleton<IGmailEmailService?>(sp => null);
}

// Rate limiting
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    
    // Global rate limit: 100 requests per minute per IP
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    
    // Stricter limit for PDF generation (expensive operation)
    options.AddPolicy("pdf", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

var app = builder.Build();

// Security headers
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "SAMEORIGIN");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});

app.UseRateLimiter();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Share link endpoint
app.MapGet("/r/{token}", async (
    string token,
    [FromServices] IShareLinkService shareLinkService,
    [FromServices] IGeotabClientFactory clientFactory,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IMemoryCache cache,
    CancellationToken ct) =>
{
    // Parse and validate token
    var parsed = shareLinkService.ParseShareToken(token);
    if (parsed == null)
    {
        return Results.NotFound(RenderErrorPage("Invalid or expired link"));
    }
    
    var (reportId, database) = parsed.Value;
    
    // Check cache first (5 minute cache to reduce API calls)
    var cacheKey = $"report:{reportId}";
    if (cache.TryGetValue<IncidentReport>(cacheKey, out var cachedReport) && cachedReport != null)
    {
        return Results.Content(RenderReportPage(cachedReport), "text/html");
    }
    
    try
    {
        // Fetch from Geotab
        var api = await clientFactory.CreateClientAsync(database, ct);
        var reports = await repository.GetReportsAsync(api, ct: ct);
        var report = reports.FirstOrDefault(r => r.Id == reportId);
        
        if (report == null)
        {
            return Results.NotFound(RenderErrorPage("Report not found"));
        }
        
        // Cache for 5 minutes
        cache.Set(cacheKey, report, TimeSpan.FromMinutes(5));
        
        return Results.Content(RenderReportPage(report), "text/html");
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: "Unable to retrieve report",
            statusCode: 500,
            title: "Error");
    }
});

// PDF download endpoint - generates PDF on-demand
app.MapGet("/r/{token}/pdf", async (
    string token,
    [FromServices] IShareLinkService shareLinkService,
    [FromServices] IGeotabClientFactory clientFactory,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IPdfRenderer pdfRenderer,
    [FromServices] IMemoryCache cache,
    CancellationToken ct) =>
{
    var parsed = shareLinkService.ParseShareToken(token);
    if (parsed == null)
    {
        return Results.NotFound();
    }
    
    var (reportId, database) = parsed.Value;
    
    // Check cache
    var cacheKey = $"report:{reportId}";
    IncidentReport? report;
    
    if (!cache.TryGetValue<IncidentReport>(cacheKey, out report) || report == null)
    {
        var api = await clientFactory.CreateClientAsync(database, ct);
        var reports = await repository.GetReportsAsync(api, ct: ct);
        report = reports.FirstOrDefault(r => r.Id == reportId);
    }
    
    if (report == null)
    {
        return Results.NotFound();
    }
    
    // Generate PDF on-demand (not stored in AddInData due to size limits)
    var pdfBase64 = await pdfRenderer.RenderPdfAsync(report, ct);
    var pdfBytes = Convert.FromBase64String(pdfBase64);
    return Results.File(pdfBytes, "application/pdf", $"incident-report-{report.Id}.pdf");
});

// Direct PDF endpoint - requires signed token for security
// Token format: base64url(reportId|database|signature)
app.MapGet("/api/reports/{token}/pdf", async (
    string token,
    [FromServices] IShareLinkService shareLinkService,
    [FromServices] IGeotabClientFactory clientFactory,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IPdfRenderer pdfRenderer,
    [FromServices] IMemoryCache cache,
    CancellationToken ct) =>
{
    // Validate signed token
    var parsed = shareLinkService.ParseShareToken(token);
    if (parsed == null)
    {
        return Results.Unauthorized();
    }
    
    var (reportId, database) = parsed.Value;
    
    // Validate input format
    if (!Regex.IsMatch(reportId, @"^(rpt_[a-zA-Z0-9]{10,20}|baseline_req_[a-zA-Z0-9]+)$"))
    {
        return Results.BadRequest(new { error = "Invalid report ID format" });
    }
    if (!Regex.IsMatch(database, @"^[a-zA-Z0-9_-]{1,64}$"))
    {
        return Results.BadRequest(new { error = "Invalid database name" });
    }
    
    try
    {
        // Check cache
        var cacheKey = $"report:{reportId}";
        IncidentReport? report;
        
        if (!cache.TryGetValue<IncidentReport>(cacheKey, out report) || report == null)
        {
            var api = await clientFactory.CreateClientAsync(database, ct);
            var reports = await repository.GetReportsAsync(api, ct: ct);
            report = reports.FirstOrDefault(r => r.Id == reportId);
        }
        
        if (report == null)
        {
            return Results.NotFound(new { error = "Report not found" });
        }
        
        // Cache for 5 minutes
        cache.Set(cacheKey, report, TimeSpan.FromMinutes(5));
        
        // Generate PDF on-demand
        var pdfBase64 = await pdfRenderer.RenderPdfAsync(report, ct);
        var pdfBytes = Convert.FromBase64String(pdfBase64);
        return Results.File(pdfBytes, "application/pdf", $"fleetclaim-report-{report.Id}.pdf");
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: "Error generating PDF",
            statusCode: 500,
            title: "Error");
    }
}).RequireRateLimiting("pdf");

// Send report via email - requires signed token
app.MapPost("/r/{token}/email", async (
    string token,
    [FromBody] SendEmailRequest request,
    [FromServices] IShareLinkService shareLinkService,
    [FromServices] IGeotabClientFactory clientFactory,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IGmailEmailService? gmailService,
    [FromServices] IMemoryCache cache,
    CancellationToken ct) =>
{
    // Check if email service is configured
    if (gmailService == null)
    {
        return Results.Problem(
            detail: "Email service not configured. Please set up Gmail API credentials.",
            statusCode: 503,
            title: "Service Unavailable");
    }
    
    // Validate email
    if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
    {
        return Results.BadRequest(new { error = "Valid email address required" });
    }
    
    // Validate signed token
    var parsed = shareLinkService.ParseShareToken(token);
    if (parsed == null)
    {
        return Results.Unauthorized();
    }
    
    var (reportId, database) = parsed.Value;
    
    try
    {
        // Get report
        var cacheKey = $"report:{reportId}";
        IncidentReport? report;
        
        if (!cache.TryGetValue<IncidentReport>(cacheKey, out report) || report == null)
        {
            var api = await clientFactory.CreateClientAsync(database, ct);
            var reports = await repository.GetReportsAsync(api, ct: ct);
            report = reports.FirstOrDefault(r => r.Id == reportId);
        }
        
        if (report == null)
        {
            return Results.NotFound(new { error = "Report not found" });
        }
        
        // Send email via Gmail
        await gmailService.SendReportEmailAsync(report, request.Email, request.Message, ct);
        
        return Results.Ok(new { success = true, message = $"Email sent to {request.Email}" });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: "Error sending email: " + ex.Message,
            statusCode: 500,
            title: "Error");
    }
}).RequireRateLimiting("pdf"); // Use same rate limit as PDF

app.Run();

static string RenderReportPage(IncidentReport report)
{
    var severityColor = report.Severity switch
    {
        IncidentSeverity.Critical => "#c53030",
        IncidentSeverity.High => "#dd6b20",
        IncidentSeverity.Medium => "#d69e2e",
        _ => "#38a169"
    };
    
    var gpsDataJson = System.Text.Json.JsonSerializer.Serialize(
        report.Evidence.GpsTrail.Select(p => new { lat = p.Latitude, lng = p.Longitude, speed = p.SpeedKmh, time = p.Timestamp }));

    return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Incident Report - {{report.Id}}</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f7fafc; color: #1a202c; line-height: 1.5; }
                .container { max-width: 900px; margin: 0 auto; padding: 20px; }
                .header { background: #1a365d; color: white; padding: 24px; border-radius: 8px 8px 0 0; }
                .header h1 { font-size: 24px; margin-bottom: 4px; }
                .header .subtitle { opacity: 0.8; font-size: 14px; }
                .severity { display: inline-block; background: {{severityColor}}; padding: 6px 16px; border-radius: 4px; font-weight: bold; margin-top: 12px; }
                .card { background: white; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
                .section { padding: 20px; border-bottom: 1px solid #e2e8f0; }
                .section:last-child { border-bottom: none; }
                .section-title { font-size: 16px; font-weight: 600; color: #2d3748; margin-bottom: 16px; }
                .summary { background: #edf2f7; padding: 16px; border-radius: 6px; font-size: 15px; }
                .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
                .detail-item { }
                .detail-label { font-size: 12px; color: #718096; margin-bottom: 2px; }
                .detail-value { font-size: 14px; font-weight: 500; }
                .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
                .metric { background: #f7fafc; padding: 16px; border-radius: 6px; text-align: center; }
                .metric-value { font-size: 28px; font-weight: bold; color: #1a365d; }
                .metric-label { font-size: 12px; color: #718096; }
                #map { height: 300px; border-radius: 6px; background: #e2e8f0; }
                .speed-chart { height: 200px; background: #f7fafc; border-radius: 6px; display: flex; align-items: flex-end; padding: 10px; gap: 2px; }
                .speed-bar { background: #2b6cb0; flex: 1; min-width: 4px; border-radius: 2px 2px 0 0; transition: background 0.2s; }
                .speed-bar:hover { background: #1a365d; }
                table { width: 100%; border-collapse: collapse; font-size: 14px; }
                th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                th { background: #f7fafc; font-weight: 600; font-size: 12px; color: #718096; text-transform: uppercase; }
                .btn { display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; }
                .btn:hover { background: #1a365d; }
                .actions { text-align: center; padding: 24px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #718096; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Incident Report</h1>
                    <div class="subtitle">Report #{{report.Id}} • Generated {{report.GeneratedAt:MMM dd, yyyy HH:mm}} UTC</div>
                    <div class="severity">{{report.Severity.ToString().ToUpper()}}</div>
                </div>
                
                <div class="card">
                    <div class="section">
                        <div class="summary">{{report.Summary}}</div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Incident Details</div>
                        <div class="grid">
                            <div class="detail-item">
                                <div class="detail-label">Vehicle</div>
                                <div class="detail-value">{{report.VehicleName ?? report.VehicleId}}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Driver</div>
                                <div class="detail-value">{{report.DriverName ?? report.DriverId ?? "Unknown"}}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Occurred At</div>
                                <div class="detail-value">{{report.OccurredAt:yyyy-MM-dd HH:mm:ss}} UTC</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Weather</div>
                                <div class="detail-value">{{report.Evidence.WeatherCondition ?? "Unknown"}}{{(report.Evidence.TemperatureCelsius.HasValue ? $" ({report.Evidence.TemperatureCelsius:F0}°C)" : "")}}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Speed Analysis</div>
                        <div class="metrics">
                            <div class="metric">
                                <div class="metric-value">{{report.Evidence.SpeedAtEventKmh?.ToString("F0") ?? "-"}}</div>
                                <div class="metric-label">Speed at Event (km/h)</div>
                            </div>
                            <div class="metric">
                                <div class="metric-value">{{report.Evidence.MaxSpeedKmh?.ToString("F0") ?? "-"}}</div>
                                <div class="metric-label">Max Speed (km/h)</div>
                            </div>
                            <div class="metric">
                                <div class="metric-value">{{report.Evidence.DecelerationMps2?.ToString("F1") ?? "-"}}</div>
                                <div class="metric-label">Deceleration (m/s²)</div>
                            </div>
                            <div class="metric">
                                <div class="metric-value">{{report.Evidence.GpsTrail.Count}}</div>
                                <div class="metric-label">GPS Points</div>
                            </div>
                        </div>
                        
                        {{(report.Evidence.GpsTrail.Count > 0 ? """
                        <div style="margin-top: 16px;">
                            <div class="detail-label" style="margin-bottom: 8px;">Speed Profile</div>
                            <div class="speed-chart" id="speedChart"></div>
                        </div>
                        """ : "")}}
                    </div>
                    
                    {{(report.Evidence.GpsTrail.Count > 0 ? """
                    <div class="section">
                        <div class="section-title">GPS Trail</div>
                        <div id="map"></div>
                    </div>
                    """ : "")}}
                    
                    {{(report.Evidence.Diagnostics.Count > 0 ? $"""
                    <div class="section">
                        <div class="section-title">Diagnostic Data</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Description</th>
                                    <th>Value</th>
                                    <th>Unit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {string.Join("", report.Evidence.Diagnostics.Take(15).Select(d => $"""
                                <tr>
                                    <td>{d.Code}</td>
                                    <td>{d.Description ?? "-"}</td>
                                    <td>{d.Value?.ToString("F2") ?? "-"}</td>
                                    <td>{d.Unit ?? "-"}</td>
                                </tr>
                                """))}
                            </tbody>
                        </table>
                    </div>
                    """ : "")}}
                    
                    <div class="actions">
                        <a href="pdf" class="btn">Download PDF Report</a>
                    </div>
                </div>
                
                <div class="footer">
                    FleetClaim Incident Report • {{report.Id}}<br>
                    This report was automatically generated based on telemetry data.
                </div>
            </div>
            
            <script>
                const gpsData = {{gpsDataJson}};
                
                // Speed chart
                const speedChart = document.getElementById('speedChart');
                if (speedChart && gpsData.length > 0) {
                    const maxSpeed = Math.max(...gpsData.map(p => p.speed || 0), 1);
                    const sampleRate = Math.max(1, Math.floor(gpsData.length / 100));
                    const samples = gpsData.filter((_, i) => i % sampleRate === 0);
                    
                    samples.forEach(point => {
                        const bar = document.createElement('div');
                        bar.className = 'speed-bar';
                        const height = ((point.speed || 0) / maxSpeed) * 100;
                        bar.style.height = Math.max(2, height) + '%';
                        bar.title = `${(point.speed || 0).toFixed(0)} km/h`;
                        speedChart.appendChild(bar);
                    });
                }
                
                // Map (using Leaflet if available, otherwise placeholder)
                const mapEl = document.getElementById('map');
                if (mapEl && gpsData.length > 0) {
                    // Try to load Leaflet
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                    document.head.appendChild(link);
                    
                    const script = document.createElement('script');
                    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                    script.onload = function() {
                        const center = gpsData[Math.floor(gpsData.length / 2)];
                        const map = L.map('map').setView([center.lat, center.lng], 14);
                        
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '© OpenStreetMap'
                        }).addTo(map);
                        
                        const coords = gpsData.map(p => [p.lat, p.lng]);
                        L.polyline(coords, { color: '#2b6cb0', weight: 3 }).addTo(map);
                        
                        // Mark incident location
                        L.marker([center.lat, center.lng]).addTo(map)
                            .bindPopup('Incident Location');
                        
                        map.fitBounds(coords);
                    };
                    document.head.appendChild(script);
                }
            </script>
        </body>
        </html>
        """;
}

static string RenderErrorPage(string message)
{
    return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Error - FleetClaim</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f7fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                .error { text-align: center; padding: 40px; }
                .error h1 { color: #c53030; margin-bottom: 16px; }
                .error p { color: #718096; }
            </style>
        </head>
        <body>
            <div class="error">
                <h1>Oops!</h1>
                <p>{{message}}</p>
            </div>
        </body>
        </html>
        """;
}
