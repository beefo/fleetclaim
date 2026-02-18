namespace FleetClaim.Core.Models;

public class IncidentReport
{
    public string Id { get; set; } = $"rpt_{Guid.NewGuid():N}"[..16];
    public string IncidentId { get; set; } = "";
    public string VehicleId { get; set; } = "";
    public string? VehicleName { get; set; }
    public string? DriverId { get; set; }
    public string? DriverName { get; set; }
    public DateTime OccurredAt { get; set; }
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public IncidentSeverity Severity { get; set; } = IncidentSeverity.Medium;
    public string Summary { get; set; } = "";
    public EvidencePackage Evidence { get; set; } = new();
    public string? PdfBase64 { get; set; }
    public string? ShareUrl { get; set; }
    
    /// <summary>
    /// True if this report was generated manually without a collision event trigger.
    /// The report contains vehicle data for the time period but no specific incident.
    /// </summary>
    public bool IsBaselineReport { get; set; } = false;
    
    /// <summary>
    /// User-provided notes about the incident. Added by fleet managers to provide 
    /// context for insurance claims (driver statement, circumstances, etc.)
    /// </summary>
    public string? Notes { get; set; }
    
    /// <summary>
    /// When notes were last updated
    /// </summary>
    public DateTime? NotesUpdatedAt { get; set; }
    
    /// <summary>
    /// Who updated the notes (email or username)
    /// </summary>
    public string? NotesUpdatedBy { get; set; }
}

public enum IncidentSeverity
{
    Low,
    Medium,
    High,
    Critical
}

public class EvidencePackage
{
    public List<GpsPoint> GpsTrail { get; set; } = [];
    public double? MaxSpeedKmh { get; set; }
    public double? SpeedAtEventKmh { get; set; }
    public double? DecelerationMps2 { get; set; }
    public string? WeatherCondition { get; set; }
    public double? TemperatureCelsius { get; set; }
    public List<DiagnosticSnapshot> Diagnostics { get; set; } = [];
    public HosStatus? DriverHosStatus { get; set; }
}

public class GpsPoint
{
    public DateTime Timestamp { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double? SpeedKmh { get; set; }
}

public class DiagnosticSnapshot
{
    public string Code { get; set; } = "";
    public string? Description { get; set; }
    public double? Value { get; set; }
    public string? Unit { get; set; }
}

public class HosStatus
{
    public string? Status { get; set; } // Driving, OnDuty, OffDuty, Sleeper
    public TimeSpan? DriveTimeRemaining { get; set; }
    public TimeSpan? DutyTimeRemaining { get; set; }
}
