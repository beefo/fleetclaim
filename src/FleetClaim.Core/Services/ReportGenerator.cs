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
        var parts = new List<string>();
        
        // Event type
        var eventType = incident.Rule?.Name ?? "Incident";
        parts.Add(eventType);
        
        // Vehicle
        if (vehicle != null)
            parts.Add($"involving {vehicle.Name}");
        
        // Speed context
        if (evidence.SpeedAtEventKmh.HasValue)
            parts.Add($"at {evidence.SpeedAtEventKmh:F0} km/h");
        
        // Weather
        if (!string.IsNullOrEmpty(evidence.WeatherCondition))
            parts.Add($"({evidence.WeatherCondition} conditions)");
        
        return string.Join(" ", parts);
    }
}

public interface IPdfRenderer
{
    Task<string> RenderPdfAsync(IncidentReport report, CancellationToken ct = default);
}
