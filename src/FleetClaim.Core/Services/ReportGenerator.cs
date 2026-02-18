using FleetClaim.Core.Models;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;
using Geotab.Checkmate.ObjectModel.Exceptions;

namespace FleetClaim.Core.Services;

public interface IReportGenerator
{
    Task<IncidentReport> GenerateReportAsync(
        API api,
        ExceptionEvent incident,
        string database,
        CancellationToken ct = default);
}

public class ReportGenerator : IReportGenerator
{
    private readonly IIncidentCollector _collector;
    private readonly IPdfRenderer _pdfRenderer;
    private readonly IShareLinkService? _shareLinkService;
    private readonly TimeSpan _windowBefore = TimeSpan.FromMinutes(5);
    private readonly TimeSpan _windowAfter = TimeSpan.FromMinutes(5);
    
    public ReportGenerator(
        IIncidentCollector collector, 
        IPdfRenderer pdfRenderer,
        IShareLinkService? shareLinkService = null)
    {
        _collector = collector;
        _pdfRenderer = pdfRenderer;
        _shareLinkService = shareLinkService;
    }
    
    public async Task<IncidentReport> GenerateReportAsync(
        API api,
        ExceptionEvent incident,
        string database,
        CancellationToken ct = default)
    {
        // Collect evidence
        var evidence = await _collector.CollectEvidenceAsync(
            api, incident, _windowBefore, _windowAfter, ct);
        
        // Get vehicle details
        var vehicles = await api.CallAsync<List<Device>>("Get", typeof(Device), new
        {
            search = new DeviceSearch { Id = incident.Device!.Id }
        }, ct);
        var vehicle = vehicles?.FirstOrDefault();
        
        // Get driver details if available
        string? driverName = null;
        if (incident.Driver?.Id != null)
        {
            var drivers = await api.CallAsync<List<Driver>>("Get", typeof(Driver), new
            {
                search = new UserSearch { Id = incident.Driver.Id }
            }, ct);
            driverName = drivers?.FirstOrDefault()?.Name;
        }
        
        // Determine severity
        var severity = DetermineSeverity(incident, evidence);
        
        // Build summary
        var summary = BuildSummary(incident, vehicle, evidence);
        
        var report = new IncidentReport
        {
            IncidentId = incident.Id?.ToString() ?? "",
            VehicleId = incident.Device.Id?.ToString() ?? "",
            VehicleName = vehicle?.Name,
            DriverId = incident.Driver?.Id?.ToString(),
            DriverName = driverName,
            OccurredAt = incident.ActiveFrom ?? DateTime.UtcNow,
            Severity = severity,
            Summary = summary,
            Evidence = evidence
        };
        
        // Generate share URL (before PDF so it can be included in the document)
        if (_shareLinkService != null)
        {
            report.ShareUrl = _shareLinkService.GenerateShareUrl(report.Id, database);
        }
        
        // Generate PDF
        report.PdfBase64 = await _pdfRenderer.RenderPdfAsync(report, ct);
        
        return report;
    }
    
    private static IncidentSeverity DetermineSeverity(ExceptionEvent incident, EvidencePackage evidence)
    {
        // High deceleration = more severe
        if (evidence.DecelerationMps2.HasValue && Math.Abs(evidence.DecelerationMps2.Value) > 8)
            return IncidentSeverity.Critical;
        
        if (evidence.DecelerationMps2.HasValue && Math.Abs(evidence.DecelerationMps2.Value) > 5)
            return IncidentSeverity.High;
        
        // High speed at event = more severe
        if (evidence.SpeedAtEventKmh > 100)
            return IncidentSeverity.High;
        
        if (evidence.SpeedAtEventKmh > 60)
            return IncidentSeverity.Medium;
        
        return IncidentSeverity.Low;
    }
    
    private static string BuildSummary(ExceptionEvent incident, Device? vehicle, EvidencePackage evidence)
    {
        var sb = new System.Text.StringBuilder();
        
        // Event type and vehicle
        var eventType = incident.Rule?.Name ?? "Incident";
        var vehicleName = vehicle?.Name ?? "Unknown vehicle";
        var eventTime = incident.DateTime ?? DateTime.UtcNow;
        
        sb.Append($"{eventType} detected for {vehicleName} on {eventTime:MMMM d, yyyy} at {eventTime:h:mm tt} UTC. ");
        
        // Speed context
        if (evidence.SpeedAtEventKmh.HasValue)
        {
            var speedDesc = evidence.SpeedAtEventKmh switch
            {
                > 100 => "traveling at high speed",
                > 60 => "traveling at moderate speed",
                > 30 => "traveling at low speed",
                _ => "traveling slowly or stationary"
            };
            sb.Append($"Vehicle was {speedDesc} ({evidence.SpeedAtEventKmh:F0} km/h). ");
        }
        
        // Deceleration (hard braking indicator)
        if (evidence.DecelerationMps2.HasValue && evidence.DecelerationMps2 > 3)
        {
            var brakingDesc = evidence.DecelerationMps2 switch
            {
                > 8 => "extreme braking",
                > 5 => "hard braking",
                _ => "moderate braking"
            };
            sb.Append($"Data shows {brakingDesc} ({evidence.DecelerationMps2:F1} m/s²). ");
        }
        
        // Weather conditions
        if (!string.IsNullOrEmpty(evidence.WeatherCondition))
        {
            var weatherLower = evidence.WeatherCondition.ToLower();
            var weatherNote = weatherLower switch
            {
                var w when w.Contains("rain") || w.Contains("snow") || w.Contains("ice") => 
                    $"Weather conditions were adverse ({evidence.WeatherCondition}), which may have been a contributing factor. ",
                var w when w.Contains("clear") || w.Contains("sunny") => 
                    $"Weather conditions were clear at the time of the incident. ",
                _ => $"Weather: {evidence.WeatherCondition}. "
            };
            sb.Append(weatherNote);
        }
        
        // GPS data availability
        if (evidence.GpsTrail.Count > 0)
        {
            sb.Append($"GPS trail captured with {evidence.GpsTrail.Count} data points for route analysis.");
        }
        
        return sb.ToString().Trim();
    }
}

public interface IPdfRenderer
{
    Task<string> RenderPdfAsync(IncidentReport report, CancellationToken ct = default);
}
