using FleetClaim.Api;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Geotab.Checkmate;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;

// FleetClaim solution ID for MediaFile storage
const string FLEETCLAIM_SOLUTION_ID = "aji_jHQGE8k2TDodR8tZrpw";

var builder = WebApplication.CreateBuilder(args);

// Configuration
var projectId = builder.Configuration["GCP_PROJECT_ID"]
    ?? Environment.GetEnvironmentVariable("GCP_PROJECT_ID")
    ?? throw new InvalidOperationException("GCP_PROJECT_ID is required");

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
builder.Services.AddHttpClient();
// Use factory to allow lazy initialization and testing
builder.Services.AddSingleton<ICredentialStore>(sp => new GcpCredentialStore(projectId));
builder.Services.AddSingleton<IGeotabClientFactory, GeotabClientFactory>();
builder.Services.AddSingleton<IAddInDataRepository, AddInDataRepository>();
builder.Services.AddSingleton<IPdfRenderer>(sp => new QuestPdfRenderer(pdfOptions));
builder.Services.AddSingleton<IMediaFileService>(sp =>
    new MediaFileService(sp.GetService<IHttpClientFactory>()?.CreateClient()));

// Gmail email service
if (!string.IsNullOrEmpty(gmailRefreshToken) && !string.IsNullOrEmpty(gmailClientId))
{
    var gmailCredentials = new GmailOAuthCredentials
    {
        ClientId = gmailClientId!,
        ClientSecret = gmailClientSecret ?? "",
        RefreshToken = gmailRefreshToken!
    };
    builder.Services.AddSingleton<IGmailEmailService>(sp =>
        new GmailEmailService(gmailCredentials, gmailFromEmail));
}

// Rate limiting
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("pdf", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 10;
        opt.QueueLimit = 5;
    });
    
    options.AddFixedWindowLimiter("email", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 5;
        opt.QueueLimit = 2;
    });
    
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = 429;
        await context.HttpContext.Response.WriteAsJsonAsync(new { error = "Too many requests. Please try again later." }, token);
    };
});

// CORS - restrict to known origins (MyGeotab, Add-In)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(origin =>
        {
            var host = new Uri(origin).Host.ToLower();
            return host.EndsWith(".geotab.com") ||
                   host.EndsWith(".geotab.ca") ||
                   host == "localhost" ||
                   host.EndsWith(".run.app");
        })
        .AllowAnyHeader()
        .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors();

// Security headers
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "SAMEORIGIN");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    await next();
});

app.UseRateLimiter();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// ============================================================================
// Helper Functions
// ============================================================================

/// <summary>
/// Extract Geotab credentials from X-headers or request body
/// Headers take precedence: X-Geotab-Database, X-Geotab-UserName, X-Geotab-SessionId, X-Geotab-Server
/// </summary>
GeotabCredentialsRequest ExtractCredentials(HttpContext context, GeotabCredentialsRequest? bodyCredentials = null)
{
    // Try headers first
    var database = context.Request.Headers["X-Geotab-Database"].FirstOrDefault();
    var userName = context.Request.Headers["X-Geotab-UserName"].FirstOrDefault();
    var sessionId = context.Request.Headers["X-Geotab-SessionId"].FirstOrDefault();
    var server = context.Request.Headers["X-Geotab-Server"].FirstOrDefault();
    
    Console.WriteLine($"[ExtractCredentials] Headers: Database={database}, UserName={userName}, SessionId={sessionId?.Substring(0, Math.Min(8, sessionId?.Length ?? 0))}..., Server={server}");
    
    // If headers have all required fields, use them
    if (!string.IsNullOrEmpty(database) && !string.IsNullOrEmpty(userName) && !string.IsNullOrEmpty(sessionId))
    {
        Console.WriteLine($"[ExtractCredentials] Using headers");
        return new GeotabCredentialsRequest
        {
            Database = database,
            UserName = userName,
            SessionId = sessionId,
            Server = server ?? "my.geotab.com"
        };
    }
    
    // Fall back to body credentials
    Console.WriteLine($"[ExtractCredentials] Falling back to body credentials: {bodyCredentials != null}");
    return bodyCredentials ?? new GeotabCredentialsRequest();
}

/// <summary>
/// Verify MyGeotab credentials by calling GetSystemTimeUtc API
/// Returns the authenticated API object if successful
/// </summary>
async Task<(bool Success, string? Error, API? Api)> VerifyCredentialsAsync(
    GeotabCredentialsRequest creds,
    CancellationToken ct)
{
    Console.WriteLine($"[VerifyCredentials] Database={creds.Database}, UserName={creds.UserName}, SessionId={creds.SessionId?.Substring(0, Math.Min(8, creds.SessionId?.Length ?? 0))}..., Server={creds.Server}");
    
    if (string.IsNullOrEmpty(creds.Database) ||
        string.IsNullOrEmpty(creds.UserName) ||
        string.IsNullOrEmpty(creds.SessionId))
    {
        Console.WriteLine($"[VerifyCredentials] FAIL: Missing required credentials");
        return (false, "Missing required credentials (database, userName, sessionId)", null);
    }
    
    try
    {
        var server = creds.Server ?? "my.geotab.com";
        // Strip protocol if present - Geotab SDK expects just the hostname
        if (server.StartsWith("https://"))
        {
            server = server.Substring(8);
        }
        else if (server.StartsWith("http://"))
        {
            server = server.Substring(7);
        }
        
        Console.WriteLine($"[VerifyCredentials] Creating API with server={server}");
        
        var api = new API(
            creds.UserName,
            null,
            creds.SessionId,
            creds.Database,
            server,
            timeout: 30000);
        
        // Verify by fetching the user - confirms session is valid for this specific user
        Console.WriteLine($"[VerifyCredentials] Calling Get User for {creds.UserName}...");
        var users = await api.CallAsync<List<Geotab.Checkmate.ObjectModel.User>>(
            "Get",
            typeof(Geotab.Checkmate.ObjectModel.User),
            new 
            { 
                search = new { name = creds.UserName },
                propertySelector = new { fields = new[] { "id", "name" } }
            },
            ct);
        
        if (users == null || users.Count == 0)
        {
            Console.WriteLine($"[VerifyCredentials] FAIL: User not found");
            return (false, "User not found", null);
        }
        
        Console.WriteLine($"[VerifyCredentials] SUCCESS: Found user {users[0].Name} (id: {users[0].Id})");
        
        return (true, null, api);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[VerifyCredentials] FAIL: {ex.GetType().Name}: {ex.Message}");
        return (false, $"Invalid or expired credentials: {ex.Message}", null);
    }
}

/// <summary>
/// Fetch photo data for embedding in PDF
/// </summary>
async Task<Dictionary<string, byte[]>> FetchPhotoDataAsync(
    API api,
    IncidentReport report,
    CancellationToken ct)
{
    var photoData = new Dictionary<string, byte[]>();
    
    if (report.Evidence?.Photos == null || report.Evidence.Photos.Count == 0)
        return photoData;
    
    var credentials = api.LoginResult?.Credentials;
    if (credentials == null)
        return photoData;
    
    using var httpClient = new HttpClient();
    
    foreach (var photo in report.Evidence.Photos.Take(10))
    {
        try
        {
            var jsonRpc = System.Text.Json.JsonSerializer.Serialize(new
            {
                method = "DownloadMediaFile",
                @params = new
                {
                    credentials = new
                    {
                        database = credentials.Database,
                        userName = credentials.UserName,
                        sessionId = credentials.SessionId
                    },
                    mediaFile = new { id = photo.MediaFileId }
                }
            });
            
            using var formContent = new MultipartFormDataContent();
            formContent.Add(new StringContent(jsonRpc), "JSON-RPC");
            
            var response = await httpClient.PostAsync("https://my.geotab.com/apiv1/", formContent, ct);
            
            if (response.IsSuccessStatusCode)
            {
                var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
                if (contentType.StartsWith("image/"))
                {
                    var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                    if (bytes.Length > 100)
                    {
                        photoData[photo.MediaFileId] = bytes;
                    }
                }
            }
        }
        catch
        {
            // Skip photos that fail to download
        }
    }
    
    return photoData;
}

// ============================================================================
// Endpoints
// ============================================================================

// Generate PDF with credential verification
// Accepts credentials via X-headers OR request body
app.MapPost("/api/pdf", async (
    HttpContext context,
    [FromBody] PdfGenerateRequest request,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IPdfRenderer pdfRenderer,
    [FromServices] IMediaFileService mediaFileService,
    CancellationToken ct) =>
{
    var creds = ExtractCredentials(context, request.Credentials);
    var (success, error, api) = await VerifyCredentialsAsync(creds, ct);
    if (!success || api == null)
    {
        return Results.Unauthorized();
    }
    
    if (string.IsNullOrEmpty(request.ReportId))
    {
        return Results.BadRequest(new { error = "reportId is required" });
    }
    
    try
    {
        var reports = await repository.GetReportsAsync(api, ct: ct);
        var report = reports.FirstOrDefault(r => r.Id == request.ReportId);
        
        if (report == null)
        {
            return Results.NotFound(new { error = "Report not found" });
        }
        
        byte[]? pdfBytes = null;
        
        // Try to download pre-generated PDF from MediaFile
        if (!string.IsNullOrEmpty(report.PdfMediaFileId))
        {
            try
            {
                pdfBytes = await mediaFileService.DownloadFileAsync(api, report.PdfMediaFileId, ct);
            }
            catch { /* Fall through to generate */ }
        }
        
        // Generate on-demand if no pre-generated PDF
        if (pdfBytes == null || pdfBytes.Length == 0)
        {
            var photoData = await FetchPhotoDataAsync(api, report, ct);
            var base64Pdf = await pdfRenderer.RenderPdfAsync(report, photoData, ct);
            pdfBytes = Convert.FromBase64String(base64Pdf);
        }
        
        return Results.File(
            pdfBytes,
            "application/pdf",
            $"incident-report-{report.Id}.pdf");
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: "Error generating PDF: " + ex.Message,
            statusCode: 500);
    }
}).RequireRateLimiting("pdf");

// Generate PDF with path parameters (requires X-header credential verification)
app.MapGet("/api/pdf/{database}/{reportId}", async (
    HttpContext context,
    string database,
    string reportId,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IPdfRenderer pdfRenderer,
    [FromServices] IMediaFileService mediaFileService,
    CancellationToken ct) =>
{
    // Input validation
    if (!Regex.IsMatch(database, @"^[a-zA-Z0-9_\-\.]+$") || database.Length > 100)
    {
        return Results.BadRequest(new { error = "Invalid database name" });
    }
    if (!Regex.IsMatch(reportId, @"^[a-zA-Z0-9_\-]+$") || reportId.Length > 50)
    {
        return Results.BadRequest(new { error = "Invalid report ID" });
    }
    
    // Verify credentials via X-headers
    var headerCreds = ExtractCredentials(context);
    
    // Database in credentials must match path parameter (or be empty to use path)
    if (!string.IsNullOrEmpty(headerCreds.Database) && headerCreds.Database != database)
    {
        return Results.BadRequest(new { error = "Database in credentials must match path parameter" });
    }
    
    // Create new credentials with database from path
    var creds = new GeotabCredentialsRequest
    {
        Database = database,
        UserName = headerCreds.UserName,
        SessionId = headerCreds.SessionId,
        Server = headerCreds.Server
    };
    
    var (success, error, api) = await VerifyCredentialsAsync(creds, ct);
    if (!success || api == null)
    {
        return Results.Unauthorized();
    }
    
    try
    {
        var reports = await repository.GetReportsAsync(api, ct: ct);
        var report = reports.FirstOrDefault(r => r.Id == reportId);
        
        if (report == null)
        {
            return Results.NotFound(new { error = "Report not found" });
        }
        
        byte[]? pdfBytes = null;
        
        if (!string.IsNullOrEmpty(report.PdfMediaFileId))
        {
            try
            {
                pdfBytes = await mediaFileService.DownloadFileAsync(api, report.PdfMediaFileId, ct);
            }
            catch { /* Fall through */ }
        }
        
        if (pdfBytes == null || pdfBytes.Length == 0)
        {
            var photoData = await FetchPhotoDataAsync(api, report, ct);
            var base64Pdf = await pdfRenderer.RenderPdfAsync(report, photoData, ct);
            pdfBytes = Convert.FromBase64String(base64Pdf);
        }
        
        return Results.File(
            pdfBytes,
            "application/pdf",
            $"incident-report-{report.Id}.pdf");
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: "Error generating PDF: " + ex.Message,
            statusCode: 500);
    }
}).RequireRateLimiting("pdf");

// Send report via email with credential verification
// Accepts credentials via X-headers OR request body
app.MapPost("/api/email", async (
    HttpContext context,
    [FromBody] EmailSendRequest request,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IPdfRenderer pdfRenderer,
    [FromServices] IMediaFileService mediaFileService,
    IServiceProvider serviceProvider,
    CancellationToken ct) =>
{
    // SECURITY: Always verify credentials first before checking service availability
    var creds = ExtractCredentials(context, request.Credentials);
    var (success, error, api) = await VerifyCredentialsAsync(creds, ct);
    if (!success || api == null)
    {
        return Results.Unauthorized();
    }
    
    var gmailService = serviceProvider.GetService<IGmailEmailService>();
    if (gmailService == null)
    {
        return Results.Problem(
            detail: "Email service not configured",
            statusCode: 503);
    }
    
    var emailRegex = new Regex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$");
    if (string.IsNullOrWhiteSpace(request.Email) || !emailRegex.IsMatch(request.Email))
    {
        return Results.BadRequest(new { error = "Valid email address required" });
    }
    
    if (string.IsNullOrEmpty(request.ReportId))
    {
        return Results.BadRequest(new { error = "reportId is required" });
    }
    
    try
    {
        var reports = await repository.GetReportsAsync(api, ct: ct);
        var report = reports.FirstOrDefault(r => r.Id == request.ReportId);
        
        if (report == null)
        {
            return Results.NotFound(new { error = "Report not found" });
        }
        
        await gmailService.SendReportEmailAsync(report, request.Email, request.Message, ct);
        
        return Results.Ok(new { success = true, message = $"Email sent to {request.Email}" });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: "Error sending email: " + ex.Message,
            statusCode: 500);
    }
}).RequireRateLimiting("email");

app.Run();

// Make Program class accessible for integration testing
public partial class Program { }
