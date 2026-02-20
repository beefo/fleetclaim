using System.Collections.Concurrent;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;

namespace FleetClaim.Core.Geotab;

public interface IGeotabClientFactory
{
    Task<API> CreateClientAsync(string database, CancellationToken ct = default);
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
        public required API Api { get; init; }
        public required DateTime ExpiresAt { get; init; }
    }
    
    public GeotabClientFactory(ICredentialStore credentialStore)
    {
        _credentialStore = credentialStore;
    }
    
    public async Task<API> CreateClientAsync(string database, CancellationToken ct = default)
    {
        var key = database.ToLowerInvariant();
        
        // Check cache
        if (_sessions.TryGetValue(key, out var cached) && cached.ExpiresAt > DateTime.UtcNow)
        {
            return cached.Api;
        }
        
        // Create new session
        var creds = await _credentialStore.GetCredentialsAsync(database, ct);
        
        var api = new API(
            creds.UserName,
            creds.Password,
            null,
            creds.Database,
            creds.Server ?? "my.geotab.com"
        );
        
        await api.AuthenticateAsync(ct);
        
        // Cache the session
        _sessions[key] = new CachedSession
        {
            Api = api,
            ExpiresAt = DateTime.UtcNow.Add(_sessionTtl)
        };
        
        return api;
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
