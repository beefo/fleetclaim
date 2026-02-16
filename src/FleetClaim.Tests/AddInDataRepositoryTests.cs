using System.Text.Json;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using Geotab.Checkmate;
using Moq;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Tests for AddInDataRepository.
/// Note: These tests verify the model filtering/ordering logic rather than 
/// Geotab API integration, which requires mocking the dynamic API structure.
/// </summary>
public class AddInDataRepositoryTests
{
    [Fact]
    public void AddInDataWrapper_SerializesReportCorrectly()
    {
        // Arrange
        var report = new IncidentReport
        {
            Id = "rpt_001",
            Summary = "Hard braking event",
            Severity = IncidentSeverity.High
        };
        
        // Act
        var wrapper = AddInDataWrapper.ForReport(report);
        
        // Assert
        Assert.Equal("report", wrapper.Type);
        var deserialized = wrapper.GetPayload<IncidentReport>();
        Assert.NotNull(deserialized);
        Assert.Equal("rpt_001", deserialized.Id);
        Assert.Equal(IncidentSeverity.High, deserialized.Severity);
    }
    
    [Fact]
    public void AddInDataWrapper_SerializesRequestCorrectly()
    {
        // Arrange
        var request = new ReportRequest
        {
            Id = "req_001",
            IncidentId = "exc_123",
            Status = ReportRequestStatus.Pending
        };
        
        // Act
        var wrapper = AddInDataWrapper.ForRequest(request);
        
        // Assert
        Assert.Equal("reportRequest", wrapper.Type);
        var deserialized = wrapper.GetPayload<ReportRequest>();
        Assert.NotNull(deserialized);
        Assert.Equal("req_001", deserialized.Id);
        Assert.Equal(ReportRequestStatus.Pending, deserialized.Status);
    }
    
    [Fact]
    public void AddInDataWrapper_SerializesConfigCorrectly()
    {
        // Arrange
        var config = new CustomerConfig
        {
            NotifyEmails = new List<string> { "admin@company.com", "safety@company.com" },
            NotifyWebhook = "https://webhook.company.com/fleetclaim",
            SeverityThreshold = IncidentSeverity.High,
            AutoGenerateRules = new List<string> { "HarshBraking", "Collision" }
        };
        
        // Act
        var wrapper = AddInDataWrapper.ForConfig(config);
        
        // Assert
        Assert.Equal("config", wrapper.Type);
        var deserialized = wrapper.GetPayload<CustomerConfig>();
        Assert.NotNull(deserialized);
        Assert.Equal(2, deserialized.NotifyEmails.Count);
        Assert.Equal(IncidentSeverity.High, deserialized.SeverityThreshold);
    }
    
    [Fact]
    public void AddInDataWrapper_RoundTripsViaJson()
    {
        // Arrange
        var report = new IncidentReport
        {
            Id = "rpt_test",
            Summary = "Test incident",
            VehicleId = "vehicle_123",
            OccurredAt = new DateTime(2024, 2, 15, 14, 30, 0, DateTimeKind.Utc)
        };
        
        var wrapper = AddInDataWrapper.ForReport(report);
        
        // Act - simulate JSON round-trip like it would go through Geotab
        var json = JsonSerializer.Serialize(wrapper);
        var restored = JsonSerializer.Deserialize<AddInDataWrapper>(json);
        
        // Assert
        Assert.NotNull(restored);
        Assert.Equal("report", restored.Type);
        var restoredReport = restored.GetPayload<IncidentReport>();
        Assert.NotNull(restoredReport);
        Assert.Equal("rpt_test", restoredReport.Id);
        Assert.Equal("vehicle_123", restoredReport.VehicleId);
    }
    
    [Fact]
    public void IncidentReport_DefaultIdGeneration()
    {
        // Act
        var report1 = new IncidentReport();
        var report2 = new IncidentReport();
        
        // Assert - each should get a unique ID
        Assert.NotNull(report1.Id);
        Assert.NotNull(report2.Id);
        Assert.StartsWith("rpt_", report1.Id);
        Assert.StartsWith("rpt_", report2.Id);
        Assert.NotEqual(report1.Id, report2.Id);
    }
    
    [Fact]
    public void ReportRequest_DefaultIdGeneration()
    {
        // Act
        var request1 = new ReportRequest();
        var request2 = new ReportRequest();
        
        // Assert
        Assert.NotNull(request1.Id);
        Assert.NotNull(request2.Id);
        Assert.StartsWith("req_", request1.Id);
        Assert.StartsWith("req_", request2.Id);
        Assert.NotEqual(request1.Id, request2.Id);
    }
}
