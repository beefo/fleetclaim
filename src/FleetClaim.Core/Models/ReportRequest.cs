namespace FleetClaim.Core.Models;

public class ReportRequest
{
    public string Id { get; set; } = $"req_{Guid.NewGuid():N}"[..16];
    public string IncidentId { get; set; } = "";
    public string? RequestedBy { get; set; }
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public ReportRequestStatus Status { get; set; } = ReportRequestStatus.Pending;
    public string? ErrorMessage { get; set; }
}

public enum ReportRequestStatus
{
    Pending,
    Processing,
    Completed,
    Failed
}
