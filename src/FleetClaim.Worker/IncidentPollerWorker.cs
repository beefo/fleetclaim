using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;
using Geotab.Checkmate.ObjectModel.Exceptions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetClaim.Worker;

/// <summary>
/// Background worker that polls each customer's Geotab for new incidents
/// and processes manual report requests.
/// </summary>
public class IncidentPollerWorker : BackgroundService
{
    private readonly ICredentialStore _credentialStore;
    private readonly IGeotabClientFactory _clientFactory;
    private readonly IAddInDataRepository _repository;
    private readonly IReportGenerator _reportGenerator;
    private readonly INotificationService _notificationService;
    private readonly IHostApplicationLifetime _hostLifetime;
    private readonly ILogger<IncidentPollerWorker> _logger;
    
    // Track last poll version per database (in production, persist this)
    private readonly Dictionary<string, long> _feedVersions = new();
    
    public IncidentPollerWorker(
        ICredentialStore credentialStore,
        IGeotabClientFactory clientFactory,
        IAddInDataRepository repository,
        IReportGenerator reportGenerator,
        INotificationService notificationService,
        IHostApplicationLifetime hostLifetime,
        ILogger<IncidentPollerWorker> logger)
    {
        _credentialStore = credentialStore;
        _clientFactory = clientFactory;
        _repository = repository;
        _reportGenerator = reportGenerator;
        _notificationService = notificationService;
        _hostLifetime = hostLifetime;
        _logger = logger;
    }
    
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("FleetClaim Worker starting (single-run mode for Cloud Run Jobs)");
        
        try
        {
            await PollAllDatabasesAsync(ct);
            _logger.LogInformation("FleetClaim Worker completed successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during poll cycle");
            throw; // Re-throw to fail the job
        }
        
        // Signal host to stop after single run (Cloud Run Job pattern)
        _hostLifetime.StopApplication();
    }
    
    private async Task PollAllDatabasesAsync(CancellationToken ct)
    {
        var databases = await _credentialStore.ListDatabasesAsync(ct);
        
        foreach (var database in databases)
        {
            try
            {
                await ProcessDatabaseAsync(database, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing database {Database}", database);
            }
        }
    }
    
    private async Task ProcessDatabaseAsync(string database, CancellationToken ct)
    {
        _logger.LogDebug("Processing database {Database}", database);
        
        var api = await _clientFactory.CreateClientAsync(database, ct);
        
        // Get customer config for filtering
        var config = await _repository.GetConfigAsync(api, ct) ?? new CustomerConfig();
        
        // Process new incidents
        await ProcessNewIncidentsAsync(api, database, config, ct);
        
        // Process manual report requests
        await ProcessReportRequestsAsync(api, ct);
    }
    
    private async Task ProcessNewIncidentsAsync(
        API api, string database, CustomerConfig config, CancellationToken ct)
    {
        // Get feed version for incremental polling
        _feedVersions.TryGetValue(database, out var fromVersion);
        
        // Use GetFeed for efficient incremental polling
        var feedResult = await api.CallAsync<FeedResult<ExceptionEvent>>("GetFeed", typeof(ExceptionEvent), new
        {
            fromVersion = fromVersion > 0 ? fromVersion : (long?)null,
            resultsLimit = 1000
        }, ct);
        
        if (feedResult?.Data == null || feedResult.Data.Count == 0)
        {
            _logger.LogDebug("No new incidents for {Database}", database);
            return;
        }
        
        // Update version for next poll
        _feedVersions[database] = feedResult.ToVersion ?? 0;
        
        _logger.LogInformation("Found {Count} new incidents for {Database}", 
            feedResult.Data.Count, database);
        
        foreach (var incident in feedResult.Data)
        {
            // Filter by configured rules
            var ruleName = incident.Rule?.Name ?? "";
            if (!config.AutoGenerateRules.Any(r => 
                ruleName.Contains(r, StringComparison.OrdinalIgnoreCase)))
            {
                _logger.LogDebug("Skipping incident {Id} - rule {Rule} not in auto-generate list", 
                    incident.Id, ruleName);
                continue;
            }
            
            try
            {
                await GenerateAndSaveReportAsync(api, incident, database, config, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating report for incident {Id}", incident.Id);
            }
        }
    }
    
    private async Task ProcessReportRequestsAsync(API api, CancellationToken ct)
    {
        var requests = await _repository.GetPendingRequestsAsync(api, ct);
        
        foreach (var request in requests)
        {
            _logger.LogInformation("Processing request {RequestId} for device {DeviceId} ({FromDate} to {ToDate}), ForceReport={ForceReport}",
                request.Id, request.DeviceId, request.FromDate, request.ToDate, request.ForceReport);
            
            try
            {
                // Mark as processing
                await _repository.UpdateRequestStatusAsync(api, request.Id, 
                    ReportRequestStatus.Processing, ct: ct);
                
                // Search for collision events for this device in the date range
                var incidents = await api.CallAsync<List<ExceptionEvent>>("Get", typeof(ExceptionEvent), new
                {
                    search = new 
                    { 
                        deviceSearch = new { id = request.DeviceId },
                        fromDate = request.FromDate,
                        toDate = request.ToDate
                    }
                }, ct);
                
                // Filter to collision rules only
                var collisionIncidents = incidents?
                    .Where(e => e.Rule?.Name?.Contains("Collision", StringComparison.OrdinalIgnoreCase) == true)
                    .ToList() ?? [];
                
                // Get config for notifications
                var config = await _repository.GetConfigAsync(api, ct) ?? new CustomerConfig();
                int reportsGenerated = 0;
                
                if (collisionIncidents.Count == 0 && !request.ForceReport)
                {
                    _logger.LogInformation("No collision incidents found for device {DeviceId}", request.DeviceId);
                    await _repository.UpdateRequestStatusAsync(api, request.Id,
                        ReportRequestStatus.Completed, incidentsFound: 0, reportsGenerated: 0, ct: ct);
                    continue;
                }
                
                if (collisionIncidents.Count == 0 && request.ForceReport)
                {
                    // Generate baseline report without incident
                    _logger.LogInformation("No collision incidents found, but ForceReport=true - generating baseline report for device {DeviceId}", 
                        request.DeviceId);
                    
                    try
                    {
                        var baselineReport = await GenerateBaselineReportAsync(api, request, api.Database ?? "unknown", ct);
                        await _repository.SaveReportAsync(api, baselineReport, ct);
                        reportsGenerated = 1;
                        _logger.LogInformation("Generated baseline report {ReportId} for device {DeviceId}", 
                            baselineReport.Id, request.DeviceId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to generate baseline report for device {DeviceId}", request.DeviceId);
                    }
                    
                    await _repository.UpdateRequestStatusAsync(api, request.Id,
                        ReportRequestStatus.Completed, incidentsFound: 0, reportsGenerated: reportsGenerated, ct: ct);
                    continue;
                }
                
                _logger.LogInformation("Found {Count} collision incidents for device {DeviceId}", 
                    collisionIncidents.Count, request.DeviceId);
                
                // Generate reports for each incident
                foreach (var incident in collisionIncidents)
                {
                    try
                    {
                        await GenerateAndSaveReportAsync(api, incident, api.Database ?? "unknown", config, ct);
                        reportsGenerated++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to generate report for incident {Id}", incident.Id);
                    }
                }
                
                // Mark completed with counts
                await _repository.UpdateRequestStatusAsync(api, request.Id,
                    ReportRequestStatus.Completed, 
                    incidentsFound: collisionIncidents.Count, 
                    reportsGenerated: reportsGenerated, 
                    ct: ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing request {RequestId}", request.Id);
                await _repository.UpdateRequestStatusAsync(api, request.Id,
                    ReportRequestStatus.Failed, error: ex.Message, ct: ct);
            }
        }
    }
    
    /// <summary>
    /// Generates a baseline report for a device/time range without a specific collision incident.
    /// Useful for documenting vehicle state at a point in time.
    /// </summary>
    private async Task<IncidentReport> GenerateBaselineReportAsync(
        API api,
        ReportRequest request,
        string database,
        CancellationToken ct)
    {
        // Get device info
        var devices = await api.CallAsync<List<Device>>("Get", typeof(Device), new
        {
            search = new { id = request.DeviceId }
        }, ct);
        var device = devices?.FirstOrDefault();
        
        // Get GPS trail for the time range
        var logRecords = await api.CallAsync<List<LogRecord>>("Get", typeof(LogRecord), new
        {
            search = new
            {
                deviceSearch = new { id = request.DeviceId },
                fromDate = request.FromDate,
                toDate = request.ToDate
            }
        }, ct);
        
        var gpsTrail = logRecords?
            .OrderBy(r => r.DateTime)
            .Select(r => new GpsPoint
            {
                Timestamp = r.DateTime ?? DateTime.UtcNow,
                Latitude = r.Latitude ?? 0,
                Longitude = r.Longitude ?? 0,
                SpeedKmh = r.Speed
            })
            .ToList() ?? [];
        
        var maxSpeed = gpsTrail.Any() ? gpsTrail.Max(p => p.SpeedKmh ?? 0) : 0;
        var midPoint = gpsTrail.Count > 0 ? gpsTrail[gpsTrail.Count / 2] : null;
        
        // Build the baseline report
        var report = new IncidentReport
        {
            Id = $"rpt_{Guid.NewGuid():N}"[..16],
            IncidentId = $"baseline_{request.Id}",
            VehicleId = request.DeviceId,
            VehicleName = device?.Name ?? request.DeviceName,
            OccurredAt = request.FromDate,
            GeneratedAt = DateTime.UtcNow,
            Severity = IncidentSeverity.Low,  // Baseline reports are informational
            IsBaselineReport = true,
            Summary = $"Baseline report for {device?.Name ?? request.DeviceId} ({request.FromDate:g} to {request.ToDate:g}). " +
                      $"No collision event detected. This report was manually requested for documentation purposes.",
            Evidence = new EvidencePackage
            {
                GpsTrail = gpsTrail,
                MaxSpeedKmh = maxSpeed,
                SpeedAtEventKmh = midPoint?.SpeedKmh
            }
        };
        
        // Try to get weather for the location if we have GPS data
        if (midPoint != null)
        {
            try
            {
                var weatherService = new OpenMeteoWeatherService();
                var weather = await weatherService.GetWeatherAsync(
                    midPoint.Latitude, midPoint.Longitude, request.FromDate, ct);
                report.Evidence.WeatherCondition = weather.Condition;
                report.Evidence.TemperatureCelsius = weather.TemperatureCelsius;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to fetch weather for baseline report");
            }
        }
        
        return report;
    }
    
    private async Task GenerateAndSaveReportAsync(
        API api, 
        ExceptionEvent incident, 
        string database,
        CustomerConfig config,
        CancellationToken ct)
    {
        _logger.LogInformation("Generating report for incident {Id} ({Rule})",
            incident.Id, incident.Rule?.Name);
        
        var report = await _reportGenerator.GenerateReportAsync(api, incident, database, ct);
        
        await _repository.SaveReportAsync(api, report, ct);
        
        _logger.LogInformation("Saved report {ReportId} for incident {IncidentId}",
            report.Id, incident.Id);
        
        // Send notifications if configured
        if (report.Severity >= config.SeverityThreshold)
        {
            try
            {
                await _notificationService.SendNotificationsAsync(report, config, ct);
                _logger.LogInformation("Sent notifications for report {ReportId}", report.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send notifications for report {ReportId}", report.Id);
                // Don't fail the report generation if notifications fail
            }
        }
    }
}
