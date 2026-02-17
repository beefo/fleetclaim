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
            _logger.LogInformation("Processing request {RequestId} for device {DeviceId} ({FromDate} to {ToDate})",
                request.Id, request.DeviceId, request.FromDate, request.ToDate);
            
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
                
                if (collisionIncidents.Count == 0)
                {
                    _logger.LogInformation("No collision incidents found for device {DeviceId}", request.DeviceId);
                    request.IncidentsFound = 0;
                    request.ReportsGenerated = 0;
                    await _repository.UpdateRequestStatusAsync(api, request.Id,
                        ReportRequestStatus.Completed, ct: ct);
                    continue;
                }
                
                _logger.LogInformation("Found {Count} collision incidents for device {DeviceId}", 
                    collisionIncidents.Count, request.DeviceId);
                
                // Get config for notifications
                var config = await _repository.GetConfigAsync(api, ct) ?? new CustomerConfig();
                
                // Generate reports for each incident
                int reportsGenerated = 0;
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
                
                request.IncidentsFound = collisionIncidents.Count;
                request.ReportsGenerated = reportsGenerated;
                
                // Mark completed
                await _repository.UpdateRequestStatusAsync(api, request.Id,
                    ReportRequestStatus.Completed, ct: ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing request {RequestId}", request.Id);
                await _repository.UpdateRequestStatusAsync(api, request.Id,
                    ReportRequestStatus.Failed, ex.Message, ct);
            }
        }
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
