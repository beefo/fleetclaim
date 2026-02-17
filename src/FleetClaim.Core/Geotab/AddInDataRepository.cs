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
    Task UpdateRequestStatusAsync(API api, string requestId, ReportRequestStatus status, string? error = null, int? incidentsFound = null, int? reportsGenerated = null, CancellationToken ct = default);
}

/// <summary>
/// Internal record to track AddInData with its Geotab record ID
/// </summary>
internal record AddInDataRecord(string GeotabId, AddInDataWrapper Wrapper);

public class AddInDataRepository : IAddInDataRepository
{
    // Add-In ID for MyGeotab AddInData
    private const string AddInIdValue = "aji_jHQGE8k2TDodR8tZrpw";
    
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };
    
    public async Task<List<IncidentReport>> GetReportsAsync(API api, DateTime? since = null, CancellationToken ct = default)
    {
        var allData = await GetAllAddInDataAsync(api, ct);
        
        return allData
            .Where(r => r.Wrapper.Type == "report")
            .Select(r => r.Wrapper.GetPayload<IncidentReport>())
            .Where(r => r != null && (since == null || r.GeneratedAt >= since))
            .Cast<IncidentReport>()
            .OrderByDescending(r => r.OccurredAt)
            .ToList();
    }
    
    public async Task<List<ReportRequest>> GetPendingRequestsAsync(API api, CancellationToken ct = default)
    {
        var allData = await GetAllAddInDataAsync(api, ct);
        
        return allData
            .Where(r => r.Wrapper.Type == "reportRequest")
            .Select(r => r.Wrapper.GetPayload<ReportRequest>())
            .Where(r => r != null && r.Status == ReportRequestStatus.Pending)
            .Cast<ReportRequest>()
            .OrderBy(r => r.RequestedAt)
            .ToList();
    }
    
    public async Task<CustomerConfig?> GetConfigAsync(API api, CancellationToken ct = default)
    {
        var allData = await GetAllAddInDataAsync(api, ct);
        
        return allData
            .FirstOrDefault(r => r.Wrapper.Type == "config")
            ?.Wrapper.GetPayload<CustomerConfig>();
    }
    
    public async Task SaveReportAsync(API api, IncidentReport report, CancellationToken ct = default)
    {
        var wrapper = AddInDataWrapper.ForReport(report);
        await AddNewRecordAsync(api, wrapper, ct);
    }
    
    public async Task SaveRequestAsync(API api, ReportRequest request, CancellationToken ct = default)
    {
        var wrapper = AddInDataWrapper.ForRequest(request);
        await AddNewRecordAsync(api, wrapper, ct);
    }
    
    public async Task UpdateRequestStatusAsync(
        API api, 
        string requestId, 
        ReportRequestStatus status, 
        string? error = null,
        int? incidentsFound = null,
        int? reportsGenerated = null,
        CancellationToken ct = default)
    {
        // Find the existing record with its Geotab ID
        var allData = await GetAllAddInDataAsync(api, ct);
        
        var record = allData.FirstOrDefault(r => 
            r.Wrapper.Type == "reportRequest" && 
            r.Wrapper.GetPayload<ReportRequest>()?.Id == requestId);
        
        if (record == null) return;
        
        var request = record.Wrapper.GetPayload<ReportRequest>();
        if (request == null) return;
        
        // Update the request
        request.Status = status;
        request.ErrorMessage = error;
        if (incidentsFound.HasValue) request.IncidentsFound = incidentsFound;
        if (reportsGenerated.HasValue) request.ReportsGenerated = reportsGenerated;
        
        // Update the existing record using Set
        var wrapper = AddInDataWrapper.ForRequest(request);
        await UpdateExistingRecordAsync(api, record.GeotabId, wrapper, ct);
    }
    
    private async Task<List<AddInDataRecord>> GetAllAddInDataAsync(API api, CancellationToken ct)
    {
        var results = await api.CallAsync<List<object>>("Get", typeof(AddInData), new
        {
            search = new { addInId = AddInIdValue }
        }, ct);
        
        if (results == null || results.Count == 0)
            return [];
        
        var records = new List<AddInDataRecord>();
        
        foreach (var item in results)
        {
            try
            {
                var json = JsonSerializer.Serialize(item);
                using var doc = JsonDocument.Parse(json);
                
                // Get the Geotab record ID
                string? geotabId = null;
                if (doc.RootElement.TryGetProperty("id", out var idElement))
                    geotabId = idElement.GetString();
                
                if (string.IsNullOrEmpty(geotabId)) continue;
                
                // Get the details/wrapper
                if (doc.RootElement.TryGetProperty("details", out var details) ||
                    doc.RootElement.TryGetProperty("Details", out details))
                {
                    var wrapper = details.Deserialize<AddInDataWrapper>(JsonOptions);
                    if (wrapper != null)
                        records.Add(new AddInDataRecord(geotabId, wrapper));
                }
            }
            catch
            {
                // Skip malformed entries
            }
        }
        
        return records;
    }
    
    private async Task AddNewRecordAsync(API api, AddInDataWrapper wrapper, CancellationToken ct)
    {
        var entity = new
        {
            addInId = AddInIdValue,
            details = wrapper
        };
        
        await api.CallAsync<object>("Add", typeof(AddInData), new { entity }, ct);
    }
    
    private async Task UpdateExistingRecordAsync(API api, string geotabId, AddInDataWrapper wrapper, CancellationToken ct)
    {
        var entity = new
        {
            id = geotabId,
            addInId = AddInIdValue,
            details = wrapper
        };
        
        await api.CallAsync<object>("Set", typeof(AddInData), new { entity }, ct);
    }
}
