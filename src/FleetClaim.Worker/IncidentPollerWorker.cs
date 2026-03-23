using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Geotab.Checkmate.ObjectModel;
using Geotab.Checkmate.ObjectModel.Exceptions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

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
    private readonly IShareLinkService _shareLinkService;
    private readonly INotificationService _notificationService;
    private readonly IHostApplicationLifetime _hostLifetime;
    private readonly PollerOptions _options;
    private readonly ILogger<IncidentPollerWorker> _logger;
    
    // Stock Geotab rule IDs for collision detection (consistent across all databases)
    private static readonly HashSet<string> CollisionRuleIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "RuleAccidentId",              // Possible Collision (Legacy)
        "RuleEnhancedMajorCollisionId", // Major Collision
        "RuleEnhancedMinorCollisionId"  // Minor Collision
    };
    
    // Map rule IDs to friendly names
    private static readonly Dictionary<string, string> RuleIdToName = new(StringComparer.OrdinalIgnoreCase)
    {
        ["RuleAccidentId"] = "Possible Collision (Legacy)",
        ["RuleEnhancedMajorCollisionId"] = "Major Collision",
        ["RuleEnhancedMinorCollisionId"] = "Minor Collision"
    };
    
    public IncidentPollerWorker(
        ICredentialStore credentialStore,
        IGeotabClientFactory clientFactory,
        IAddInDataRepository repository,
        IReportGenerator reportGenerator,
        IShareLinkService shareLinkService,
        INotificationService notificationService,
        IHostApplicationLifetime hostLifetime,
        IOptions<PollerOptions> options,
        ILogger<IncidentPollerWorker> logger)
    {
        _credentialStore = credentialStore;
        _clientFactory = clientFactory;
        _repository = repository;
        _reportGenerator = reportGenerator;
        _shareLinkService = shareLinkService;
        _notificationService = notificationService;
        _hostLifetime = hostLifetime;
        _options = options.Value;
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

        // Process driver submissions (merge into matching reports)
        await ProcessDriverSubmissionsAsync(api, database, ct);
    }
    
    private async Task ProcessNewIncidentsAsync(
        IGeotabApi api, string database, CustomerConfig config, CancellationToken ct)
    {
        // Load persisted feed version from AddInData
        var workerState = await _repository.GetWorkerStateAsync(api, database, ct) ?? new WorkerState();
        var fromVersion = workerState.FeedVersion;

        _logger.LogInformation("Polling {Database} with feed version {Version} (last polled: {LastPolled})",
            database, fromVersion > 0 ? fromVersion : "initial", workerState.LastPolledAt?.ToString("u") ?? "never");

        var resultsLimit = _options.ResultsLimit;
        var maxIterations = _options.MaxIterations;
        int iteration = 0;
        int totalProcessed = 0;
        
        FeedResult<ExceptionEvent>? feedResult;
        
        // Drain loop: keep fetching until we get fewer results than the limit
        do
        {
            iteration++;
            
            // Use GetFeed for efficient incremental polling
            feedResult = await api.CallAsync<FeedResult<ExceptionEvent>>("GetFeed", typeof(ExceptionEvent), new
            {
                fromVersion = fromVersion > 0 ? fromVersion : (long?)null,
                resultsLimit
            }, ct);

            if (feedResult?.Data == null || feedResult.Data.Count == 0)
            {
                // Still save the version so we don't re-query the same empty range
                if (feedResult?.ToVersion != null && feedResult.ToVersion != fromVersion)
                {
                    workerState.FeedVersion = feedResult.ToVersion.Value;
                    workerState.LastPolledAt = DateTime.UtcNow;
                    await _repository.SaveWorkerStateAsync(api, database, workerState, ct);
                }
                break;
            }

            // Update version for next iteration
            fromVersion = feedResult.ToVersion ?? 0;
            workerState.FeedVersion = fromVersion;
            
            _logger.LogInformation("Batch {Iteration}: Found {Count} incidents for {Database} (total so far: {Total})", 
                iteration, feedResult.Data.Count, database, totalProcessed + feedResult.Data.Count);
            
            foreach (var incident in feedResult.Data)
            {
                // Filter by collision rule IDs (Rule.Name is not populated in ExceptionEvent)
                var ruleId = incident.Rule?.Id?.ToString() ?? "";
                if (!CollisionRuleIds.Contains(ruleId))
                {
                    _logger.LogDebug("Skipping incident {Id} - rule {RuleId} not a collision rule", 
                        incident.Id, ruleId);
                    continue;
                }
                
                _logger.LogInformation("Processing collision incident {Id} with rule {RuleId} ({RuleName})", 
                    incident.Id, ruleId, RuleIdToName.GetValueOrDefault(ruleId, "Unknown"));
                
                try
                {
                    await GenerateAndSaveReportAsync(api, incident, database, config, ReportSource.Automatic, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error generating report for incident {Id}", incident.Id);
                }
            }

            totalProcessed += feedResult.Data.Count;

            // Persist after each batch so we don't reprocess on failure
            workerState.LastPolledAt = DateTime.UtcNow;
            await _repository.SaveWorkerStateAsync(api, database, workerState, ct);
            
        } while (feedResult.Data.Count >= resultsLimit && iteration < maxIterations && !ct.IsCancellationRequested);

        if (iteration >= maxIterations)
        {
            _logger.LogWarning("Hit max iterations ({Max}) for {Database} - may still have pending exceptions", 
                maxIterations, database);
        }

        _logger.LogInformation("Completed polling {Database}: {Total} incidents processed in {Iterations} batch(es), feed version now {Version}",
            database, totalProcessed, iteration, workerState.FeedVersion);
    }

    private async Task HandleStaleRequestsAsync(IGeotabApi api, CancellationToken ct)
    {
        try
        {
            var staleRequests = await _repository.GetStaleRequestsAsync(api, _options.StaleRequestTimeout, ct);
            
            foreach (var request in staleRequests)
            {
                _logger.LogWarning("Marking stale request {RequestId} as failed (stuck in Processing for > {Timeout} minutes)",
                    request.Id, _options.StaleRequestTimeout.TotalMinutes);
                
                await _repository.UpdateRequestStatusAsync(api, request.Id,
                    ReportRequestStatus.Failed, 
                    errorMessage: $"Request timed out after {_options.StaleRequestTimeout.TotalMinutes} minutes",
                    ct: ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling stale requests");
        }
    }
    
    private async Task ProcessReportRequestsAsync(IGeotabApi api, CancellationToken ct)
    {
        // First, handle stale requests (stuck in Processing for > 10 minutes)
        await HandleStaleRequestsAsync(api, ct);
        
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
                
                // Filter to collision rules by ID (Rule.Name is not populated in ExceptionEvent)
                var collisionIncidents = incidents?
                    .Where(e => 
                    {
                        var ruleId = e.Rule?.Id?.ToString() ?? "";
                        return CollisionRuleIds.Contains(ruleId);
                    })
                    .ToList() ?? [];
                
                _logger.LogInformation("Found {Total} total exceptions, {Collision} are collision events for device {DeviceId}",
                    incidents?.Count ?? 0, collisionIncidents.Count, request.DeviceId);
                
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
                
                if (collisionIncidents.Count == 0 && (request.ForceReport || !string.IsNullOrEmpty(request.LinkedSubmissionId)))
                {
                    // Generate baseline report without incident
                    _logger.LogInformation("No collision incidents found, but ForceReport=true or LinkedSubmissionId set - generating baseline report for device {DeviceId}", 
                        request.DeviceId);
                    
                    try
                    {
                        var baselineReport = await GenerateBaselineReportAsync(api, request, api.Database ?? "unknown", ct);
                        
                        // If linked to a driver submission, merge it immediately
                        if (!string.IsNullOrEmpty(request.LinkedSubmissionId))
                        {
                            var linkedSubmission = await _repository.GetSubmissionByIdAsync(api, request.LinkedSubmissionId, ct);
                            if (linkedSubmission != null)
                            {
                                _logger.LogInformation("Merging linked submission {SubmissionId} into baseline report {ReportId}",
                                    request.LinkedSubmissionId, baselineReport.Id);
                                MergeSubmissionIntoReport(baselineReport, linkedSubmission);
                                baselineReport.Source = ReportSource.Manual; // Driver-initiated via submission
                                await _repository.UpdateSubmissionStatusAsync(api, linkedSubmission.Id, "merged", baselineReport.Id, ct);
                            }
                            else
                            {
                                _logger.LogWarning("Linked submission {SubmissionId} not found", request.LinkedSubmissionId);
                            }
                        }
                        
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
                    
                    // Audit the baseline report
                    var auditMsg = !string.IsNullOrEmpty(request.LinkedSubmissionId)
                        ? $"Generated report from driver submission for {request.DeviceName} ({request.FromDate:g} to {request.ToDate:g})"
                        : $"Generated baseline report for {request.DeviceName} ({request.FromDate:g} to {request.ToDate:g})";
                    await AddAuditAsync(api, "FleetClaim_BaselineReportGenerated", auditMsg, request.RequestedBy, ct);
                    continue;
                }
                
                _logger.LogInformation("Found {Count} collision incidents for device {DeviceId}", 
                    collisionIncidents.Count, request.DeviceId);
                
                // Generate reports for each incident
                foreach (var incident in collisionIncidents)
                {
                    try
                    {
                        await GenerateAndSaveReportAsync(api, incident, api.Database ?? "unknown", config, ReportSource.Manual, ct);
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
                
                // Audit the completed request
                var auditComment = reportsGenerated > 0
                    ? $"Generated {reportsGenerated} report(s) for {request.DeviceName} ({request.FromDate:g} to {request.ToDate:g})"
                    : $"No incidents found for {request.DeviceName} ({request.FromDate:g} to {request.ToDate:g})";
                await AddAuditAsync(api, "FleetClaim_ReportGenerated", auditComment, request.RequestedBy, ct);
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
        IGeotabApi api,
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
        
        var allGpsPoints = logRecords?
            .OrderBy(r => r.DateTime)
            .Select(r => new GpsPoint
            {
                Timestamp = r.DateTime ?? DateTime.UtcNow,
                Latitude = r.Latitude ?? 0,
                Longitude = r.Longitude ?? 0,
                SpeedKmh = r.Speed
            })
            .ToList() ?? [];
        
        // Limit GPS trail to 100 points max to stay under Geotab's 10KB AddInData limit
        // Sample evenly if we have more than 100 points
        var gpsTrail = allGpsPoints.Count <= 100 
            ? allGpsPoints 
            : allGpsPoints
                .Where((_, i) => i % (allGpsPoints.Count / 100 + 1) == 0)
                .Take(100)
                .ToList();
        
        var maxSpeed = allGpsPoints.Any() ? allGpsPoints.Max(p => p.SpeedKmh ?? 0) : 0;
        var midPoint = allGpsPoints.Count > 0 ? allGpsPoints[allGpsPoints.Count / 2] : null;
        
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
            Source = ReportSource.Manual,  // Baseline reports are always manual requests
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
        
        // Generate share URL for secure PDF access
        report.ShareUrl = _shareLinkService.GenerateShareUrl(report.Id, database);
        
        return report;
    }
    
    /// <summary>
    /// Processes unmerged driver submissions by matching them to existing reports
    /// and merging driver-provided data into the report.
    /// </summary>
    private async Task ProcessDriverSubmissionsAsync(IGeotabApi api, string database, CancellationToken ct)
    {
        List<DriverSubmission> submissions;
        try
        {
            submissions = await _repository.GetUnmergedSubmissionsAsync(api, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error fetching driver submissions for {Database}", database);
            return;
        }

        if (submissions.Count == 0) return;

        _logger.LogInformation("Found {Count} unmerged driver submission(s) for {Database}", submissions.Count, database);

        var reports = await _repository.GetReportsAsync(api, ct: ct);
        var matchWindow = TimeSpan.FromMinutes(30);
        var standaloneAge = TimeSpan.FromHours(24);

        foreach (var submission in submissions)
        {
            try
            {
                // Find matching report: same DeviceId, OccurredAt within 30 min of IncidentTimestamp
                var match = reports.FirstOrDefault(r =>
                    string.Equals(r.VehicleId, submission.DeviceId, StringComparison.OrdinalIgnoreCase) &&
                    Math.Abs((r.OccurredAt - submission.IncidentTimestamp).TotalMinutes) <= matchWindow.TotalMinutes &&
                    r.MergedFromSubmissionId == null);

                if (match != null)
                {
                    _logger.LogInformation("Merging submission {SubmissionId} into report {ReportId}",
                        submission.Id, match.Id);

                    MergeSubmissionIntoReport(match, submission);
                    await _repository.UpdateReportAsync(api, match, ct);
                    await _repository.UpdateSubmissionStatusAsync(api, submission.Id, "merged", match.Id, ct);
                }
                else if (DateTime.UtcNow - submission.CreatedAt > standaloneAge)
                {
                    // No match found after 24 hours - create a report from the submission
                    _logger.LogInformation("No matching report found for submission {SubmissionId} after 24h, creating standalone report",
                        submission.Id);
                    
                    try
                    {
                        var standaloneReport = CreateReportFromSubmission(submission, database);
                        await _repository.SaveReportAsync(api, standaloneReport, ct);
                        await _repository.UpdateSubmissionStatusAsync(api, submission.Id, "converted", standaloneReport.Id, ct);
                        
                        _logger.LogInformation("Created standalone report {ReportId} from submission {SubmissionId}",
                            standaloneReport.Id, submission.Id);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to create standalone report from submission {SubmissionId}", submission.Id);
                        // Mark as standalone anyway so we don't retry forever
                        await _repository.UpdateSubmissionStatusAsync(api, submission.Id, "standalone", ct: ct);
                    }
                }
                else
                {
                    _logger.LogDebug("No matching report yet for submission {SubmissionId}, will retry next poll",
                        submission.Id);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing driver submission {SubmissionId}", submission.Id);
            }
        }
    }

    /// <summary>
    /// Creates a new report from a driver submission when no matching telematics report exists.
    /// The submission becomes the primary source of incident data.
    /// </summary>
    private IncidentReport CreateReportFromSubmission(DriverSubmission submission, string database)
    {
        var report = new IncidentReport
        {
            Id = $"rpt_{Guid.NewGuid():N}"[..16],
            IncidentId = $"sub_{submission.Id}",
            VehicleId = submission.DeviceId,
            VehicleName = submission.DeviceName,
            DriverId = submission.DriverId,
            DriverName = submission.DriverName,
            OccurredAt = submission.IncidentTimestamp,
            GeneratedAt = DateTime.UtcNow,
            Severity = submission.Severity ?? IncidentSeverity.Medium,
            Source = ReportSource.Manual,
            IsBaselineReport = false, // It's a real incident, just driver-reported
            Summary = $"Driver-reported incident. {submission.Description ?? "No description provided."}",
            
            // Location
            IncidentAddress = submission.LocationAddress,
            
            // Damage info
            DamageDescription = submission.DamageDescription,
            DamageLevel = submission.DamageLevel,
            VehicleDriveable = submission.VehicleDriveable,
            
            // Police info
            PoliceReportNumber = submission.PoliceReportNumber,
            PoliceAgency = submission.PoliceAgency,
            
            // Injury info
            InjuriesReported = submission.InjuriesReported,
            InjuryDescription = submission.InjuryDescription,
            
            // Notes
            Notes = submission.Notes,
            NotesUpdatedAt = submission.SubmittedAt ?? submission.CreatedAt,
            NotesUpdatedBy = submission.DriverName ?? "Driver",
            
            // Merge provenance
            MergedFromSubmissionId = submission.Id,
            MergedAt = DateTime.UtcNow,
            
            // Evidence with driver photos and location
            Evidence = new EvidencePackage
            {
                Photos = submission.Photos,
                GpsTrail = submission.Latitude.HasValue && submission.Longitude.HasValue
                    ? [new GpsPoint 
                    { 
                        Timestamp = submission.IncidentTimestamp,
                        Latitude = submission.Latitude.Value,
                        Longitude = submission.Longitude.Value
                    }]
                    : []
            }
        };
        
        // Add third-party info
        if (submission.ThirdParties.Count > 0)
        {
            report.ThirdParties.AddRange(submission.ThirdParties);
        }
        else if (!string.IsNullOrEmpty(submission.OtherDriverName))
        {
            report.ThirdParties.Add(new ThirdPartyInfo
            {
                DriverName = submission.OtherDriverName,
                DriverPhone = submission.OtherDriverPhone,
                InsuranceCompany = submission.OtherDriverInsurance,
                InsurancePolicyNumber = submission.OtherDriverPolicyNumber,
                VehicleMake = submission.OtherVehicleMake,
                VehicleModel = submission.OtherVehicleModel,
                VehiclePlate = submission.OtherVehiclePlate,
                VehicleColor = submission.OtherVehicleColor
            });
        }
        
        // Add witnesses
        if (!string.IsNullOrEmpty(submission.Witnesses))
        {
            report.Witnesses.Add(new WitnessInfo { Statement = submission.Witnesses });
        }
        
        // Generate share URL
        report.ShareUrl = _shareLinkService.GenerateShareUrl(report.Id, database);
        
        return report;
    }

    /// <summary>
    /// Merges driver-submitted data into an existing report.
    /// Driver data fills empty fields; notes and photos are appended.
    /// </summary>
    public static void MergeSubmissionIntoReport(IncidentReport report, DriverSubmission submission)
    {
        // Mark merge provenance
        report.MergedFromSubmissionId = submission.Id;
        report.MergedAt = DateTime.UtcNow;

        // Fill empty driver info
        report.DriverId ??= submission.DriverId;
        report.DriverName ??= submission.DriverName;

        // Fill empty location info
        if (string.IsNullOrEmpty(report.IncidentAddress))
            report.IncidentAddress = submission.LocationAddress;

        // Fill empty damage info
        report.DamageDescription ??= submission.DamageDescription;
        report.DamageLevel ??= submission.DamageLevel;
        report.VehicleDriveable ??= submission.VehicleDriveable;

        // Fill empty police info
        report.PoliceReportNumber ??= submission.PoliceReportNumber;
        report.PoliceAgency ??= submission.PoliceAgency;

        // Fill injury info
        report.InjuriesReported ??= submission.InjuriesReported;
        report.InjuryDescription ??= submission.InjuryDescription;

        // Append notes
        if (!string.IsNullOrEmpty(submission.Notes))
        {
            var driverNotes = $"[Driver submission] {submission.Notes}";
            report.Notes = string.IsNullOrEmpty(report.Notes) ? driverNotes : $"{report.Notes}\n\n{driverNotes}";
            report.NotesUpdatedAt = DateTime.UtcNow;
            report.NotesUpdatedBy = submission.DriverName ?? "Driver";
        }

        if (!string.IsNullOrEmpty(submission.Description))
        {
            var driverDesc = $"[Driver statement] {submission.Description}";
            report.Notes = string.IsNullOrEmpty(report.Notes) ? driverDesc : $"{report.Notes}\n\n{driverDesc}";
            report.NotesUpdatedAt = DateTime.UtcNow;
            report.NotesUpdatedBy = submission.DriverName ?? "Driver";
        }

        // Append third-party info
        if (submission.ThirdParties.Count > 0)
        {
            report.ThirdParties.AddRange(submission.ThirdParties);
        }
        else if (!string.IsNullOrEmpty(submission.OtherDriverName))
        {
            report.ThirdParties.Add(new ThirdPartyInfo
            {
                DriverName = submission.OtherDriverName,
                DriverPhone = submission.OtherDriverPhone,
                InsuranceCompany = submission.OtherDriverInsurance,
                InsurancePolicyNumber = submission.OtherDriverPolicyNumber,
                VehicleMake = submission.OtherVehicleMake,
                VehicleModel = submission.OtherVehicleModel,
                VehiclePlate = submission.OtherVehiclePlate,
                VehicleColor = submission.OtherVehicleColor
            });
        }

        // Append witnesses
        if (!string.IsNullOrEmpty(submission.Witnesses))
        {
            report.Witnesses.Add(new WitnessInfo { Statement = submission.Witnesses });
        }

        // Append photos
        if (submission.Photos.Count > 0)
        {
            report.Evidence.Photos.AddRange(submission.Photos);
        }

        // Upgrade severity if driver reports higher
        if (submission.Severity.HasValue && submission.Severity.Value > report.Severity)
        {
            report.Severity = submission.Severity.Value;
        }
    }

    private async Task GenerateAndSaveReportAsync(
        IGeotabApi api, 
        ExceptionEvent incident, 
        string database,
        CustomerConfig config,
        ReportSource source,
        CancellationToken ct)
    {
        var ruleId = incident.Rule?.Id?.ToString() ?? "";
        var ruleName = RuleIdToName.GetValueOrDefault(ruleId, incident.Rule?.Name ?? "Unknown");
        _logger.LogInformation("Generating report for incident {Id} ({RuleId}: {RuleName}), source={Source}",
            incident.Id, ruleId, ruleName, source);
        
        var report = await _reportGenerator.GenerateReportAsync(api, incident, database, ct);
        report.Source = source;  // Set the source based on how the report was triggered
        
        var wasSaved = await _repository.SaveReportAsync(api, report, ct);
        
        if (wasSaved)
        {
            _logger.LogInformation("Saved report {ReportId} for incident {IncidentId}",
                report.Id, incident.Id);
        }
        else
        {
            _logger.LogWarning("Skipped duplicate report for incident {IncidentId} - report already exists",
                incident.Id);
            return; // Don't send notifications for duplicates
        }
        
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
    
    /// <summary>
    /// Add an audit entry to MyGeotab to track FleetClaim actions
    /// </summary>
    private async Task AddAuditAsync(
        IGeotabApi api, 
        string auditName, 
        string comment, 
        string? userName = null,
        CancellationToken ct = default)
    {
        try
        {
            var audit = new
            {
                name = auditName,
                comment = comment,
                dateTime = DateTime.UtcNow,
                userName = userName
            };
            
            await api.CallAsync<object>("Add", typeof(Audit), new { entity = audit }, ct);
            _logger.LogDebug("Added audit: {AuditName} - {Comment}", auditName, comment);
        }
        catch (Exception ex)
        {
            // Audits are best-effort, don't fail the main operation
            _logger.LogWarning(ex, "Failed to add audit: {AuditName}", auditName);
        }
    }
}
