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
        
        // Assert - IncidentReport uses default PascalCase JSON serialization
        Assert.Contains("\"Id\":", json);
        Assert.Contains("\"VehicleId\":", json);
        Assert.Contains("\"IsBaselineReport\":", json);
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
        Assert.NotNull(evidence.AccelerometerEvents);
        Assert.Empty(evidence.AccelerometerEvents);
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
        Assert.Equal(IncidentSeverity.Medium, config.SeverityThreshold);
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
        Assert.NotNull(wrapper.Payload.ToString());
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
        Assert.NotEqual(default, wrapper.Payload); // JsonElement is a struct, use NotEqual default
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

    [Fact]
    public void AddInDataWrapper_TryGetPayload_ReturnsFalseForMalformedPayload()
    {
        // status must be a string, but this payload has an object.
        var malformed = """
        {
          "type": "driverSubmission",
          "payload": {
            "id": "sub_001",
            "deviceId": "b1",
            "incidentTimestamp": "2026-03-11T10:00:00Z",
            "status": { "value": "synced" }
          }
        }
        """;

        var wrapper = JsonSerializer.Deserialize<AddInDataWrapper>(malformed);

        Assert.NotNull(wrapper);
        var ok = wrapper!.TryGetPayload<DriverSubmission>(out var submission);
        Assert.False(ok);
        Assert.Null(submission);
    }

    [Fact]
    public void AddInDataWrapper_ForWorkerState_CreatesCorrectType()
    {
        // Arrange
        var state = new WorkerState { FeedVersion = 12345, LastPolledAt = DateTime.UtcNow };

        // Act
        var wrapper = AddInDataWrapper.ForWorkerState(state);

        // Assert
        Assert.Equal("workerState", wrapper.Type);
        Assert.NotEqual(default, wrapper.Payload);
    }

    [Fact]
    public void AddInDataWrapper_ForWorkerState_RoundTrip()
    {
        // Arrange
        var state = new WorkerState
        {
            FeedVersion = 987654321,
            LastPolledAt = new DateTime(2026, 3, 1, 12, 0, 0, DateTimeKind.Utc)
        };
        var wrapper = AddInDataWrapper.ForWorkerState(state);

        // Act
        var deserialized = wrapper.GetPayload<WorkerState>();

        // Assert
        Assert.NotNull(deserialized);
        Assert.Equal(987654321, deserialized.FeedVersion);
        Assert.Equal(state.LastPolledAt, deserialized.LastPolledAt);
    }

    [Fact]
    public void WorkerState_DefaultValues()
    {
        // Act
        var state = new WorkerState();

        // Assert
        Assert.Equal(0, state.FeedVersion);
        Assert.Null(state.LastPolledAt);
    }
    
    [Theory]
    [InlineData("General", PhotoCategory.General)]
    [InlineData("VehicleDamage", PhotoCategory.VehicleDamage)]
    [InlineData("SceneOverview", PhotoCategory.SceneOverview)]
    [InlineData("general", PhotoCategory.General)]  // lowercase
    [InlineData("VEHICLEDAMAGE", PhotoCategory.VehicleDamage)]  // uppercase
    [InlineData("vehicledamage", PhotoCategory.VehicleDamage)]  // lowercase
    public void PhotoAttachment_Category_ParsesKnownValues(string categoryString, PhotoCategory expected)
    {
        // Arrange
        var json = $$"""{"category":"{{categoryString}}","mediaFileId":"test","fileName":"test.jpg"}""";
        
        // Act
        var photo = JsonSerializer.Deserialize<PhotoAttachment>(json);
        
        // Assert
        Assert.NotNull(photo);
        Assert.Equal(expected, photo.Category);
        Assert.Equal(categoryString, photo.CategoryString);
    }
    
    [Theory]
    [InlineData("UnknownCategory")]
    [InlineData("SomeNewCategory")]
    [InlineData("invalid")]
    [InlineData("")]
    [InlineData(null)]
    public void PhotoAttachment_Category_DefaultsToGeneralForUnknownValues(string? categoryString)
    {
        // Arrange - this test ensures unknown enum values don't throw exceptions
        // This was a bug where JSON with unknown category values caused deserialization to fail
        var json = categoryString != null 
            ? $$"""{"category":"{{categoryString}}","mediaFileId":"test","fileName":"test.jpg"}"""
            : """{"mediaFileId":"test","fileName":"test.jpg"}""";
        
        // Act - should NOT throw
        var photo = JsonSerializer.Deserialize<PhotoAttachment>(json);
        
        // Assert
        Assert.NotNull(photo);
        Assert.Equal(PhotoCategory.General, photo.Category);
    }
    
    [Fact]
    public void PhotoAttachment_WithUnknownCategory_DeserializesInReport()
    {
        // Arrange - simulate real-world JSON with unknown category
        // This was the actual bug: reports with photos containing unknown categories
        // caused "The JSON value could not be converted to PhotoCategory" error
        var json = """
        {
            "Id": "rpt_001",
            "Evidence": {
                "Photos": [
                    {"category": "UnknownFutureCategory", "mediaFileId": "m1", "fileName": "photo.jpg"}
                ]
            }
        }
        """;
        
        // Act - should NOT throw
        var report = JsonSerializer.Deserialize<IncidentReport>(json);
        
        // Assert
        Assert.NotNull(report);
        Assert.NotNull(report.Evidence);
        Assert.Single(report.Evidence.Photos);
        Assert.Equal(PhotoCategory.General, report.Evidence.Photos[0].Category);
        Assert.Equal("UnknownFutureCategory", report.Evidence.Photos[0].CategoryString);
    }
}
