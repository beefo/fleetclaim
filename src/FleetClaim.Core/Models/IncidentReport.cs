namespace FleetClaim.Core.Models;

public class IncidentReport
{
    public string Id { get; set; } = $"rpt_{Guid.NewGuid():N}"[..16];
    public string IncidentId { get; set; } = "";
    
    // Vehicle Information (Insurance-Required)
    public string VehicleId { get; set; } = "";
    public string? VehicleName { get; set; }
    public string? VehicleVin { get; set; }
    public string? VehiclePlate { get; set; }
    public string? VehicleYear { get; set; }
    public string? VehicleMake { get; set; }
    public string? VehicleModel { get; set; }
    public int? OdometerKm { get; set; }
    
    // Driver Information (Insurance-Required)
    public string? DriverId { get; set; }
    public string? DriverName { get; set; }
    public string? DriverLicenseNumber { get; set; }
    public string? DriverLicenseState { get; set; }
    public string? DriverPhone { get; set; }
    public string? DriverEmail { get; set; }
    
    // Incident Details
    public DateTime OccurredAt { get; set; }
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public IncidentSeverity Severity { get; set; } = IncidentSeverity.Medium;
    public string Summary { get; set; } = "";
    
    // Location (derived from GPS but explicit for insurance)
    public string? IncidentAddress { get; set; }
    public string? IncidentCity { get; set; }
    public string? IncidentState { get; set; }
    public string? IncidentCountry { get; set; }
    
    // Police & Official Reports
    public string? PoliceReportNumber { get; set; }
    public string? PoliceAgency { get; set; }
    public DateTime? PoliceReportDate { get; set; }
    
    // Damage Information
    public string? DamageDescription { get; set; }
    public DamageSeverity? DamageLevel { get; set; }
    public bool? VehicleDriveable { get; set; }
    public bool? AirbagDeployed { get; set; }
    
    // Witness Information
    public List<WitnessInfo> Witnesses { get; set; } = [];
    
    // Third-Party Information (other vehicles/persons involved)
    public List<ThirdPartyInfo> ThirdParties { get; set; } = [];
    
    // Injury Information
    public bool? InjuriesReported { get; set; }
    public string? InjuryDescription { get; set; }
    
    // Evidence & Telematics
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

public enum DamageSeverity
{
    None,
    Minor,      // Cosmetic damage, fully driveable
    Moderate,   // Functional damage, may need repair
    Severe,     // Major damage, unsafe to drive
    TotalLoss   // Vehicle likely totaled
}

/// <summary>
/// Witness contact information for insurance claims.
/// </summary>
public class WitnessInfo
{
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Statement { get; set; }
}

/// <summary>
/// Information about other vehicles/drivers involved in the incident.
/// </summary>
public class ThirdPartyInfo
{
    // Vehicle
    public string? VehiclePlate { get; set; }
    public string? VehicleMake { get; set; }
    public string? VehicleModel { get; set; }
    public string? VehicleColor { get; set; }
    public string? VehicleVin { get; set; }
    
    // Driver
    public string? DriverName { get; set; }
    public string? DriverPhone { get; set; }
    public string? DriverLicense { get; set; }
    public string? DriverLicenseState { get; set; }
    
    // Insurance
    public string? InsuranceCompany { get; set; }
    public string? InsurancePolicyNumber { get; set; }
    public string? InsuranceClaimNumber { get; set; }
    
    // Owner (if different from driver)
    public string? OwnerName { get; set; }
    public string? OwnerPhone { get; set; }
    public string? OwnerAddress { get; set; }
}

public class EvidencePackage
{
    public List<GpsPoint> GpsTrail { get; set; } = [];
    public double? MaxSpeedKmh { get; set; }
    public double? SpeedAtEventKmh { get; set; }
    public double? DecelerationMps2 { get; set; }
    public string? WeatherCondition { get; set; }
    public double? TemperatureCelsius { get; set; }
    public string? RoadCondition { get; set; }
    public string? LightCondition { get; set; }  // Daylight, Dusk, Night, etc.
    public List<DiagnosticSnapshot> Diagnostics { get; set; } = [];
    public HosStatus? DriverHosStatus { get; set; }
    
    // Photo URLs/references (for future photo upload feature)
    public List<string> PhotoUrls { get; set; } = [];
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
