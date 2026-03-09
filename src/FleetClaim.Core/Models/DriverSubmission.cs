namespace FleetClaim.Core.Models;

/// <summary>
/// Data captured by drivers at the scene of an incident via the Drive Add-In.
/// Stored in Geotab AddInData as type "driverSubmission".
/// </summary>
public class DriverSubmission
{
    public string Id { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string? DeviceName { get; set; }
    public string? DriverId { get; set; }
    public string? DriverName { get; set; }
    public DateTime IncidentTimestamp { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? LocationAddress { get; set; }
    public string? Description { get; set; }
    public IncidentSeverity? Severity { get; set; }
    public string? DamageDescription { get; set; }
    public DamageSeverity? DamageLevel { get; set; }
    public bool? VehicleDriveable { get; set; }
    public decimal? EstimatedRepairCost { get; set; }
    public List<ThirdPartyInfo> ThirdParties { get; set; } = [];
    public string? PoliceReportNumber { get; set; }
    public string? PoliceAgency { get; set; }
    public bool? InjuriesReported { get; set; }
    public string? InjuryDescription { get; set; }
    public string? Notes { get; set; }
    public List<PhotoAttachment> Photos { get; set; } = [];
    public string Status { get; set; } = "synced";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public string? MergedIntoReportId { get; set; }

    // Third-party info stored inline (from Drive Add-In's simpler structure)
    public string? OtherDriverName { get; set; }
    public string? OtherDriverPhone { get; set; }
    public string? OtherDriverInsurance { get; set; }
    public string? OtherDriverPolicyNumber { get; set; }
    public string? OtherVehicleMake { get; set; }
    public string? OtherVehicleModel { get; set; }
    public string? OtherVehiclePlate { get; set; }
    public string? OtherVehicleColor { get; set; }
    public string? Witnesses { get; set; }
}
