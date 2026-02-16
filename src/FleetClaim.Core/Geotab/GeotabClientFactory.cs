using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;

namespace FleetClaim.Core.Geotab;

public interface IGeotabClientFactory
{
    Task<API> CreateClientAsync(string database, CancellationToken ct = default);
}

/// <summary>
/// Creates authenticated Geotab API clients using credentials from Secret Manager.
/// </summary>
public class GeotabClientFactory : IGeotabClientFactory
{
    private readonly ICredentialStore _credentialStore;
    
    public GeotabClientFactory(ICredentialStore credentialStore)
    {
        _credentialStore = credentialStore;
    }
    
    public async Task<API> CreateClientAsync(string database, CancellationToken ct = default)
    {
        var creds = await _credentialStore.GetCredentialsAsync(database, ct);
        
        var api = new API(
            creds.UserName,
            creds.Password,
            null,
            creds.Database,
            creds.Server ?? "my.geotab.com"
        );
        
        await api.AuthenticateAsync(ct);
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
