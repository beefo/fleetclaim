using System.Text.Json;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using Google.Cloud.Logging.V2;
using Google.Api.Gax;

namespace FleetClaim.Admin;

public class AdminService
{
    private readonly ICredentialStore _credentialStore;
    private readonly IGeotabClientFactory _clientFactory;
    private readonly AdminConfig _config;
    private readonly ILogger<AdminService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    public AdminService(
        ICredentialStore credentialStore,
        IGeotabClientFactory clientFactory,
        AdminConfig config,
        ILogger<AdminService> logger)
    {
        _credentialStore = credentialStore;
        _clientFactory = clientFactory;
        _config = config;
        _logger = logger;
    }

    public async Task<object> GetOverviewAsync()
    {
        var databases = await _credentialStore.ListDatabasesAsync();
        
        var stats = new
        {
            timestamp = DateTime.UtcNow,
            totalDatabases = databases.Count,
            databases = databases.ToList(),
            projectId = _config.ProjectId
        };

        return stats;
    }

    public async Task<object> GetDatabasesAsync()
    {
        var databases = await _credentialStore.ListDatabasesAsync();
        var results = new List<object>();

        foreach (var db in databases)
        {
            try
            {
                var api = await _clientFactory.CreateClientAsync(db);
                
                // Get AddInData counts
                var addInData = await GetAddInDataAsync(api);
                var requests = addInData.Where(d => d.Type == "reportRequest").ToList();
                var reports = addInData.Where(d => d.Type == "report").ToList();

                results.Add(new
                {
                    database = db,
                    status = "connected",
                    totalRequests = requests.Count,
                    pendingRequests = requests.Count(r => r.GetPayload<ReportRequest>()?.Status == ReportRequestStatus.Pending),
                    completedRequests = requests.Count(r => r.GetPayload<ReportRequest>()?.Status == ReportRequestStatus.Completed),
                    totalReports = reports.Count
                });
            }
            catch (Exception ex)
            {
                results.Add(new
                {
                    database = db,
                    status = "error",
                    error = ex.Message
                });
            }
        }

        return results;
    }

    public async Task<object> GetRequestsAsync(string database)
    {
        var api = await _clientFactory.CreateClientAsync(database);
        var addInData = await GetAddInDataAsync(api);

        var requests = addInData
            .Where(d => d.Type == "reportRequest")
            .Select(d => d.GetPayload<ReportRequest>())
            .Where(r => r != null)
            .OrderByDescending(r => r!.RequestedAt)
            .Take(100)
            .ToList();

        return new
        {
            database,
            count = requests.Count,
            requests
        };
    }

    public async Task<object> GetReportsAsync(string database)
    {
        var api = await _clientFactory.CreateClientAsync(database);
        var addInData = await GetAddInDataAsync(api);

        var reports = addInData
            .Where(d => d.Type == "report")
            .Select(d => d.GetPayload<IncidentReport>())
            .Where(r => r != null)
            .OrderByDescending(r => r!.GeneratedAt)
            .Take(100)
            .ToList();

        return new
        {
            database,
            count = reports.Count,
            reports
        };
    }

    public async Task<object> GetRecentJobsAsync(int limit = 20)
    {
        try
        {
            // Use gcloud CLI to get job executions (simpler than using the API directly)
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "gcloud",
                Arguments = $"run jobs executions list --job=fleetclaim-worker --project={_config.ProjectId} --region=us-central1 --limit={limit} --format=json",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };

            using var process = System.Diagnostics.Process.Start(psi);
            if (process == null) return new { error = "Failed to start gcloud" };

            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                var error = await process.StandardError.ReadToEndAsync();
                return new { error };
            }

            return JsonSerializer.Deserialize<object>(output) ?? new { };
        }
        catch (Exception ex)
        {
            return new { error = ex.Message };
        }
    }

    public async Task<object> GetRecentLogsAsync(int limit = 100)
    {
        try
        {
            var client = await LoggingServiceV2Client.CreateAsync();
            
            var request = new ListLogEntriesRequest
            {
                ResourceNames = { $"projects/{_config.ProjectId}" },
                Filter = $"resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"fleetclaim-worker\" AND timestamp>=\"{DateTime.UtcNow.AddHours(-1):yyyy-MM-ddTHH:mm:ssZ}\"",
                OrderBy = "timestamp desc",
                PageSize = limit
            };

            var response = client.ListLogEntries(request);
            var entries = response.Take(limit).Select(e => new
            {
                timestamp = e.Timestamp?.ToDateTime(),
                message = e.TextPayload ?? e.JsonPayload?.ToString(),
                severity = e.Severity.ToString()
            }).ToList();

            return new
            {
                count = entries.Count,
                entries
            };
        }
        catch (Exception ex)
        {
            return new { error = ex.Message };
        }
    }

    private async Task<List<AddInDataWrapper>> GetAddInDataAsync(Geotab.Checkmate.API api)
    {
        const string AddInIdValue = "aji_jHQGE8k2TDodR8tZrpw";
        
        var results = await api.CallAsync<List<object>>("Get", typeof(Geotab.Checkmate.ObjectModel.AddInData), new
        {
            search = new { addInId = AddInIdValue }
        });

        if (results == null || results.Count == 0)
            return [];

        var wrappers = new List<AddInDataWrapper>();

        foreach (var item in results)
        {
            try
            {
                var json = JsonSerializer.Serialize(item);
                using var doc = JsonDocument.Parse(json);

                if (doc.RootElement.TryGetProperty("details", out var details) ||
                    doc.RootElement.TryGetProperty("Details", out details))
                {
                    var wrapper = details.Deserialize<AddInDataWrapper>(JsonOptions);
                    if (wrapper != null)
                        wrappers.Add(wrapper);
                }
            }
            catch
            {
                // Skip malformed entries
            }
        }

        return wrappers;
    }
}
