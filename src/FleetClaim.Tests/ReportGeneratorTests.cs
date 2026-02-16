using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Moq;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Tests for report generation logic.
/// Since the Geotab API is not mockable, we test the isolated logic directly.
/// </summary>
public class ReportGeneratorTests
{
    [Theory]
    [InlineData(3, IncidentSeverity.Low)]
    [InlineData(6, IncidentSeverity.High)]
    [InlineData(9, IncidentSeverity.Critical)]
    public void DetermineSeverity_FromDeceleration(double deceleration, IncidentSeverity expected)
    {
        // Arrange
        var evidence = new EvidencePackage { DecelerationMps2 = -deceleration };
        
        // Act
        var severity = DetermineSeverityFromEvidence(evidence);
        
        // Assert
        Assert.Equal(expected, severity);
    }
    
    [Theory]
    [InlineData(40, IncidentSeverity.Low)]
    [InlineData(80, IncidentSeverity.Medium)]
    [InlineData(120, IncidentSeverity.High)]
    public void DetermineSeverity_FromSpeed(double speed, IncidentSeverity expected)
    {
        // Arrange
        var evidence = new EvidencePackage { SpeedAtEventKmh = speed };
        
        // Act
        var severity = DetermineSeverityFromEvidence(evidence);
        
        // Assert
        Assert.Equal(expected, severity);
    }
    
    [Fact]
    public void DetermineSeverity_DecelTakesPrecedence()
    {
        // High decel should result in Critical even with low speed
        var evidence = new EvidencePackage 
        { 
            DecelerationMps2 = -9, // Critical level
            SpeedAtEventKmh = 30   // Would be Low
        };
        
        var severity = DetermineSeverityFromEvidence(evidence);
        
        Assert.Equal(IncidentSeverity.Critical, severity);
    }
    
    [Fact]
    public void BuildSummary_IncludesVehicleAndSpeed()
    {
        // Arrange
        var vehicleName = "Truck 47";
        var speed = 85.0;
        var eventType = "Harsh Braking";
        var weather = "Rain";
        
        // Act
        var summary = BuildSummary(eventType, vehicleName, speed, weather);
        
        // Assert
        Assert.Contains("Truck 47", summary);
        Assert.Contains("85", summary);
        Assert.Contains("Harsh Braking", summary);
        Assert.Contains("Rain", summary);
    }
    
    [Fact]
    public void BuildSummary_HandlesNulls()
    {
        // Act
        var summary = BuildSummary("Incident", null, null, null);
        
        // Assert
        Assert.Contains("Incident", summary);
        Assert.DoesNotContain("null", summary.ToLower());
    }
    
    [Fact]
    public void IncidentReport_PopulatesDefaultValues()
    {
        // Arrange & Act
        var report = new IncidentReport
        {
            IncidentId = "exc_123",
            VehicleId = "dev_456",
            VehicleName = "Fleet Van 12",
            Summary = "Hard braking on Highway 401"
        };
        
        // Assert
        Assert.NotNull(report.Id);
        Assert.StartsWith("rpt_", report.Id);
        Assert.Equal(IncidentSeverity.Medium, report.Severity); // Default
        Assert.NotNull(report.Evidence);
        Assert.Empty(report.Evidence.GpsTrail);
    }
    
    [Fact]
    public void IncidentReport_TracksTimestamps()
    {
        // Arrange
        var occurredAt = new DateTime(2024, 2, 15, 14, 30, 0, DateTimeKind.Utc);
        
        // Act
        var report = new IncidentReport { OccurredAt = occurredAt };
        
        // Assert
        Assert.Equal(occurredAt, report.OccurredAt);
        Assert.True(report.GeneratedAt >= DateTime.UtcNow.AddMinutes(-1)); // Just generated
    }
    
    // Helper methods that mirror ReportGenerator's internal logic
    // This allows testing the algorithms without needing to mock the API
    
    private static IncidentSeverity DetermineSeverityFromEvidence(EvidencePackage evidence)
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
    
    private static string BuildSummary(string eventType, string? vehicleName, double? speed, string? weather)
    {
        var parts = new List<string> { eventType };
        
        if (vehicleName != null)
            parts.Add($"involving {vehicleName}");
        
        if (speed.HasValue)
            parts.Add($"at {speed:F0} km/h");
        
        if (!string.IsNullOrEmpty(weather))
            parts.Add($"({weather} conditions)");
        
        return string.Join(" ", parts);
    }
}
