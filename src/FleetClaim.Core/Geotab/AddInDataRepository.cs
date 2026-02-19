using System.Text.Json;
using FleetClaim.Core.Models;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;

namespace FleetClaim.Core.Geotab;

public interface IAddInDataRepository
{
    Task<List<IncidentReport>> GetReportsAsync(API api, DateTime? since = null, CancellationToken ct = default);
    Task<List<ReportRequest>> GetPendingRequestsAsync(API api, CancellationToken ct = default);
    Task<List<ReportRequest>> GetStaleRequestsAsync(API api, TimeSpan timeout, CancellationToken ct = default);
    Task<CustomerConfig?> GetConfigAsync(API api, CancellationToken ct = default);
    
    Task SaveReportAsync(API api, IncidentReport report, CancellationToken ct = default);
    Task SaveRequestAsync(API api, ReportRequest request, CancellationToken ct = default);
    Task UpdateRequestStatusAsync(API api, string requestId, ReportRequestStatus status, string? error = null, int? incidentsFound = null, int? reportsGenerated = null, string? errorMessage = null, CancellationToken ct = default);
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
    
    public async Task<List<ReportRequest>> GetStaleRequestsAsync(API api, TimeSpan timeout, CancellationToken ct = default)
    {
        var allData = await GetAllAddInDataAsync(api, ct);
        var cutoff = DateTime.UtcNow - timeout;
        
        return allData
            .Where(r => r.Wrapper.Type == "reportRequest")
            .Select(r => r.Wrapper.GetPayload<ReportRequest>())
            .Where(r => r != null 
                && r.Status == ReportRequestStatus.Processing 
                && r.RequestedAt < cutoff)
            .Cast<ReportRequest>()
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
        // Compact the report to fit within AddInData 10KB limit
        var compactedReport = CompactReportForStorage(report);
        var wrapper = AddInDataWrapper.ForReport(compactedReport);
        await AddNewRecordAsync(api, wrapper, ct);
    }
    
    /// <summary>
    /// Compacts a report to fit within AddInData's 10KB limit.
    /// Full data is available via on-demand PDF generation.
    /// </summary>
    private static IncidentReport CompactReportForStorage(IncidentReport report)
    {
        // Create a shallow copy to avoid modifying the original
        var compact = new IncidentReport
        {
            Id = report.Id,
            IncidentId = report.IncidentId,
            VehicleId = report.VehicleId,
            VehicleName = report.VehicleName,
            VehicleVin = report.VehicleVin,
            VehiclePlate = report.VehiclePlate,
            VehicleYear = report.VehicleYear,
            VehicleMake = report.VehicleMake,
            VehicleModel = report.VehicleModel,
            OdometerKm = report.OdometerKm,
            DriverId = report.DriverId,
            DriverName = report.DriverName,
            DriverLicenseNumber = report.DriverLicenseNumber,
            DriverLicenseState = report.DriverLicenseState,
            DriverPhone = report.DriverPhone,
            DriverEmail = report.DriverEmail,
            OccurredAt = report.OccurredAt,
            GeneratedAt = report.GeneratedAt,
            Severity = report.Severity,
            Summary = report.Summary,
            IncidentAddress = report.IncidentAddress,
            IncidentCity = report.IncidentCity,
            IncidentState = report.IncidentState,
            IncidentCountry = report.IncidentCountry,
            PoliceReportNumber = report.PoliceReportNumber,
            PoliceAgency = report.PoliceAgency,
            PoliceReportDate = report.PoliceReportDate,
            DamageDescription = report.DamageDescription,
            DamageLevel = report.DamageLevel,
            VehicleDriveable = report.VehicleDriveable,
            AirbagDeployed = report.AirbagDeployed,
            Witnesses = report.Witnesses,
            ThirdParties = report.ThirdParties,
            InjuriesReported = report.InjuriesReported,
            InjuryDescription = report.InjuryDescription,
            ShareUrl = report.ShareUrl,
            IsBaselineReport = report.IsBaselineReport,
            Notes = report.Notes,
            NotesUpdatedAt = report.NotesUpdatedAt,
            NotesUpdatedBy = report.NotesUpdatedBy,
            // Don't store PdfBase64 in AddInData - it's generated on demand
            PdfBase64 = null
        };
        
        // Compact the evidence package
        if (report.Evidence != null)
        {
            compact.Evidence = new EvidencePackage
            {
                // Keep speed metrics (small)
                MaxSpeedKmh = report.Evidence.MaxSpeedKmh,
                SpeedAtEventKmh = report.Evidence.SpeedAtEventKmh,
                AvgSpeedKmh = report.Evidence.AvgSpeedKmh,
                SpeedLimitKmh = report.Evidence.SpeedLimitKmh,
                ExceedingSpeedLimit = report.Evidence.ExceedingSpeedLimit,
                
                // Keep G-force summary (small)
                DecelerationMps2 = report.Evidence.DecelerationMps2,
                MaxGForce = report.Evidence.MaxGForce,
                ImpactGForce = report.Evidence.ImpactGForce,
                ImpactDirection = report.Evidence.ImpactDirection,
                
                // Keep weather/conditions (small)
                WeatherCondition = report.Evidence.WeatherCondition,
                TemperatureCelsius = report.Evidence.TemperatureCelsius,
                RoadCondition = report.Evidence.RoadCondition,
                LightCondition = report.Evidence.LightCondition,
                VisibilityKm = report.Evidence.VisibilityKm,
                WindSpeedKmh = report.Evidence.WindSpeedKmh,
                PrecipitationMm = report.Evidence.PrecipitationMm,
                
                // Keep vehicle status flags (small)
                SeatbeltFastened = report.Evidence.SeatbeltFastened,
                HeadlightsOn = report.Evidence.HeadlightsOn,
                FuelLevelPercent = report.Evidence.FuelLevelPercent,
                BatteryVoltage = report.Evidence.BatteryVoltage,
                EngineRpm = report.Evidence.EngineRpm,
                TransmissionGear = report.Evidence.TransmissionGear,
                AbsActivated = report.Evidence.AbsActivated,
                TractionControlActivated = report.Evidence.TractionControlActivated,
                StabilityControlActivated = report.Evidence.StabilityControlActivated,
                
                // Keep driver status (small)
                DriverHosStatus = report.Evidence.DriverHosStatus,
                DriverSafetyScore = report.Evidence.DriverSafetyScore,
                DriverIncidentCountLast30Days = report.Evidence.DriverIncidentCountLast30Days,
                TimeDrivingBeforeIncident = report.Evidence.TimeDrivingBeforeIncident,
                
                // Keep maintenance flags (small)
                MaintenanceOverdue = report.Evidence.MaintenanceOverdue,
                LastMaintenanceDate = report.Evidence.LastMaintenanceDate,
                
                // Photo references only (IDs, not data)
                Photos = report.Evidence.Photos,
                PhotoUrls = report.Evidence.PhotoUrls,
                
                // LIMIT GPS trail to 20 points (covers key moments)
                GpsTrail = report.Evidence.GpsTrail?.Count > 0 
                    ? SampleGpsTrail(report.Evidence.GpsTrail, 20, report.OccurredAt)
                    : [],
                
                // LIMIT hard events to 5 most recent before incident
                HardEventsBeforeIncident = report.Evidence.HardEventsBeforeIncident?
                    .OrderByDescending(e => e.Timestamp)
                    .Take(5)
                    .ToList() ?? [],
                
                // LIMIT accelerometer events to 5 around incident
                AccelerometerEvents = report.Evidence.AccelerometerEvents?
                    .OrderBy(e => Math.Abs((e.Timestamp - report.OccurredAt).TotalSeconds))
                    .Take(5)
                    .ToList() ?? [],
                
                // LIMIT diagnostics to 10 most relevant
                Diagnostics = report.Evidence.Diagnostics?.Take(10).ToList() ?? [],
                
                // LIMIT overdue maintenance to 3 items
                OverdueMaintenanceItems = report.Evidence.OverdueMaintenanceItems?.Take(3).ToList() ?? []
            };
        }
        
        return compact;
    }
    
    /// <summary>
    /// Samples GPS trail to include start, end, incident point, and evenly distributed points.
    /// </summary>
    private static List<GpsPoint> SampleGpsTrail(List<GpsPoint> trail, int maxPoints, DateTime occurredAt)
    {
        if (trail.Count <= maxPoints) return trail;
        
        var result = new List<GpsPoint>();
        
        // Always include first and last
        result.Add(trail[0]);
        
        // Find and include incident point
        var incidentPoint = trail
            .OrderBy(p => Math.Abs((p.Timestamp - occurredAt).TotalSeconds))
            .First();
        
        // Sample evenly distributed points
        var step = trail.Count / (maxPoints - 3); // -3 for first, last, incident
        for (int i = step; i < trail.Count - 1; i += step)
        {
            if (result.Count >= maxPoints - 2) break;
            var point = trail[i];
            if (point != incidentPoint) // Don't duplicate incident point
                result.Add(point);
        }
        
        // Add incident point if not already included
        if (!result.Contains(incidentPoint))
            result.Add(incidentPoint);
        
        // Add last point
        result.Add(trail[^1]);
        
        // Sort by timestamp
        return result.OrderBy(p => p.Timestamp).ToList();
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
        string? errorMessage = null,
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
        request.ErrorMessage = error ?? errorMessage;
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
        // AddInData doesn't support Set properly - use Remove then Add pattern
        // First remove the old record
        await api.CallAsync<object>("Remove", typeof(AddInData), new { entity = new { id = geotabId } }, ct);
        
        // Then add the updated record
        await AddNewRecordAsync(api, wrapper, ct);
    }
}
