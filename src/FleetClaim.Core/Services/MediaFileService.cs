using FleetClaim.Core.Models;
using Geotab.Checkmate;
using System.Net.Http.Headers;
using System.Text.Json;

namespace FleetClaim.Core.Services;

/// <summary>
/// Service for uploading and downloading files via Geotab's MediaFile API.
/// Used for storing PDFs and photos that exceed AddInData's 10KB limit.
/// </summary>
public interface IMediaFileService
{
    /// <summary>
    /// Uploads a PDF to Geotab MediaFile storage.
    /// </summary>
    Task<string> UploadPdfAsync(API api, string reportId, string deviceId, byte[] pdfBytes, CancellationToken ct = default);
    
    /// <summary>
    /// Downloads a file from Geotab MediaFile storage.
    /// </summary>
    Task<byte[]?> DownloadFileAsync(API api, string mediaFileId, CancellationToken ct = default);
    
    /// <summary>
    /// Deletes a file from Geotab MediaFile storage.
    /// </summary>
    Task DeleteFileAsync(API api, string mediaFileId, CancellationToken ct = default);
}

public class MediaFileService : IMediaFileService
{
    // FleetClaim Solution ID for MediaFile API (must be consistent across all uses)
    private const string SOLUTION_ID = "aZmxlZXRjbGFpbS1wZGY"; // Base64 encoded GUID for "fleetclaim-pdf"
    
    private readonly HttpClient _httpClient;
    
    public MediaFileService(HttpClient? httpClient = null)
    {
        _httpClient = httpClient ?? new HttpClient();
    }
    
    public async Task<string> UploadPdfAsync(API api, string reportId, string deviceId, byte[] pdfBytes, CancellationToken ct = default)
    {
        // Step 1: Create MediaFile entity via JSON-RPC (avoiding direct object model dependency)
        var mediaFile = new Dictionary<string, object?>
        {
            ["name"] = $"fleetclaim-report-{reportId}.pdf".ToLowerInvariant(),
            ["solutionId"] = SOLUTION_ID,
            ["device"] = !string.IsNullOrEmpty(deviceId) ? new Dictionary<string, object> { ["id"] = deviceId } : null,
            ["fromDate"] = DateTime.UtcNow,
            ["toDate"] = DateTime.UtcNow,
            ["mediaType"] = "Application", // For PDF documents
            ["metaData"] = JsonSerializer.Serialize(new
            {
                reportId,
                generatedAt = DateTime.UtcNow,
                sizeBytes = pdfBytes.Length,
                contentType = "application/pdf"
            })
        };
        
        // Add the MediaFile entity using generic Call
        var mediaFileId = await api.CallAsync<string>("Add", new { typeName = "MediaFile", entity = mediaFile }, ct);
        
        if (string.IsNullOrEmpty(mediaFileId))
        {
            throw new InvalidOperationException("Failed to create MediaFile entity - no ID returned");
        }
        
        // Step 2: Upload the binary file
        try
        {
            // Get connection info from the API
            var credentials = api.LoginResult?.Credentials;
            var server = ExtractServer(api) ?? "my.geotab.com";
            var database = credentials?.Database ?? "";
            var userName = credentials?.UserName ?? "";
            var sessionId = credentials?.SessionId ?? "";
            
            var uploadUrl = $"https://{server}/apiv1/UploadMediaFile";
            
            using var content = new MultipartFormDataContent();
            content.Add(new StringContent(mediaFileId), "id");
            content.Add(new StringContent(database), "database");
            content.Add(new StringContent(userName), "userName");
            content.Add(new StringContent(sessionId), "sessionId");
            
            var fileContent = new ByteArrayContent(pdfBytes);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
            content.Add(fileContent, "file", $"report-{reportId}.pdf");
            
            var response = await _httpClient.PostAsync(uploadUrl, content, ct);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorText = await response.Content.ReadAsStringAsync(ct);
                throw new InvalidOperationException($"MediaFile upload failed: {response.StatusCode} - {errorText}");
            }
            
            return mediaFileId;
        }
        catch
        {
            // Clean up the MediaFile entity if upload fails
            try
            {
                await api.CallAsync<object>("Remove", new { typeName = "MediaFile", entity = new { id = mediaFileId } }, ct);
            }
            catch { /* Ignore cleanup errors */ }
            
            throw;
        }
    }
    
    public async Task<byte[]?> DownloadFileAsync(API api, string mediaFileId, CancellationToken ct = default)
    {
        var credentials = api.LoginResult?.Credentials;
        var server = ExtractServer(api) ?? "my.geotab.com";
        var database = credentials?.Database ?? "";
        var userName = credentials?.UserName ?? "";
        var sessionId = credentials?.SessionId ?? "";
        
        // Use JSON-RPC POST format for download (same as upload)
        var downloadUrl = $"https://{server}/apiv1/";
        
        var jsonRpc = System.Text.Json.JsonSerializer.Serialize(new
        {
            method = "DownloadMediaFile",
            @params = new
            {
                credentials = new
                {
                    database = database,
                    userName = userName,
                    sessionId = sessionId
                },
                mediaFile = new { id = mediaFileId }
            }
        });
        
        using var formContent = new MultipartFormDataContent();
        formContent.Add(new StringContent(jsonRpc), "JSON-RPC");
        
        var response = await _httpClient.PostAsync(downloadUrl, formContent, ct);
        
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }
        
        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        
        // Check if we got a valid file (not JSON error response)
        if (bytes.Length < 100)
        {
            return null;
        }
        
        return bytes;
    }
    
    public async Task DeleteFileAsync(API api, string mediaFileId, CancellationToken ct = default)
    {
        await api.CallAsync<object>("Remove", new { typeName = "MediaFile", entity = new { id = mediaFileId } }, ct);
    }
    
    /// <summary>
    /// Extracts the server URL from the API object (handles different SDK versions).
    /// </summary>
    private static string? ExtractServer(API api)
    {
        // Try to get server from URI if available
        try
        {
            var uriField = api.GetType().GetField("uri", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            if (uriField?.GetValue(api) is Uri uri)
            {
                return uri.Host;
            }
        }
        catch { }
        
        // Fallback to database naming convention
        var database = api.LoginResult?.Credentials?.Database;
        if (!string.IsNullOrEmpty(database))
        {
            // Standard Geotab servers
            return "my.geotab.com";
        }
        
        return null;
    }
}
