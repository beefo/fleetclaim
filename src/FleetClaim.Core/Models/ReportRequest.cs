using System.Text.Json.Serialization;

namespace FleetClaim.Core.Models;

public class ReportRequest
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = $"req_{Guid.NewGuid():N}"[..16];
    
    // New: Device + date range based request
    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = "";
    
    [JsonPropertyName("deviceName")]
    public string? DeviceName { get; set; }
    
    [JsonPropertyName("fromDate")]
    public DateTime FromDate { get; set; }
    
    [JsonPropertyName("toDate")]
    public DateTime ToDate { get; set; }
    
    // Legacy: specific incident ID (still supported)
    [JsonPropertyName("incidentId")]
    public string? IncidentId { get; set; }
    
    [JsonPropertyName("requestedBy")]
    public string? RequestedBy { get; set; }
    
    [JsonPropertyName("requestedAt")]
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    
    [JsonPropertyName("status")]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public ReportRequestStatus Status { get; set; } = ReportRequestStatus.Pending;
    
    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; set; }
    
    // Results
    [JsonPropertyName("incidentsFound")]
    public int? IncidentsFound { get; set; }
    
    [JsonPropertyName("reportsGenerated")]
    public int? ReportsGenerated { get; set; }
}

public enum ReportRequestStatus
{
    Pending,
    Processing,
    Completed,
    Failed
}
