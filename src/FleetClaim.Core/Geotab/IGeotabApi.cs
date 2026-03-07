using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;

namespace FleetClaim.Core.Geotab;

/// <summary>
/// Abstraction over the Geotab API class for testability.
/// Wraps the concrete Geotab.Checkmate.API to allow mocking in unit tests.
/// </summary>
public interface IGeotabApi
{
    /// <summary>
    /// The database name this API is connected to.
    /// </summary>
    string? Database { get; }
    
    /// <summary>
    /// The server hostname (e.g., "my.geotab.com").
    /// </summary>
    string? Server { get; }
    
    /// <summary>
    /// The login result containing session credentials.
    /// </summary>
    LoginResult? LoginResult { get; }
    
    /// <summary>
    /// Call a Geotab API method asynchronously.
    /// </summary>
    Task<T?> CallAsync<T>(string method, Type type, object? parameters, CancellationToken ct = default);
    
    /// <summary>
    /// Call a Geotab API method asynchronously (without explicit type parameter).
    /// </summary>
    Task<T?> CallAsync<T>(string method, object? parameters, CancellationToken ct = default);
}

/// <summary>
/// Wrapper around the concrete Geotab API class that implements IGeotabApi.
/// </summary>
public class GeotabApiWrapper : IGeotabApi
{
    private readonly API _api;
    private readonly string? _server;
    
    public GeotabApiWrapper(API api, string? server = null)
    {
        _api = api ?? throw new ArgumentNullException(nameof(api));
        _server = server ?? ExtractServerFromApi(api);
    }
    
    public string? Database => _api.Database;
    
    public string? Server => _server;
    
    public LoginResult? LoginResult => _api.LoginResult;
    
    public Task<T?> CallAsync<T>(string method, Type type, object? parameters, CancellationToken ct = default)
    {
        return _api.CallAsync<T>(method, type, parameters, ct);
    }
    
    public Task<T?> CallAsync<T>(string method, object? parameters, CancellationToken ct = default)
    {
        return _api.CallAsync<T>(method, parameters, ct);
    }
    
    /// <summary>
    /// Get the underlying API instance (for cases where direct access is needed).
    /// </summary>
    public API UnderlyingApi => _api;
    
    /// <summary>
    /// Extracts the server URL from the API object using reflection.
    /// </summary>
    private static string? ExtractServerFromApi(API api)
    {
        try
        {
            var uriField = api.GetType().GetField("uri", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            if (uriField?.GetValue(api) is Uri uri)
            {
                return uri.Host;
            }
        }
        catch { }
        
        return "my.geotab.com"; // Default fallback
    }
}
