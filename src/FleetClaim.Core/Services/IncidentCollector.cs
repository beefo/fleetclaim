using FleetClaim.Core.Models;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;
using Geotab.Checkmate.ObjectModel.Exceptions;
using Geotab.Checkmate.ObjectModel.Engine;

namespace FleetClaim.Core.Services;

public interface IIncidentCollector
{
    Task<EvidencePackage> CollectEvidenceAsync(
        API api,
        ExceptionEvent incident,
        TimeSpan windowBefore,
        TimeSpan windowAfter,
        CancellationToken ct = default);
}

/// <summary>
/// Collects evidence around an incident: GPS trail, speed data, diagnostics, etc.
/// </summary>
public class IncidentCollector : IIncidentCollector
{
    private readonly IWeatherService _weather;
    
    public IncidentCollector(IWeatherService weather)
    {
        _weather = weather;
    }
    
    public async Task<EvidencePackage> CollectEvidenceAsync(
        API api,
        ExceptionEvent incident,
        TimeSpan windowBefore,
        TimeSpan windowAfter,
        CancellationToken ct = default)
    {
        var fromDate = incident.ActiveFrom!.Value - windowBefore;
        var toDate = (incident.ActiveTo ?? incident.ActiveFrom.Value) + windowAfter;
        var deviceId = incident.Device?.Id;
        
        if (deviceId == null)
        {
            return new EvidencePackage();
        }
        
        // Extended window for hard events (look further back for driver behavior)
        var hardEventWindowStart = incident.ActiveFrom!.Value - TimeSpan.FromMinutes(30);
        
        // Parallel fetch for speed
        var gpsTask = GetGpsTrailAsync(api, deviceId, fromDate, toDate, ct);
        var diagnosticsTask = GetDiagnosticsAsync(api, deviceId, fromDate, toDate, ct);
        var driverTask = GetDriverInfoAsync(api, incident, ct);
        var accelerometerTask = GetAccelerometerDataAsync(api, deviceId, fromDate, toDate, ct);
        var hardEventsTask = GetHardEventsAsync(api, deviceId, hardEventWindowStart, incident.ActiveFrom!.Value, ct);
        var vehicleStatusTask = GetVehicleStatusAtTimeAsync(api, deviceId, incident.ActiveFrom!.Value, ct);
        
        await Task.WhenAll(gpsTask, diagnosticsTask, driverTask, accelerometerTask, hardEventsTask, vehicleStatusTask);
        
        var gpsPoints = await gpsTask;
        var diagnostics = await diagnosticsTask;
        var (driverId, hosStatus, safetyScore, recentIncidents) = await driverTask;
        var accelerometerEvents = await accelerometerTask;
        var hardEvents = await hardEventsTask;
        var vehicleStatus = await vehicleStatusTask;
        
        // Get weather for incident location/time
        var incidentPoint = gpsPoints.MinBy(p => Math.Abs((p.Timestamp - incident.ActiveFrom!.Value).TotalSeconds));
        WeatherInfo? weather = null;
        if (incidentPoint != null)
        {
            weather = await _weather.GetWeatherAsync(
                incidentPoint.Latitude, 
                incidentPoint.Longitude, 
                incident.ActiveFrom!.Value, 
                ct);
        }
        
        // Calculate speed metrics
        var speedAtEvent = incidentPoint?.SpeedKmh;
        var maxSpeed = gpsPoints.Count > 0 ? gpsPoints.Max(p => p.SpeedKmh ?? 0) : (double?)null;
        var avgSpeed = gpsPoints.Count > 0 ? gpsPoints.Where(p => p.SpeedKmh.HasValue).Average(p => p.SpeedKmh!.Value) : (double?)null;
        
        // Calculate deceleration if this is a braking event
        double? deceleration = null;
        if (gpsPoints.Count >= 2)
        {
            var nearEvent = gpsPoints
                .Where(p => p.Timestamp <= incident.ActiveFrom!.Value)
                .OrderByDescending(p => p.Timestamp)
                .Take(2)
                .ToList();
            
            if (nearEvent.Count == 2 && nearEvent[0].SpeedKmh.HasValue && nearEvent[1].SpeedKmh.HasValue)
            {
                var deltaSpeed = (nearEvent[0].SpeedKmh.Value - nearEvent[1].SpeedKmh.Value) / 3.6; // to m/s
                var deltaTime = (nearEvent[0].Timestamp - nearEvent[1].Timestamp).TotalSeconds;
                if (Math.Abs(deltaTime) > 0.001)
                    deceleration = deltaSpeed / deltaTime;
            }
        }
        
        // Calculate G-force metrics from accelerometer data
        var maxGForce = accelerometerEvents.Count > 0 ? accelerometerEvents.Max(a => a.TotalGForce) : (double?)null;
        var impactEvent = accelerometerEvents.MaxBy(a => a.TotalGForce);
        var impactGForce = impactEvent?.TotalGForce;
        var impactDirection = DetermineImpactDirection(impactEvent);
        
        // Calculate time driving before incident (from trip start)
        var firstGpsPoint = gpsPoints.FirstOrDefault();
        var timeDriving = firstGpsPoint != null 
            ? incident.ActiveFrom!.Value - firstGpsPoint.Timestamp 
            : (TimeSpan?)null;
        
        return new EvidencePackage
        {
            // GPS & Location
            GpsTrail = gpsPoints,
            
            // Speed Analysis
            MaxSpeedKmh = maxSpeed,
            SpeedAtEventKmh = speedAtEvent,
            AvgSpeedKmh = avgSpeed,
            
            // G-Force / Accelerometer
            DecelerationMps2 = deceleration,
            MaxGForce = maxGForce,
            ImpactGForce = impactGForce,
            ImpactDirection = impactDirection,
            AccelerometerEvents = accelerometerEvents,
            
            // Hard Events
            HardEventsBeforeIncident = hardEvents,
            
            // Weather & Environment
            WeatherCondition = weather?.Condition,
            TemperatureCelsius = weather?.TemperatureCelsius,
            LightCondition = DetermineLightCondition(incident.ActiveFrom!.Value, incidentPoint?.Latitude, incidentPoint?.Longitude),
            
            // Vehicle Status
            Diagnostics = diagnostics,
            SeatbeltFastened = vehicleStatus.SeatbeltFastened,
            HeadlightsOn = vehicleStatus.HeadlightsOn,
            FuelLevelPercent = vehicleStatus.FuelLevelPercent,
            EngineRpm = vehicleStatus.EngineRpm,
            AbsActivated = vehicleStatus.AbsActivated,
            TractionControlActivated = vehicleStatus.TractionControlActivated,
            StabilityControlActivated = vehicleStatus.StabilityControlActivated,
            
            // Driver Status
            DriverHosStatus = hosStatus,
            DriverSafetyScore = safetyScore,
            DriverIncidentCountLast30Days = recentIncidents,
            TimeDrivingBeforeIncident = timeDriving
        };
    }
    
    private string? DetermineImpactDirection(AccelerometerEvent? impact)
    {
        if (impact == null) return null;
        
        // Determine impact direction based on dominant G-force axis
        var absX = Math.Abs(impact.GForceX);
        var absY = Math.Abs(impact.GForceY);
        var absZ = Math.Abs(impact.GForceZ);
        
        if (absZ > absX && absZ > absY && impact.GForceZ < -1.5)
            return "Rollover";
        if (absY > absX && absY > absZ)
            return impact.GForceY > 0 ? "Front" : "Rear";
        if (absX > absY && absX > absZ)
            return impact.GForceX > 0 ? "Right" : "Left";
        
        return "Unknown";
    }
    
    private string DetermineLightCondition(DateTime time, double? lat, double? lon)
    {
        // Simple approximation based on time of day
        // TODO: Use actual sunrise/sunset calculation with lat/lon
        var hour = time.Hour;
        
        return hour switch
        {
            >= 6 and < 8 => "Dawn",
            >= 8 and < 17 => "Daylight",
            >= 17 and < 19 => "Dusk",
            _ => "Night"
        };
    }
    
    private async Task<List<GpsPoint>> GetGpsTrailAsync(
        API api, Id deviceId, DateTime from, DateTime to, CancellationToken ct)
    {
        var logs = await api.CallAsync<List<LogRecord>>("Get", typeof(LogRecord), new
        {
            search = new LogRecordSearch
            {
                DeviceSearch = new DeviceSearch { Id = deviceId },
                FromDate = from,
                ToDate = to
            }
        }, ct);
        
        return logs?.Select(l => new GpsPoint
        {
            Timestamp = l.DateTime ?? DateTime.MinValue,
            Latitude = l.Latitude ?? 0,
            Longitude = l.Longitude ?? 0,
            SpeedKmh = l.Speed
        }).ToList() ?? [];
    }
    
    private async Task<List<DiagnosticSnapshot>> GetDiagnosticsAsync(
        API api, Id deviceId, DateTime from, DateTime to, CancellationToken ct)
    {
        var statusData = await api.CallAsync<List<StatusData>>("Get", typeof(StatusData), new
        {
            search = new StatusDataSearch
            {
                DeviceSearch = new DeviceSearch { Id = deviceId },
                FromDate = from,
                ToDate = to
            }
        }, ct);
        
        // Get unique diagnostics near the incident
        return statusData?
            .Where(s => s.Diagnostic != null)
            .GroupBy(s => s.Diagnostic!.Id)
            .Select(g => g.Last())
            .Select(s => new DiagnosticSnapshot
            {
                Code = s.Diagnostic?.Code?.ToString() ?? s.Diagnostic?.Id?.ToString() ?? "",
                Description = s.Diagnostic?.Name,
                Value = s.Data,
                Unit = s.Diagnostic?.UnitOfMeasure?.ToString()
            })
            .ToList() ?? [];
    }
    
    private async Task<(string? DriverId, HosStatus? HosStatus, double? SafetyScore, int? RecentIncidents)> GetDriverInfoAsync(
        API api, ExceptionEvent incident, CancellationToken ct)
    {
        if (incident.Driver?.Id == null)
            return (null, null, null, null);
        
        var driverId = incident.Driver.Id.ToString();
        
        // Try to get driver's recent exception events (last 30 days) for safety score context
        int? recentIncidents = null;
        try
        {
            var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);
            var driverEvents = await api.CallAsync<List<ExceptionEvent>>("Get", typeof(ExceptionEvent), new
            {
                search = new ExceptionEventSearch
                {
                    UserSearch = new UserSearch { Id = incident.Driver.Id },
                    FromDate = thirtyDaysAgo,
                    ToDate = DateTime.UtcNow
                }
            }, ct);
            recentIncidents = driverEvents?.Count ?? 0;
        }
        catch
        {
            // Ignore errors fetching driver history
        }
        
        // TODO: Fetch HOS status from DutyStatusLog if needed
        return (driverId, null, null, recentIncidents);
    }
    
    private async Task<List<AccelerometerEvent>> GetAccelerometerDataAsync(
        API api, Id deviceId, DateTime from, DateTime to, CancellationToken ct)
    {
        var events = new List<AccelerometerEvent>();
        
        try
        {
            // Geotab stores accelerometer data in StatusData with specific diagnostic IDs
            // DiagnosticAccelerometerForwardBrakingId, DiagnosticAccelerometerLateralId, etc.
            var accelData = await api.CallAsync<List<StatusData>>("Get", typeof(StatusData), new
            {
                search = new StatusDataSearch
                {
                    DeviceSearch = new DeviceSearch { Id = deviceId },
                    FromDate = from,
                    ToDate = to,
                    DiagnosticSearch = new DiagnosticSearch 
                    { 
                        // Search for accelerometer-related diagnostics
                        Name = "%Accelerometer%" 
                    }
                }
            }, ct);
            
            if (accelData != null && accelData.Count > 0)
            {
                // Group by timestamp to create combined X/Y/Z readings
                var grouped = accelData
                    .GroupBy(a => a.DateTime)
                    .Select(g =>
                    {
                        var gForceX = g.FirstOrDefault(d => d.Diagnostic?.Name?.Contains("Lateral") == true)?.Data ?? 0;
                        var gForceY = g.FirstOrDefault(d => d.Diagnostic?.Name?.Contains("Forward") == true || 
                                                           d.Diagnostic?.Name?.Contains("Braking") == true)?.Data ?? 0;
                        var gForceZ = g.FirstOrDefault(d => d.Diagnostic?.Name?.Contains("Vertical") == true)?.Data ?? 0;
                        var total = Math.Sqrt(gForceX * gForceX + gForceY * gForceY + gForceZ * gForceZ);
                        
                        return new AccelerometerEvent
                        {
                            Timestamp = g.Key ?? DateTime.MinValue,
                            GForceX = gForceX,
                            GForceY = gForceY,
                            GForceZ = gForceZ,
                            TotalGForce = total,
                            EventType = total > 0.5 ? "HighG" : "Normal"
                        };
                    })
                    .Where(a => a.TotalGForce > 0.3) // Filter out noise
                    .OrderBy(a => a.Timestamp)
                    .ToList();
                
                events.AddRange(grouped);
            }
        }
        catch
        {
            // Accelerometer data may not be available on all devices
        }
        
        return events;
    }
    
    private async Task<List<HardEvent>> GetHardEventsAsync(
        API api, Id deviceId, DateTime from, DateTime to, CancellationToken ct)
    {
        var hardEvents = new List<HardEvent>();
        
        try
        {
            // Get exception events for hard braking, acceleration, cornering
            var events = await api.CallAsync<List<ExceptionEvent>>("Get", typeof(ExceptionEvent), new
            {
                search = new ExceptionEventSearch
                {
                    DeviceSearch = new DeviceSearch { Id = deviceId },
                    FromDate = from,
                    ToDate = to
                }
            }, ct);
            
            if (events != null)
            {
                var relevantRules = new[] { "HardBrak", "HardAccel", "HardCornering", "Harsh" };
                
                foreach (var evt in events)
                {
                    var ruleName = evt.Rule?.Name ?? "";
                    if (relevantRules.Any(r => ruleName.Contains(r, StringComparison.OrdinalIgnoreCase)))
                    {
                        hardEvents.Add(new HardEvent
                        {
                            Timestamp = evt.ActiveFrom ?? DateTime.MinValue,
                            EventType = ruleName,
                            DurationSeconds = evt.Duration?.TotalSeconds
                        });
                    }
                }
            }
        }
        catch
        {
            // Ignore errors
        }
        
        return hardEvents.OrderBy(e => e.Timestamp).ToList();
    }
    
    private async Task<VehicleStatusSnapshot> GetVehicleStatusAtTimeAsync(
        API api, Id deviceId, DateTime time, CancellationToken ct)
    {
        var status = new VehicleStatusSnapshot();
        
        try
        {
            // Get status data near the incident time
            var nearTime = time.AddMinutes(-1);
            var statusData = await api.CallAsync<List<StatusData>>("Get", typeof(StatusData), new
            {
                search = new StatusDataSearch
                {
                    DeviceSearch = new DeviceSearch { Id = deviceId },
                    FromDate = nearTime,
                    ToDate = time.AddMinutes(1)
                }
            }, ct);
            
            if (statusData != null)
            {
                foreach (var data in statusData)
                {
                    var diagName = data.Diagnostic?.Name?.ToLower() ?? "";
                    
                    if (diagName.Contains("seatbelt"))
                        status.SeatbeltFastened = data.Data > 0;
                    else if (diagName.Contains("headlight") || diagName.Contains("headlamp"))
                        status.HeadlightsOn = data.Data > 0;
                    else if (diagName.Contains("fuel level"))
                        status.FuelLevelPercent = data.Data;
                    else if (diagName.Contains("engine rpm") || diagName.Contains("engine speed"))
                        status.EngineRpm = (int?)data.Data;
                    else if (diagName.Contains("abs") && diagName.Contains("active"))
                        status.AbsActivated = data.Data > 0;
                    else if (diagName.Contains("traction control"))
                        status.TractionControlActivated = data.Data > 0;
                    else if (diagName.Contains("stability control"))
                        status.StabilityControlActivated = data.Data > 0;
                }
            }
        }
        catch
        {
            // Ignore errors - not all vehicles report all data
        }
        
        return status;
    }
}

/// <summary>
/// Internal class for collecting vehicle status diagnostics
/// </summary>
internal class VehicleStatusSnapshot
{
    public bool? SeatbeltFastened { get; set; }
    public bool? HeadlightsOn { get; set; }
    public double? FuelLevelPercent { get; set; }
    public int? EngineRpm { get; set; }
    public bool? AbsActivated { get; set; }
    public bool? TractionControlActivated { get; set; }
    public bool? StabilityControlActivated { get; set; }
}

public interface IWeatherService
{
    Task<WeatherInfo?> GetWeatherAsync(double lat, double lon, DateTime time, CancellationToken ct = default);
}

public class WeatherInfo
{
    public string? Condition { get; set; }
    public double? TemperatureCelsius { get; set; }
}
