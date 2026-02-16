using System.Text.Json;
using Google.Cloud.SecretManager.V1;

namespace FleetClaim.Core.Geotab;

/// <summary>
/// Retrieves Geotab credentials from GCP Secret Manager.
/// 
/// Expected secret naming convention:
///   fleetclaim-creds-{database}
/// 
/// Secret value format (JSON):
/// {
///   "database": "customer_db",
///   "userName": "fleetclaim-integration",
///   "password": "xxx",
///   "server": "my.geotab.com"  // optional
/// }
/// </summary>
public class GcpCredentialStore : ICredentialStore
{
    private readonly SecretManagerServiceClient _client;
    private readonly string _projectId;
    private const string SecretPrefix = "fleetclaim-creds-";
    
    public GcpCredentialStore(string projectId)
    {
        _projectId = projectId;
        _client = SecretManagerServiceClient.Create();
    }
    
    public async Task<GeotabCredentials> GetCredentialsAsync(string database, CancellationToken ct = default)
    {
        var secretName = $"projects/{_projectId}/secrets/{SecretPrefix}{database}/versions/latest";
        
        var response = await _client.AccessSecretVersionAsync(secretName, ct);
        var json = response.Payload.Data.ToStringUtf8();
        
        return JsonSerializer.Deserialize<GeotabCredentials>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? throw new InvalidOperationException($"Invalid credential format for {database}");
    }
    
    public async Task<IReadOnlyList<string>> ListDatabasesAsync(CancellationToken ct = default)
    {
        var databases = new List<string>();
        var parent = $"projects/{_projectId}";
        
        var secrets = _client.ListSecretsAsync(parent);
        
        await foreach (var secret in secrets)
        {
            if (secret.SecretName.SecretId.StartsWith(SecretPrefix))
            {
                var database = secret.SecretName.SecretId[SecretPrefix.Length..];
                databases.Add(database);
            }
        }
        
        return databases;
    }
}
