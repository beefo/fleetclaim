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
    // GPS & Location
    public List<GpsPoint> GpsTrail { get; set; } = [];
    
    // Speed Analysis (Insurance-critical)
    public double? MaxSpeedKmh { get; set; }
    public double? SpeedAtEventKmh { get; set; }
    public double? AvgSpeedKmh { get; set; }
    public double? SpeedLimitKmh { get; set; }
    public bool? ExceedingSpeedLimit { get; set; }
    
    // G-Force / Accelerometer Data (Insurance-critical for impact analysis)
    public double? DecelerationMps2 { get; set; }
    public double? MaxGForce { get; set; }
    public double? ImpactGForce { get; set; }
    public string? ImpactDirection { get; set; }  // Front, Rear, Left, Right, Rollover
    public List<AccelerometerEvent> AccelerometerEvents { get; set; } = [];
    
    // Hard Events Leading Up To Incident (shows driver behavior)
    public List<HardEvent> HardEventsBeforeIncident { get; set; } = [];
    
    // Environmental Conditions
    public string? WeatherCondition { get; set; }
    public double? TemperatureCelsius { get; set; }
    public string? RoadCondition { get; set; }
    public string? LightCondition { get; set; }  // Daylight, Dusk, Dawn, Night
    public double? VisibilityKm { get; set; }
    public double? WindSpeedKmh { get; set; }
    public double? PrecipitationMm { get; set; }
    
    // Vehicle Status at Time of Incident
    public List<DiagnosticSnapshot> Diagnostics { get; set; } = [];
    public bool? SeatbeltFastened { get; set; }
    public bool? HeadlightsOn { get; set; }
    public double? FuelLevelPercent { get; set; }
    public double? BatteryVoltage { get; set; }
    public int? EngineRpm { get; set; }
    public string? TransmissionGear { get; set; }
    public bool? AbsActivated { get; set; }
    public bool? TractionControlActivated { get; set; }
    public bool? StabilityControlActivated { get; set; }
    
    // Driver Status
    public HosStatus? DriverHosStatus { get; set; }
    public double? DriverSafetyScore { get; set; }  // 0-100 score from Geotab
    public int? DriverIncidentCountLast30Days { get; set; }
    public TimeSpan? TimeDrivingBeforeIncident { get; set; }
    
    // Vehicle Maintenance Status
    public bool? MaintenanceOverdue { get; set; }
    public List<MaintenanceItem> OverdueMaintenanceItems { get; set; } = [];
    public DateTime? LastMaintenanceDate { get; set; }
    
    // Photo URLs/references (for future photo upload feature)
    public List<string> PhotoUrls { get; set; } = [];
}

/// <summary>
/// Accelerometer reading at a point in time (g-force data).
/// Used for impact analysis and accident reconstruction.
/// </summary>
public class AccelerometerEvent
{
    public DateTime Timestamp { get; set; }
    public double GForceX { get; set; }  // Lateral (left/right)
    public double GForceY { get; set; }  // Longitudinal (accel/brake)
    public double GForceZ { get; set; }  // Vertical
    public double TotalGForce { get; set; }
    public string? EventType { get; set; }  // HardBrake, HardAccel, HardCornering, Impact
}

/// <summary>
/// Hard driving events detected before the incident.
/// Useful for showing driver behavior leading up to the collision.
/// </summary>
public class HardEvent
{
    public DateTime Timestamp { get; set; }
    public string EventType { get; set; } = "";  // HardBrake, HardAcceleration, HardCorneringLeft, HardCorneringRight
    public double? GForce { get; set; }
    public double? SpeedKmh { get; set; }
    public double? DurationSeconds { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
}

/// <summary>
/// Vehicle maintenance item status.
/// </summary>
public class MaintenanceItem
{
    public string Name { get; set; } = "";  // Oil Change, Brake Inspection, Tire Rotation
    public DateTime? DueDate { get; set; }
    public int? DueOdometerKm { get; set; }
    public int? OverdueByKm { get; set; }
    public int? OverdueByDays { get; set; }
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
