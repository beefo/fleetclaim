namespace FleetClaim.Core.Models;

public class ReportRequest
{
    public string Id { get; set; } = $"req_{Guid.NewGuid():N}"[..16];
    
    // New: Device + date range based request
    public string DeviceId { get; set; } = "";
    public string? DeviceName { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    
    // Legacy: specific incident ID (still supported)
    public string? IncidentId { get; set; }
    
    public string? RequestedBy { get; set; }
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public ReportRequestStatus Status { get; set; } = ReportRequestStatus.Pending;
    public string? ErrorMessage { get; set; }
    
    // Results
    public int? IncidentsFound { get; set; }
    public int? ReportsGenerated { get; set; }
}

public enum ReportRequestStatus
{
    Pending,
    Processing,
    Completed,
    Failed
}
