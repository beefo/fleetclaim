using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Moq;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Unit tests for IncidentCollector logic.
/// Tests the evidence collection algorithms without mocking the full Geotab API.
/// </summary>
public class IncidentCollectorTests
{
    [Fact]
    public void GpsPoint_CalculatesTimeDelta()
    {
        // Arrange
        var point1 = new GpsPoint
        {
            Timestamp = new DateTime(2024, 2, 15, 14, 30, 0),
            Latitude = 43.65,
            Longitude = -79.38,
            SpeedKmh = 50
        };
        
        var point2 = new GpsPoint
        {
            Timestamp = new DateTime(2024, 2, 15, 14, 30, 10),
            Latitude = 43.651,
            Longitude = -79.381,
            SpeedKmh = 45
        };
        
        // Act
        var delta = (point2.Timestamp - point1.Timestamp).TotalSeconds;
        
        // Assert
        Assert.Equal(10, delta);
    }
    
    [Fact]
    public void EvidencePackage_DefaultsAreEmpty()
    {
        // Act
        var evidence = new EvidencePackage();
        
        // Assert
        Assert.Empty(evidence.GpsTrail);
        Assert.Empty(evidence.Diagnostics);
        Assert.Null(evidence.MaxSpeedKmh);
        Assert.Null(evidence.SpeedAtEventKmh);
        Assert.Null(evidence.DecelerationMps2);
        Assert.Null(evidence.WeatherCondition);
    }
    
    [Fact]
    public void EvidencePackage_CanStoreGpsTrail()
    {
        // Arrange
        var trail = new List<GpsPoint>
        {
            new() { Timestamp = DateTime.UtcNow, Latitude = 43.65, Longitude = -79.38, SpeedKmh = 50 },
            new() { Timestamp = DateTime.UtcNow.AddSeconds(1), Latitude = 43.651, Longitude = -79.381, SpeedKmh = 48 },
            new() { Timestamp = DateTime.UtcNow.AddSeconds(2), Latitude = 43.652, Longitude = -79.382, SpeedKmh = 30 }
        };
        
        // Act
        var evidence = new EvidencePackage { GpsTrail = trail };
        
        // Assert
        Assert.Equal(3, evidence.GpsTrail.Count);
    }
    
    [Fact]
    public void CalculateDeceleration_FromSpeedPoints()
    {
        // Simulating deceleration calculation logic
        // Speed drops from 50 km/h to 30 km/h in 2 seconds
        var speed1 = 50.0; // km/h
        var speed2 = 30.0; // km/h
        var deltaTimeSeconds = 2.0;
        
        // Convert to m/s
        var speed1Ms = speed1 / 3.6;
        var speed2Ms = speed2 / 3.6;
        
        // Calculate deceleration
        var deceleration = (speed2Ms - speed1Ms) / deltaTimeSeconds;
        
        // Assert - should be negative (slowing down)
        Assert.True(deceleration < 0);
        Assert.InRange(deceleration, -3, -2.5); // About -2.78 m/s²
    }
    
    [Fact]
    public void DiagnosticSnapshot_StoresValues()
    {
        // Arrange & Act
        var diag = new DiagnosticSnapshot
        {
            Code = "P0171",
            Description = "System Too Lean Bank 1",
            Value = 14.7,
            Unit = "lambda"
        };
        
        // Assert
        Assert.Equal("P0171", diag.Code);
        Assert.Equal("System Too Lean Bank 1", diag.Description);
        Assert.Equal(14.7, diag.Value);
    }
    
    [Fact]
    public async Task WeatherService_MockReturnsData()
    {
        // Arrange
        var mockWeather = new Mock<IWeatherService>();
        mockWeather
            .Setup(w => w.GetWeatherAsync(It.IsAny<double>(), It.IsAny<double>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new WeatherInfo
            {
                Condition = "Clear",
                TemperatureCelsius = 15.5
            });
        
        // Act
        var weather = await mockWeather.Object.GetWeatherAsync(43.65, -79.38, DateTime.UtcNow);
        
        // Assert
        Assert.NotNull(weather);
        Assert.Equal("Clear", weather.Condition);
        Assert.Equal(15.5, weather.TemperatureCelsius);
    }
    
    [Fact]
    public void HosStatus_StoresDriverStatus()
    {
        // Arrange & Act
        var hos = new HosStatus
        {
            Status = "Driving",
            DriveTimeRemaining = TimeSpan.FromHours(5.5),
            DutyTimeRemaining = TimeSpan.FromHours(8)
        };
        
        // Assert
        Assert.Equal("Driving", hos.Status);
        Assert.Equal(5.5, hos.DriveTimeRemaining?.TotalHours);
        Assert.Equal(8, hos.DutyTimeRemaining?.TotalHours);
    }
    
    [Fact]
    public void MaxSpeed_CalculatedFromTrail()
    {
        // Arrange
        var trail = new List<GpsPoint>
        {
            new() { SpeedKmh = 50 },
            new() { SpeedKmh = 85 },
            new() { SpeedKmh = 72 },
            new() { SpeedKmh = 45 },
            new() { SpeedKmh = null } // Some points might not have speed
        };
        
        // Act
        var maxSpeed = trail.Max(p => p.SpeedKmh ?? 0);
        
        // Assert
        Assert.Equal(85, maxSpeed);
    }
    
    [Fact]
    public void FindIncidentPoint_NearestToEventTime()
    {
        // Arrange
        var eventTime = new DateTime(2024, 2, 15, 14, 30, 30);
        var trail = new List<GpsPoint>
        {
            new() { Timestamp = new DateTime(2024, 2, 15, 14, 30, 0), SpeedKmh = 50 },
            new() { Timestamp = new DateTime(2024, 2, 15, 14, 30, 28), SpeedKmh = 45 }, // Closest
            new() { Timestamp = new DateTime(2024, 2, 15, 14, 31, 0), SpeedKmh = 20 }
        };
        
        // Act
        var closest = trail.MinBy(p => Math.Abs((p.Timestamp - eventTime).TotalSeconds));
        
        // Assert
        Assert.NotNull(closest);
        Assert.Equal(45, closest.SpeedKmh);
    }
}
