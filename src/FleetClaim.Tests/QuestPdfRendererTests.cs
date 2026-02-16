using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Xunit;

namespace FleetClaim.Tests;

public class QuestPdfRendererTests
{
    private readonly QuestPdfRenderer _renderer;
    
    public QuestPdfRendererTests()
    {
        _renderer = new QuestPdfRenderer(new PdfOptions
        {
            CompanyName = "Test Company"
        });
    }
    
    [Fact]
    public async Task RenderPdfAsync_ReturnsBase64String()
    {
        // Arrange
        var report = CreateTestReport();
        
        // Act
        var result = await _renderer.RenderPdfAsync(report);
        
        // Assert
        Assert.NotNull(result);
        Assert.NotEmpty(result);
        
        // Verify it's valid base64
        var bytes = Convert.FromBase64String(result);
        Assert.True(bytes.Length > 0);
    }
    
    [Fact]
    public async Task RenderPdfAsync_ProducesValidPdf()
    {
        // Arrange
        var report = CreateTestReport();
        
        // Act
        var result = await _renderer.RenderPdfAsync(report);
        var bytes = Convert.FromBase64String(result);
        
        // Assert - PDF files start with %PDF
        Assert.True(bytes.Length >= 4);
        Assert.Equal((byte)'%', bytes[0]);
        Assert.Equal((byte)'P', bytes[1]);
        Assert.Equal((byte)'D', bytes[2]);
        Assert.Equal((byte)'F', bytes[3]);
    }
    
    [Fact]
    public async Task RenderPdfAsync_HandlesEmptyGpsTrail()
    {
        // Arrange
        var report = CreateTestReport();
        report.Evidence.GpsTrail = new List<GpsPoint>();
        
        // Act
        var result = await _renderer.RenderPdfAsync(report);
        
        // Assert - should not throw and should produce valid PDF
        Assert.NotEmpty(result);
        var bytes = Convert.FromBase64String(result);
        Assert.True(bytes.Length > 100); // Should be a reasonable size
    }
    
    [Fact]
    public async Task RenderPdfAsync_HandlesManyGpsPoints()
    {
        // Arrange
        var report = CreateTestReport();
        report.Evidence.GpsTrail = Enumerable.Range(0, 1000)
            .Select(i => new GpsPoint
            {
                Timestamp = DateTime.UtcNow.AddSeconds(-1000 + i),
                Latitude = 43.65 + (i * 0.0001),
                Longitude = -79.38 + (i * 0.0001),
                SpeedKmh = 50 + (i % 30)
            })
            .ToList();
        
        // Act
        var result = await _renderer.RenderPdfAsync(report);
        
        // Assert
        Assert.NotEmpty(result);
    }
    
    [Fact]
    public async Task RenderPdfAsync_HandlesDifferentSeverities()
    {
        // Arrange & Act & Assert - all severities should render
        foreach (var severity in Enum.GetValues<IncidentSeverity>())
        {
            var report = CreateTestReport();
            report.Severity = severity;
            
            var result = await _renderer.RenderPdfAsync(report);
            Assert.NotEmpty(result);
        }
    }
    
    [Fact]
    public async Task RenderPdfAsync_IncludesShareUrl()
    {
        // Arrange
        var report = CreateTestReport();
        report.ShareUrl = "https://fleetclaim.app/r/test123";
        
        // Act
        var result = await _renderer.RenderPdfAsync(report);
        
        // Assert - PDF is generated (we can't easily verify content, but it shouldn't throw)
        Assert.NotEmpty(result);
    }
    
    [Fact]
    public async Task RenderPdfAsync_HandlesDiagnostics()
    {
        // Arrange
        var report = CreateTestReport();
        report.Evidence.Diagnostics = Enumerable.Range(0, 50)
            .Select(i => new DiagnosticSnapshot
            {
                Code = $"P{i:D4}",
                Description = $"Diagnostic {i}",
                Value = i * 1.5,
                Unit = "units"
            })
            .ToList();
        
        // Act
        var result = await _renderer.RenderPdfAsync(report);
        
        // Assert
        Assert.NotEmpty(result);
    }
    
    private static IncidentReport CreateTestReport()
    {
        return new IncidentReport
        {
            Id = "rpt_test123",
            IncidentId = "exc_abc456",
            VehicleId = "v001",
            VehicleName = "Test Truck 42",
            DriverId = "d001",
            DriverName = "John Smith",
            OccurredAt = DateTime.UtcNow.AddMinutes(-30),
            GeneratedAt = DateTime.UtcNow,
            Severity = IncidentSeverity.High,
            Summary = "Hard braking event involving Test Truck 42 at 85 km/h (Clear conditions)",
            Evidence = new EvidencePackage
            {
                GpsTrail = new List<GpsPoint>
                {
                    new() { Timestamp = DateTime.UtcNow.AddMinutes(-32), Latitude = 43.650, Longitude = -79.380, SpeedKmh = 60 },
                    new() { Timestamp = DateTime.UtcNow.AddMinutes(-31), Latitude = 43.651, Longitude = -79.381, SpeedKmh = 75 },
                    new() { Timestamp = DateTime.UtcNow.AddMinutes(-30), Latitude = 43.652, Longitude = -79.382, SpeedKmh = 85 },
                    new() { Timestamp = DateTime.UtcNow.AddMinutes(-29.5), Latitude = 43.6525, Longitude = -79.3825, SpeedKmh = 45 },
                    new() { Timestamp = DateTime.UtcNow.AddMinutes(-29), Latitude = 43.653, Longitude = -79.383, SpeedKmh = 50 },
                },
                MaxSpeedKmh = 85,
                SpeedAtEventKmh = 85,
                DecelerationMps2 = -8.5,
                WeatherCondition = "Clear",
                TemperatureCelsius = 22,
                Diagnostics = new List<DiagnosticSnapshot>
                {
                    new() { Code = "P0001", Description = "Engine RPM", Value = 2500, Unit = "RPM" },
                    new() { Code = "P0002", Description = "Throttle Position", Value = 12, Unit = "%" }
                }
            }
        };
    }
}
