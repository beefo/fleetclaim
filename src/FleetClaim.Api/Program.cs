using FleetClaim.Api;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Geotab.Checkmate;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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

// Access token signing key (for PDF download auth)
var accessTokenKey = builder.Configuration["ACCESS_TOKEN_KEY"]
    ?? Environment.GetEnvironmentVariable("ACCESS_TOKEN_KEY")
    ?? throw new InvalidOperationException("ACCESS_TOKEN_KEY is required");
var accessTokenKeyBytes = Encoding.UTF8.GetBytes(accessTokenKey);

// Services
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<ICredentialStore>(new GcpCredentialStore(projectId));
builder.Services.AddSingleton<IGeotabClientFactory, GeotabClientFactory>();
builder.Services.AddSingleton<IAddInDataRepository, AddInDataRepository>();
builder.Services.AddSingleton<IPdfRenderer>(new QuestPdfRenderer(pdfOptions));
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
else
{
    Console.WriteLine("Warning: Gmail credentials not configured. Email features will be disabled.");
    builder.Services.AddSingleton<IGmailEmailService?>(sp => null);
}

// Rate limiting
builder.Services.AddRateLimiter(options =>
{
    // PDF generation rate limit
    options.AddFixedWindowLimiter("pdf", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 10;
        opt.QueueLimit = 5;
    });
    
    // Email rate limit
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
                   host.EndsWith(".run.app"); // GCP Cloud Run
        })
        .AllowAnyHeader()
        .AllowAnyMethod();
    });
});

var app = builder.Build();

// Enable CORS
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
// Authenticated Endpoints - Require MyGeotab credentials verification
// ============================================================================

/// <summary>
/// Verify MyGeotab credentials by calling GetSystemTime API
/// Returns the authenticated API object if successful
/// </summary>
async Task<(bool Success, string? Error, API? Api)> VerifyCredentialsAsync(
    GeotabCredentialsRequest creds,
    CancellationToken ct)
{
    if (string.IsNullOrEmpty(creds.Database) ||
        string.IsNullOrEmpty(creds.UserName) ||
        string.IsNullOrEmpty(creds.SessionId))
    {
        return (false, "Missing required credentials (database, userName, sessionId)", null);
    }
    
    try
    {
        // Build the Geotab server URL
        var server = creds.Server ?? "my.geotab.com";
        if (!server.StartsWith("http"))
        {
            server = $"https://{server}";
        }
        
        // Create API with provided credentials
        var api = new API(
            creds.UserName,
            null, // No password - using session
            creds.SessionId,
            creds.Database,
            server);
        
        // Verify by calling GetSystemTime - this will fail if credentials are invalid
        var systemTime = await api.CallAsync<DateTime>("GetSystemTime", ct);
        
        Console.WriteLine($"[Auth] Credentials verified for {creds.UserName}@{creds.Database} (server time: {systemTime})");
        
        return (true, null, api);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Auth] Credential verification failed for {creds.UserName}@{creds.Database}: {ex.Message}");
        return (false, "Invalid or expired credentials", null);
    }
}

// Generate PDF with credential verification
app.MapPost("/api/pdf", async (
    [FromBody] PdfGenerateRequest request,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IPdfRenderer pdfRenderer,
    [FromServices] IMediaFileService mediaFileService,
    CancellationToken ct) =>
{
    // Verify credentials
    var (success, error, api) = await VerifyCredentialsAsync(request.Credentials, ct);
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
        // Fetch the report
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
            catch (Exception ex)
            {
                Console.WriteLine($"[PDF] Failed to download pre-generated PDF: {ex.Message}");
            }
        }
        
        // Generate on-demand if no pre-generated PDF
        if (pdfBytes == null || pdfBytes.Length == 0)
        {
            // Fetch photo data for embedding in PDF
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

// Issue access token - verifies user exists in database, returns signed time-limited token
app.MapPost("/api/auth/token", async (
    [FromBody] TokenRequest request,
    [FromServices] IGeotabClientFactory clientFactory,
    CancellationToken ct) =>
{
    // Input validation
    if (string.IsNullOrWhiteSpace(request.Database) || !Regex.IsMatch(request.Database, @"^[a-zA-Z0-9_\-\.]+$"))
    {
        return Results.BadRequest(new { error = "Invalid database" });
    }
    if (string.IsNullOrWhiteSpace(request.UserName) || request.UserName.Length > 200)
    {
        return Results.BadRequest(new { error = "Invalid userName" });
    }
    
    try
    {
        // Authenticate using service account credentials
        var api = await clientFactory.CreateClientAsync(request.Database);
        
        // Verify the user exists in this database
        var users = await api.CallAsync<List<Geotab.Checkmate.ObjectModel.User>>(
            "Get", 
            typeof(Geotab.Checkmate.ObjectModel.User), 
            new { search = new { name = request.UserName } },
            ct);
        
        if (users == null || users.Count == 0)
        {
            Console.WriteLine($"[Token] User '{request.UserName}' not found in database '{request.Database}'");
            return Results.Unauthorized();
        }
        
        // Generate signed token (valid for 1 hour)
        var expiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();
        var token = GenerateAccessToken(request.Database, request.UserName, expiresAt, accessTokenKeyBytes);
        
        return Results.Ok(new { token, expiresAt });
    }
    catch (InvalidOperationException ex) when (ex.Message.Contains("credentials"))
    {
        return Results.Problem(detail: $"Database '{request.Database}' is not configured", statusCode: 404);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Token] Error: {ex.Message}");
        return Results.Problem(detail: "Error generating token", statusCode: 500);
    }
});

// Generate PDF using access token (for external Add-Ins that can't get sessionId)
app.MapGet("/api/pdf/{database}/{reportId}", async (
    string database,
    string reportId,
    [FromQuery] string? token,
    [FromServices] IGeotabClientFactory clientFactory,
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
    if (string.IsNullOrWhiteSpace(token))
    {
        return Results.BadRequest(new { error = "token query parameter is required" });
    }
    
    // Verify token
    var tokenData = VerifyAccessToken(token, accessTokenKeyBytes);
    if (tokenData == null)
    {
        Console.WriteLine($"[PDF] Invalid or expired token");
        return Results.Unauthorized();
    }
    
    // Token must match the requested database
    if (!string.Equals(tokenData.Value.Database, database, StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine($"[PDF] Token database mismatch: {tokenData.Value.Database} vs {database}");
        return Results.Unauthorized();
    }
    
    try
    {
        // Authenticate using service account credentials
        var api = await clientFactory.CreateClientAsync(database);
        
        // Fetch the report
        var reports = await repository.GetReportsAsync(api, ct: ct);
        var report = reports.FirstOrDefault(r => r.Id == reportId);
        
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
            catch (Exception ex)
            {
                Console.WriteLine($"[PDF] Failed to download pre-generated PDF: {ex.Message}");
            }
        }
        
        // Generate on-demand if no pre-generated PDF
        if (pdfBytes == null || pdfBytes.Length == 0)
        {
            // Fetch photo data for embedding in PDF
            var photoData = await FetchPhotoDataAsync(api, report, ct);
            var base64Pdf = await pdfRenderer.RenderPdfAsync(report, photoData, ct);
            pdfBytes = Convert.FromBase64String(base64Pdf);
        }
        
        return Results.File(
            pdfBytes,
            "application/pdf",
            $"incident-report-{report.Id}.pdf");
    }
    catch (InvalidOperationException ex) when (ex.Message.Contains("credentials"))
    {
        return Results.Problem(
            detail: $"Database '{database}' is not configured",
            statusCode: 404);
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: "Error generating PDF: " + ex.Message,
            statusCode: 500);
    }
}).RequireRateLimiting("pdf");

// Send report via email with credential verification
app.MapPost("/api/email", async (
    [FromBody] EmailSendRequest request,
    [FromServices] IAddInDataRepository repository,
    [FromServices] IPdfRenderer pdfRenderer,
    [FromServices] IMediaFileService mediaFileService,
    [FromServices] IGmailEmailService? gmailService,
    CancellationToken ct) =>
{
    // Check if email service is configured
    if (gmailService == null)
    {
        return Results.Problem(
            detail: "Email service not configured",
            statusCode: 503);
    }
    
    // Verify credentials
    var (success, error, api) = await VerifyCredentialsAsync(request.Credentials, ct);
    if (!success || api == null)
    {
        return Results.Unauthorized();
    }
    
    // Validate email
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
        // Fetch the report
        var reports = await repository.GetReportsAsync(api, ct: ct);
        var report = reports.FirstOrDefault(r => r.Id == request.ReportId);
        
        if (report == null)
        {
            return Results.NotFound(new { error = "Report not found" });
        }
        
        // Send email
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

// ============================================================================
// Helper Functions
// ============================================================================

static async Task<Dictionary<string, byte[]>> FetchPhotoDataAsync(
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
    
    foreach (var photo in report.Evidence.Photos.Take(10)) // Limit to 10 photos
    {
        try
        {
            var downloadUrl = "https://my.geotab.com/apiv1/";
            
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
            
            var response = await httpClient.PostAsync(downloadUrl, formContent, ct);
            
            if (response.IsSuccessStatusCode)
            {
                var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
                if (contentType.StartsWith("image/"))
                {
                    var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                    if (bytes.Length > 100) // Basic sanity check
                    {
                        photoData[photo.MediaFileId] = bytes;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PDF] Failed to fetch photo {photo.MediaFileId}: {ex.Message}");
        }
    }
    
    return photoData;
}

// Access token generation - creates a signed, time-limited token
static string GenerateAccessToken(string database, string userName, long expiresAt, byte[] key)
{
    var payload = JsonSerializer.Serialize(new { d = database, u = userName, e = expiresAt });
    var payloadBytes = Encoding.UTF8.GetBytes(payload);
    
    using var hmac = new HMACSHA256(key);
    var signature = hmac.ComputeHash(payloadBytes);
    
    // Combine payload + signature, base64url encode
    var combined = new byte[payloadBytes.Length + signature.Length];
    Buffer.BlockCopy(payloadBytes, 0, combined, 0, payloadBytes.Length);
    Buffer.BlockCopy(signature, 0, combined, payloadBytes.Length, signature.Length);
    
    return Convert.ToBase64String(combined)
        .Replace('+', '-')
        .Replace('/', '_')
        .TrimEnd('=');
}

// Access token verification - returns decoded data if valid, null if invalid/expired
static (string Database, string UserName, long ExpiresAt)? VerifyAccessToken(string token, byte[] key)
{
    try
    {
        // Base64url decode
        var base64 = token.Replace('-', '+').Replace('_', '/');
        var padding = (4 - base64.Length % 4) % 4;
        base64 += new string('=', padding);
        var combined = Convert.FromBase64String(base64);
        
        if (combined.Length <= 32) // Signature is 32 bytes (SHA256)
            return null;
        
        var payloadBytes = combined[..^32];
        var providedSignature = combined[^32..];
        
        // Verify signature
        using var hmac = new HMACSHA256(key);
        var expectedSignature = hmac.ComputeHash(payloadBytes);
        
        if (!CryptographicOperations.FixedTimeEquals(providedSignature, expectedSignature))
            return null;
        
        // Parse payload
        var payload = JsonSerializer.Deserialize<JsonElement>(Encoding.UTF8.GetString(payloadBytes));
        var database = payload.GetProperty("d").GetString() ?? "";
        var userName = payload.GetProperty("u").GetString() ?? "";
        var expiresAt = payload.GetProperty("e").GetInt64();
        
        // Check expiry
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expiresAt)
            return null;
        
        return (database, userName, expiresAt);
    }
    catch
    {
        return null;
    }
}

public record TokenRequest(string Database, string UserName);
