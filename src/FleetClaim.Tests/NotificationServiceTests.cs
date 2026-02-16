using System.Net;
using System.Text.Json;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Moq;
using Moq.Protected;
using Xunit;

namespace FleetClaim.Tests;

public class NotificationServiceTests
{
    [Fact]
    public async Task SendNotificationsAsync_WebhookOnlyConfig_PostsToWebhook()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK));
        
        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);
        
        var report = CreateTestReport();
        var config = new CustomerConfig
        {
            NotifyEmails = new List<string>(),
            NotifyWebhook = "https://webhook.example.com/fleetclaim"
        };
        
        // Act
        await service.SendNotificationsAsync(report, config);
        
        // Assert
        handlerMock.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req =>
                req.Method == HttpMethod.Post &&
                req.RequestUri!.ToString() == "https://webhook.example.com/fleetclaim"),
            ItExpr.IsAny<CancellationToken>());
    }
    
    [Fact]
    public async Task SendNotificationsAsync_NoConfiguredNotifications_DoesNothing()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);
        
        var report = CreateTestReport();
        var config = new CustomerConfig
        {
            NotifyEmails = new List<string>(),
            NotifyWebhook = null
        };
        
        // Act
        await service.SendNotificationsAsync(report, config);
        
        // Assert - no HTTP calls should be made
        handlerMock.Protected().Verify(
            "SendAsync",
            Times.Never(),
            ItExpr.IsAny<HttpRequestMessage>(),
            ItExpr.IsAny<CancellationToken>());
    }
    
    [Fact]
    public async Task SendNotificationsAsync_WebhookPayloadContainsCorrectData()
    {
        // Arrange
        HttpRequestMessage? capturedRequest = null;
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK));
        
        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);
        
        var report = CreateTestReport();
        report.Id = "rpt_test123";
        report.VehicleName = "Truck 42";
        report.Severity = IncidentSeverity.High;
        
        var config = new CustomerConfig
        {
            NotifyWebhook = "https://webhook.example.com/test"
        };
        
        // Act
        await service.SendNotificationsAsync(report, config);
        
        // Assert
        Assert.NotNull(capturedRequest);
        var content = await capturedRequest!.Content!.ReadAsStringAsync();
        var payload = JsonSerializer.Deserialize<JsonElement>(content);
        
        Assert.Equal("incident.report.generated", payload.GetProperty("eventType").GetString());
        Assert.Equal("rpt_test123", payload.GetProperty("report").GetProperty("id").GetString());
        Assert.Equal("Truck 42", payload.GetProperty("report").GetProperty("vehicleName").GetString());
        Assert.Equal("High", payload.GetProperty("report").GetProperty("severity").GetString());
    }
    
    private static IncidentReport CreateTestReport()
    {
        return new IncidentReport
        {
            Id = "rpt_abc123",
            IncidentId = "incident_xyz",
            VehicleId = "v123",
            VehicleName = "Test Vehicle",
            DriverId = "d456",
            DriverName = "John Doe",
            OccurredAt = DateTime.UtcNow.AddMinutes(-10),
            GeneratedAt = DateTime.UtcNow,
            Severity = IncidentSeverity.Medium,
            Summary = "Test incident summary",
            Evidence = new EvidencePackage
            {
                GpsTrail = new List<GpsPoint>
                {
                    new() { Timestamp = DateTime.UtcNow, Latitude = 43.65, Longitude = -79.38, SpeedKmh = 50 }
                },
                MaxSpeedKmh = 80,
                SpeedAtEventKmh = 45,
                DecelerationMps2 = -5.5,
                WeatherCondition = "Clear",
                TemperatureCelsius = 20,
                Diagnostics = new List<DiagnosticSnapshot>()
            },
            ShareUrl = "https://fleetclaim.app/r/abc123"
        };
    }
}
