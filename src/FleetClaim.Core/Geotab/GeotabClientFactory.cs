using System.Collections.Concurrent;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;

namespace FleetClaim.Core.Geotab;

public interface IGeotabClientFactory
{
    Task<IGeotabApi> CreateClientAsync(string database, CancellationToken ct = default);
    Task<IGeotabApi> RefreshSessionAsync(string database, CancellationToken ct = default);
    void InvalidateSession(string database);
}

/// <summary>
/// Creates authenticated Geotab API clients using credentials from Secret Manager.
/// Caches sessions to avoid rate limiting on Authenticate calls.
/// </summary>
public class GeotabClientFactory : IGeotabClientFactory
{
    private readonly ICredentialStore _credentialStore;
    private readonly ConcurrentDictionary<string, CachedSession> _sessions = new();
    private readonly TimeSpan _sessionTtl = TimeSpan.FromMinutes(10); // Geotab sessions last ~20 mins
    
    private class CachedSession
    {
        public required IGeotabApi Api { get; init; }
        public required DateTime ExpiresAt { get; init; }
    }
    
    public GeotabClientFactory(ICredentialStore credentialStore)
    {
        _credentialStore = credentialStore;
    }
    
    public async Task<IGeotabApi> CreateClientAsync(string database, CancellationToken ct = default)
    {
        var key = database.ToLowerInvariant();
        
        // Check cache
        if (_sessions.TryGetValue(key, out var cached) && cached.ExpiresAt > DateTime.UtcNow)
        {
            return cached.Api;
        }
        
        return await CreateNewSessionAsync(database, key, ct);
    }
    
    /// <summary>
    /// Force creates a new session, bypassing cache. Call this if a cached session becomes invalid.
    /// </summary>
    public async Task<IGeotabApi> RefreshSessionAsync(string database, CancellationToken ct = default)
    {
        var key = database.ToLowerInvariant();
        _sessions.TryRemove(key, out _);  // Clear any cached invalid session
        return await CreateNewSessionAsync(database, key, ct);
    }
    
    /// <summary>
    /// Invalidate a cached session (e.g., when InvalidUserException is received).
    /// </summary>
    public void InvalidateSession(string database)
    {
        var key = database.ToLowerInvariant();
        _sessions.TryRemove(key, out _);
        Console.WriteLine($"[GeotabClientFactory] Invalidated session for {database}");
    }
    
    private async Task<IGeotabApi> CreateNewSessionAsync(string database, string key, CancellationToken ct)
    {
        var creds = await _credentialStore.GetCredentialsAsync(database, ct);
        
        Console.WriteLine($"[GeotabClientFactory] Creating new session for {database} on {creds.Server ?? "my.geotab.com"}");
        
        var api = new API(
            creds.UserName,
            creds.Password,
            null,
            creds.Database,
            creds.Server ?? "my.geotab.com"
        );
        
        await api.AuthenticateAsync(ct);
        
        Console.WriteLine($"[GeotabClientFactory] Authenticated successfully for {database}");
        
        var wrapper = new GeotabApiWrapper(api, creds.Server ?? "my.geotab.com");
        
        // Cache the session
        _sessions[key] = new CachedSession
        {
            Api = wrapper,
            ExpiresAt = DateTime.UtcNow.Add(_sessionTtl)
        };
        
        return wrapper;
    }
}

public interface ICredentialStore
{
    Task<GeotabCredentials> GetCredentialsAsync(string database, CancellationToken ct = default);
    Task<IReadOnlyList<string>> ListDatabasesAsync(CancellationToken ct = default);
}

public class GeotabCredentials
{
    public required string Database { get; init; }
    public required string UserName { get; init; }
    public required string Password { get; init; }
    public string? Server { get; init; }
}
