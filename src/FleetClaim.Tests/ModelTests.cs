using FleetClaim.Core.Models;
using System.Text.Json;
using Xunit;

namespace FleetClaim.Tests;

public class ModelTests
{
    [Fact]
    public void IncidentReport_Serialization_RoundTrip()
    {
        // Arrange
        var report = new IncidentReport
        {
            Id = "rpt_001",
            IncidentId = "inc_001",
            VehicleId = "v1",
            VehicleName = "Test Vehicle",
            DriverId = "d1",
            DriverName = "John Doe",
            OccurredAt = DateTime.UtcNow,
            GeneratedAt = DateTime.UtcNow,
            Severity = IncidentSeverity.High,
            Summary = "Test incident",
            IncidentAddress = "123 Main St",
            IncidentCity = "Toronto",
            IncidentState = "ON",
            IncidentCountry = "Canada"
        };
        
        // Act
        var json = JsonSerializer.Serialize(report);
        var deserialized = JsonSerializer.Deserialize<IncidentReport>(json);
        
        // Assert
        Assert.NotNull(deserialized);
        Assert.Equal(report.Id, deserialized.Id);
        Assert.Equal(report.VehicleName, deserialized.VehicleName);
        Assert.Equal(report.Severity, deserialized.Severity);
    }
    
    [Fact]
    public void IncidentReport_JsonPropertyNames_Correct()
    {
        // Arrange
        var report = new IncidentReport
        {
            Id = "test_id",
            VehicleId = "v1",
            IsBaselineReport = true
        };
        
        // Act
        var json = JsonSerializer.Serialize(report);
        
        // Assert
        Assert.Contains("\"id\":", json);
        Assert.Contains("\"vehicleId\":", json);
        Assert.Contains("\"isBaselineReport\":", json);
    }
    
    [Fact]
    public void ReportRequest_DefaultValues()
    {
        // Act
        var request = new ReportRequest();
        
        // Assert
        Assert.NotNull(request.Id);
        Assert.StartsWith("req_", request.Id);
        Assert.Equal(ReportRequestStatus.Pending, request.Status);
        Assert.False(request.ForceReport);
    }
    
    [Fact]
    public void ReportRequest_Serialization_RoundTrip()
    {
        // Arrange
        var request = new ReportRequest
        {
            DeviceId = "d1",
            DeviceName = "Test Vehicle",
            FromDate = DateTime.UtcNow.AddHours(-2),
            ToDate = DateTime.UtcNow,
            RequestedBy = "user@test.com",
            ForceReport = true,
            Status = ReportRequestStatus.Processing
        };
        
        // Act
        var json = JsonSerializer.Serialize(request);
        var deserialized = JsonSerializer.Deserialize<ReportRequest>(json);
        
        // Assert
        Assert.NotNull(deserialized);
        Assert.Equal(request.DeviceId, deserialized.DeviceId);
        Assert.Equal(request.ForceReport, deserialized.ForceReport);
        Assert.Equal(request.Status, deserialized.Status);
    }
    
    [Fact]
    public void ReportRequest_JsonPropertyNames_Correct()
    {
        // Arrange
        var request = new ReportRequest
        {
            DeviceId = "d1",
            FromDate = DateTime.UtcNow,
            ToDate = DateTime.UtcNow,
            ForceReport = true
        };
        
        // Act
        var json = JsonSerializer.Serialize(request);
        
        // Assert
        Assert.Contains("\"deviceId\":", json);
        Assert.Contains("\"fromDate\":", json);
        Assert.Contains("\"toDate\":", json);
        Assert.Contains("\"forceReport\":", json);
    }
    
    [Theory]
    [InlineData(IncidentSeverity.Low)]
    [InlineData(IncidentSeverity.Medium)]
    [InlineData(IncidentSeverity.High)]
    [InlineData(IncidentSeverity.Critical)]
    public void IncidentSeverity_Serialization(IncidentSeverity severity)
    {
        // Arrange
        var report = new IncidentReport { Severity = severity };
        
        // Act
        var json = JsonSerializer.Serialize(report);
        var deserialized = JsonSerializer.Deserialize<IncidentReport>(json);
        
        // Assert
        Assert.NotNull(deserialized);
        Assert.Equal(severity, deserialized.Severity);
    }
    
    [Theory]
    [InlineData(ReportRequestStatus.Pending)]
    [InlineData(ReportRequestStatus.Processing)]
    [InlineData(ReportRequestStatus.Completed)]
    [InlineData(ReportRequestStatus.Failed)]
    public void ReportRequestStatus_Serialization(ReportRequestStatus status)
    {
        // Arrange
        var request = new ReportRequest { Status = status };
        
        // Act
        var json = JsonSerializer.Serialize(request);
        var deserialized = JsonSerializer.Deserialize<ReportRequest>(json);
        
        // Assert
        Assert.NotNull(deserialized);
        Assert.Equal(status, deserialized.Status);
    }
    
    [Fact]
    public void EvidencePackage_DefaultValues()
    {
        // Act
        var evidence = new EvidencePackage();
        
        // Assert
        Assert.NotNull(evidence.GpsTrail);
        Assert.Empty(evidence.GpsTrail);
        Assert.NotNull(evidence.SpeedProfile);
        Assert.Empty(evidence.SpeedProfile);
    }
    
    [Fact]
    public void GpsPoint_Properties()
    {
        // Arrange
        var point = new GpsPoint
        {
            Latitude = 43.65,
            Longitude = -79.38,
            SpeedKmh = 50.5,
            Timestamp = DateTime.UtcNow
        };
        
        // Act
        var json = JsonSerializer.Serialize(point);
        var deserialized = JsonSerializer.Deserialize<GpsPoint>(json);
        
        // Assert
        Assert.NotNull(deserialized);
        Assert.Equal(point.Latitude, deserialized.Latitude);
        Assert.Equal(point.Longitude, deserialized.Longitude);
        Assert.Equal(point.SpeedKmh, deserialized.SpeedKmh);
    }
    
    [Fact]
    public void CustomerConfig_DefaultValues()
    {
        // Act
        var config = new CustomerConfig();
        
        // Assert
        Assert.NotNull(config.AutoGenerateRules);
        Assert.NotNull(config.NotifyEmails);
        Assert.Equal(IncidentSeverity.Low, config.SeverityThreshold);
    }
    
    [Fact]
    public void AddInDataWrapper_ForReport_CreatesCorrectType()
    {
        // Arrange
        var report = new IncidentReport { Id = "rpt_001" };
        
        // Act
        var wrapper = AddInDataWrapper.ForReport(report);
        
        // Assert
        Assert.Equal("report", wrapper.Type);
        Assert.NotNull(wrapper.Payload);
        Assert.Equal(1, wrapper.Version);
    }
    
    [Fact]
    public void AddInDataWrapper_ForRequest_CreatesCorrectType()
    {
        // Arrange
        var request = new ReportRequest { DeviceId = "d1" };
        
        // Act
        var wrapper = AddInDataWrapper.ForRequest(request);
        
        // Assert
        Assert.Equal("reportRequest", wrapper.Type);
        Assert.NotNull(wrapper.Payload);
    }
    
    [Fact]
    public void AddInDataWrapper_GetPayload_DeserializesCorrectly()
    {
        // Arrange
        var report = new IncidentReport 
        { 
            Id = "rpt_001",
            VehicleName = "Test Vehicle"
        };
        var wrapper = AddInDataWrapper.ForReport(report);
        
        // Act
        var deserialized = wrapper.GetPayload<IncidentReport>();
        
        // Assert
        Assert.NotNull(deserialized);
        Assert.Equal("rpt_001", deserialized.Id);
        Assert.Equal("Test Vehicle", deserialized.VehicleName);
    }
}
