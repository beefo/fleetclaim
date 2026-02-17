using System.Text.Json;
using FleetClaim.Core.Models;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;

namespace FleetClaim.Core.Geotab;

public interface IAddInDataRepository
{
    Task<List<IncidentReport>> GetReportsAsync(API api, DateTime? since = null, CancellationToken ct = default);
    Task<List<ReportRequest>> GetPendingRequestsAsync(API api, CancellationToken ct = default);
    Task<CustomerConfig?> GetConfigAsync(API api, CancellationToken ct = default);
    
    Task SaveReportAsync(API api, IncidentReport report, CancellationToken ct = default);
    Task SaveRequestAsync(API api, ReportRequest request, CancellationToken ct = default);
    Task UpdateRequestStatusAsync(API api, string requestId, ReportRequestStatus status, string? error = null, CancellationToken ct = default);
}

public class AddInDataRepository : IAddInDataRepository
{
    // Add-In ID must be a GUID for MyGeotab AddInData
    private const string AddInIdValue = "1de32f8e-8401-4df2-930e-8751f2d66ba7";
    
    public async Task<List<IncidentReport>> GetReportsAsync(API api, DateTime? since = null, CancellationToken ct = default)
    {
        var allData = await GetAllAddInDataAsync(api, ct);
        
        return allData
            .Where(w => w.Type == "report")
            .Select(w => w.GetPayload<IncidentReport>())
            .Where(r => r != null && (since == null || r.GeneratedAt >= since))
            .Cast<IncidentReport>()
            .OrderByDescending(r => r.OccurredAt)
            .ToList();
    }
    
    public async Task<List<ReportRequest>> GetPendingRequestsAsync(API api, CancellationToken ct = default)
    {
        var allData = await GetAllAddInDataAsync(api, ct);
        
        return allData
            .Where(w => w.Type == "reportRequest")
            .Select(w => w.GetPayload<ReportRequest>())
            .Where(r => r != null && r.Status == ReportRequestStatus.Pending)
            .Cast<ReportRequest>()
            .OrderBy(r => r.RequestedAt)
            .ToList();
    }
    
    public async Task<CustomerConfig?> GetConfigAsync(API api, CancellationToken ct = default)
    {
        var allData = await GetAllAddInDataAsync(api, ct);
        
        return allData
            .FirstOrDefault(w => w.Type == "config")
            ?.GetPayload<CustomerConfig>();
    }
    
    public async Task SaveReportAsync(API api, IncidentReport report, CancellationToken ct = default)
    {
        var wrapper = AddInDataWrapper.ForReport(report);
        await SaveAddInDataAsync(api, wrapper, ct);
    }
    
    public async Task SaveRequestAsync(API api, ReportRequest request, CancellationToken ct = default)
    {
        var wrapper = AddInDataWrapper.ForRequest(request);
        await SaveAddInDataAsync(api, wrapper, ct);
    }
    
    public async Task UpdateRequestStatusAsync(API api, string requestId, ReportRequestStatus status, string? error = null, CancellationToken ct = default)
    {
        // Fetch existing request
        var requests = await GetPendingRequestsAsync(api, ct);
        var request = requests.FirstOrDefault(r => r.Id == requestId);
        
        if (request == null) return;
        
        request.Status = status;
        request.ErrorMessage = error;
        
        await SaveRequestAsync(api, request, ct);
    }
    
    private async Task<List<AddInDataWrapper>> GetAllAddInDataAsync(API api, CancellationToken ct)
    {
        // Use dynamic to work with AddInData's Details property
        var results = await api.CallAsync<List<object>>("Get", typeof(AddInData), new
        {
            search = new { addInId = AddInIdValue }
        }, ct);
        
        if (results == null || results.Count == 0)
            return [];
        
        var wrappers = new List<AddInDataWrapper>();
        
        foreach (var item in results)
        {
            try
            {
                // Serialize and deserialize to get at the Details
                var json = JsonSerializer.Serialize(item);
                using var doc = JsonDocument.Parse(json);
                
                if (doc.RootElement.TryGetProperty("details", out var details) ||
                    doc.RootElement.TryGetProperty("Details", out details))
                {
                    var wrapper = details.Deserialize<AddInDataWrapper>();
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
    
    private async Task SaveAddInDataAsync(API api, AddInDataWrapper wrapper, CancellationToken ct)
    {
        // Use anonymous object matching AddInData structure
        var entity = new
        {
            addInId = AddInIdValue,
            details = wrapper
        };
        
        await api.CallAsync<object>("Add", typeof(AddInData), new { entity }, ct);
    }
}
