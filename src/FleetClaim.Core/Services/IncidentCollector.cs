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
        
        // Parallel fetch for speed
        var gpsTask = GetGpsTrailAsync(api, deviceId, fromDate, toDate, ct);
        var diagnosticsTask = GetDiagnosticsAsync(api, deviceId, fromDate, toDate, ct);
        var driverTask = GetDriverInfoAsync(api, incident, ct);
        
        await Task.WhenAll(gpsTask, diagnosticsTask, driverTask);
        
        var gpsPoints = await gpsTask;
        var diagnostics = await diagnosticsTask;
        var (driverId, hosStatus) = await driverTask;
        
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
        
        return new EvidencePackage
        {
            GpsTrail = gpsPoints,
            MaxSpeedKmh = maxSpeed,
            SpeedAtEventKmh = speedAtEvent,
            DecelerationMps2 = deceleration,
            WeatherCondition = weather?.Condition,
            TemperatureCelsius = weather?.TemperatureCelsius,
            Diagnostics = diagnostics,
            DriverHosStatus = hosStatus
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
    
    private Task<(string? DriverId, HosStatus? HosStatus)> GetDriverInfoAsync(
        API api, ExceptionEvent incident, CancellationToken ct)
    {
        // Get driver assignment at incident time
        if (incident.Driver?.Id == null)
            return Task.FromResult<(string?, HosStatus?)>((null, null));
        
        // For now, just return driver ID
        // TODO: Fetch HOS status from DutyStatusLog if needed
        return Task.FromResult<(string?, HosStatus?)>((incident.Driver.Id.ToString(), null));
    }
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
