using System.Security.Cryptography;
using System.Text;

namespace FleetClaim.Core.Services;

public interface IShareLinkService
{
    /// <summary>
    /// Generates a shareable URL for a report.
    /// </summary>
    string GenerateShareUrl(string reportId, string database);
    
    /// <summary>
    /// Parses a share token to extract report ID and database.
    /// Returns null if token is invalid.
    /// </summary>
    (string ReportId, string Database)? ParseShareToken(string token);
}

/// <summary>
/// Service for generating and parsing shareable report links.
/// Uses a simple signed token format: base64(reportId|database|signature)
/// </summary>
public class ShareLinkService : IShareLinkService
{
    private readonly string _baseUrl;
    private readonly byte[] _signingKey;
    
    public ShareLinkService(ShareLinkOptions options)
    {
        _baseUrl = options.BaseUrl.TrimEnd('/');
        _signingKey = Encoding.UTF8.GetBytes(options.SigningKey);
    }
    
    public string GenerateShareUrl(string reportId, string database)
    {
        var token = GenerateToken(reportId, database);
        return $"{_baseUrl}/r/{token}";
    }
    
    public (string ReportId, string Database)? ParseShareToken(string token)
    {
        try
        {
            // URL-safe base64 decode
            var base64 = token.Replace('-', '+').Replace('_', '/');
            var padding = (4 - base64.Length % 4) % 4;
            base64 += new string('=', padding);
            
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(base64));
            var parts = decoded.Split('|');
            
            if (parts.Length != 3)
                return null;
            
            var reportId = parts[0];
            var database = parts[1];
            var providedSignature = parts[2];
            
            // Verify signature
            var expectedSignature = ComputeSignature(reportId, database);
            if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(providedSignature),
                Encoding.UTF8.GetBytes(expectedSignature)))
            {
                return null;
            }
            
            return (reportId, database);
        }
        catch
        {
            return null;
        }
    }
    
    private string GenerateToken(string reportId, string database)
    {
        var signature = ComputeSignature(reportId, database);
        var payload = $"{reportId}|{database}|{signature}";
        var bytes = Encoding.UTF8.GetBytes(payload);
        
        // URL-safe base64
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }
    
    private string ComputeSignature(string reportId, string database)
    {
        using var hmac = new HMACSHA256(_signingKey);
        var data = Encoding.UTF8.GetBytes($"{reportId}:{database}");
        var hash = hmac.ComputeHash(data);
        // Take first 8 bytes for compact signature
        return Convert.ToBase64String(hash[..8]).TrimEnd('=');
    }
}

public class ShareLinkOptions
{
    /// <summary>
    /// Base URL for the share link API (e.g., https://fleetclaim.app)
    /// </summary>
    public string BaseUrl { get; set; } = "https://fleetclaim.app";
    
    /// <summary>
    /// Secret key for signing tokens. Must be kept secure.
    /// </summary>
    public string SigningKey { get; set; } = "";
}
