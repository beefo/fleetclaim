using FleetClaim.Api;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Geotab.Checkmate;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
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

// Upload photo binary via MediaFile API
// The Add-In creates the MediaFile entity, then calls this to upload the binary
// We use service account credentials since Add-In can't access sessionId (MethodNotSupported)
app.MapPost("/api/photo/upload", async (
    HttpRequest httpRequest,
    [FromServices] ICredentialStore credentialStore,
    [FromServices] IGeotabClientFactory clientFactory,
    CancellationToken ct) =>
{
    // Parse multipart form data
    if (!httpRequest.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Content-Type must be multipart/form-data" });
    }
    
    var form = await httpRequest.ReadFormAsync(ct);
    
    // Extract required parameters
    var database = form["database"].FirstOrDefault() ?? "";
    var mediaFileId = form["mediaFileId"].FirstOrDefault() ?? "";
    
    if (string.IsNullOrEmpty(database))
    {
        return Results.BadRequest(new { error = "database is required" });
    }
    
    if (string.IsNullOrEmpty(mediaFileId))
    {
        return Results.BadRequest(new { error = "mediaFileId is required" });
    }
    
    // Get the uploaded file
    var file = form.Files.FirstOrDefault();
    if (file == null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "No file uploaded" });
    }
    
    // Validate file type
    var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
    var ext = Path.GetExtension(file.FileName).ToLower();
    if (!allowedExtensions.Contains(ext))
    {
        return Results.BadRequest(new { error = $"Invalid file type. Allowed: {string.Join(", ", allowedExtensions)}" });
    }
    
    // Validate file size (10MB max for images)
    if (file.Length > 10 * 1024 * 1024)
    {
        return Results.BadRequest(new { error = "File too large. Maximum 10MB." });
    }
    
    try
    {
        // Get service credentials from Secret Manager
        var creds = await credentialStore.GetCredentialsAsync(database, ct);
        
        // Create authenticated API client
        var api = await clientFactory.CreateClientAsync(database, ct);
        var loginCreds = api.LoginResult?.Credentials;
        
        if (loginCreds == null)
        {
            return Results.Problem("Failed to authenticate with service credentials", statusCode: 500);
        }
        
        var server = creds.Server ?? "my.geotab.com";
        
        // Read file bytes
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var fileBytes = ms.ToArray();
        
        // Upload binary to Geotab
        var uploadUrl = $"https://{server}/apiv1/";
        
        using var httpClient = new HttpClient();
        using var content = new MultipartFormDataContent();
        
        var uploadParams = new
        {
            method = "UploadMediaFile",
            @params = new
            {
                credentials = new
                {
                    database = loginCreds.Database,
                    userName = loginCreds.UserName,
                    sessionId = loginCreds.SessionId
                },
                mediaFile = new { id = mediaFileId }
            }
        };
        
        content.Add(new StringContent(Uri.EscapeDataString(
            System.Text.Json.JsonSerializer.Serialize(uploadParams))), "JSON-RPC");
        
        // Use the original filename for the upload
        var fileName = file.FileName.ToLower();
        var fileContent = new ByteArrayContent(fileBytes);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(
            ext == ".png" ? "image/png" :
            ext == ".gif" ? "image/gif" :
            ext == ".webp" ? "image/webp" :
            "image/jpeg");
        content.Add(fileContent, fileName, fileName);
        
        var response = await httpClient.PostAsync(uploadUrl, content, ct);
        var responseText = await response.Content.ReadAsStringAsync(ct);
        
        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"Upload failed: {response.StatusCode} - {responseText}");
        }
        
        // Check for JSON-RPC error in response
        if (responseText.Contains("\"error\""))
        {
            try
            {
                var jsonDoc = System.Text.Json.JsonDocument.Parse(responseText);
                if (jsonDoc.RootElement.TryGetProperty("error", out var errorProp))
                {
                    var errorMsg = errorProp.TryGetProperty("message", out var msgProp) 
                        ? msgProp.GetString() 
                        : responseText;
                    throw new Exception($"MediaFile upload error: {errorMsg}");
                }
            }
            catch (System.Text.Json.JsonException)
            {
                // Ignore JSON parse errors if response isn't valid JSON
            }
        }
        
        Console.WriteLine($"[Photo] Uploaded {file.FileName} for mediaFileId={mediaFileId}");
        
        return Results.Ok(new PhotoUploadResponse
        {
            MediaFileId = mediaFileId,
            FileName = file.FileName,
            Category = "", // Category was set by Add-In when creating the MediaFile entity
            UploadedAt = DateTime.UtcNow
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Photo] Upload failed: {ex.Message}");
        return Results.Problem($"Photo upload failed: {ex.Message}", statusCode: 500);
    }
}).RequireRateLimiting("pdf"); // Reuse PDF rate limit

// Download photo via MediaFile API (proxy for Add-In since it can't get sessionId)
app.MapGet("/api/photo/{database}/{mediaFileId}", async (
    string database,
    string mediaFileId,
    [FromServices] ICredentialStore credentialStore,
    [FromServices] IGeotabClientFactory clientFactory,
    CancellationToken ct) =>
{
    try
    {
        // Get service credentials
        var api = await clientFactory.CreateClientAsync(database, ct);
        var creds = api.LoginResult?.Credentials;
        
        if (creds == null)
        {
            return Results.Unauthorized();
        }
        
        var server = "my.geotab.com"; // Could extract from creds if needed
        
        // Download via Geotab API
        using var httpClient = new HttpClient();
        var downloadUrl = $"https://{server}/apiv1/";
        
        var jsonRpc = System.Text.Json.JsonSerializer.Serialize(new
        {
            method = "DownloadMediaFile",
            @params = new
            {
                credentials = new
                {
                    database = creds.Database,
                    userName = creds.UserName,
                    sessionId = creds.SessionId
                },
                mediaFile = new { id = mediaFileId }
            }
        });
        
        using var formContent = new MultipartFormDataContent();
        formContent.Add(new StringContent(jsonRpc), "JSON-RPC");
        
        var response = await httpClient.PostAsync(downloadUrl, formContent, ct);
        
        if (!response.IsSuccessStatusCode)
        {
            return Results.NotFound(new { error = "Image not found" });
        }
        
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
        if (!contentType.StartsWith("image/"))
        {
            return Results.NotFound(new { error = "Not an image" });
        }
        
        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        return Results.File(bytes, contentType);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Photo] Download failed: {ex.Message}");
        return Results.NotFound(new { error = "Image not found" });
    }
});

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
