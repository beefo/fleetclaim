using System.Net;
using System.Text.Json;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Moq;
using Moq.Protected;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Tests for NotificationService - webhook delivery and email generation.
/// </summary>
public class NotificationServiceTests
{
    private static IncidentReport CreateTestReport()
    {
        return new IncidentReport
        {
            Id = "rpt_001",
            IncidentId = "exc_001",
            VehicleId = "b1",
            VehicleName = "Vehicle 001",
            DriverId = "drv_1",
            DriverName = "John Driver",
            OccurredAt = new DateTime(2026, 3, 18, 10, 30, 0, DateTimeKind.Utc),
            GeneratedAt = DateTime.UtcNow,
            Severity = IncidentSeverity.High,
            Summary = "Hard braking event on Highway 401",
            ShareUrl = "https://fleetclaim.app/r/abc123",
            Evidence = new EvidencePackage
            {
                GpsTrail = [
                    new GpsPoint { Latitude = 43.44, Longitude = -79.67, SpeedKmh = 100, Timestamp = DateTime.UtcNow.AddSeconds(-10) },
                    new GpsPoint { Latitude = 43.45, Longitude = -79.68, SpeedKmh = 50, Timestamp = DateTime.UtcNow }
                ],
                MaxSpeedKmh = 105,
                SpeedAtEventKmh = 95,
                DecelerationMps2 = 8.5,
                WeatherCondition = "Clear"
            }
        };
    }

    private static CustomerConfig CreateTestConfig(string? webhookUrl = null, List<string>? emails = null)
    {
        return new CustomerConfig
        {
            NotifyWebhook = webhookUrl,
            NotifyEmails = emails ?? []
        };
    }

    [Fact]
    public async Task SendWebhook_SendsCorrectPayload()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        WebhookPayload? capturedPayload = null;

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync((HttpRequestMessage req, CancellationToken _) =>
            {
                // Capture the payload
                var content = req.Content!.ReadAsStringAsync().Result;
                capturedPayload = JsonSerializer.Deserialize<WebhookPayload>(content, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
                return new HttpResponseMessage(HttpStatusCode.OK);
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);

        var report = CreateTestReport();
        var config = CreateTestConfig(webhookUrl: "https://hooks.example.com/fleetclaim");

        // Act
        await service.SendNotificationsAsync(report, config);

        // Assert
        Assert.NotNull(capturedPayload);
        Assert.Equal("incident.report.generated", capturedPayload!.EventType);
        Assert.Equal("rpt_001", capturedPayload.Report.Id);
        Assert.Equal("exc_001", capturedPayload.Report.IncidentId);
        Assert.Equal("Vehicle 001", capturedPayload.Report.VehicleName);
        Assert.Equal("John Driver", capturedPayload.Report.DriverName);
        Assert.Equal("High", capturedPayload.Report.Severity);
        Assert.Equal("https://fleetclaim.app/r/abc123", capturedPayload.Report.ShareUrl);
        Assert.Equal(2, capturedPayload.Report.Evidence.GpsPointCount);
        Assert.Equal(95, capturedPayload.Report.Evidence.SpeedAtEventKmh);
        Assert.Equal(8.5, capturedPayload.Report.Evidence.DecelerationMps2);
    }

    [Fact]
    public async Task SendWebhook_CorrectUrl()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        string? capturedUrl = null;

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync((HttpRequestMessage req, CancellationToken _) =>
            {
                capturedUrl = req.RequestUri?.ToString();
                return new HttpResponseMessage(HttpStatusCode.OK);
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);

        var report = CreateTestReport();
        var config = CreateTestConfig(webhookUrl: "https://hooks.slack.com/services/T00/B00/xxxx");

        // Act
        await service.SendNotificationsAsync(report, config);

        // Assert
        Assert.Equal("https://hooks.slack.com/services/T00/B00/xxxx", capturedUrl);
    }

    [Fact]
    public async Task SendWebhook_ThrowsOnFailure()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.InternalServerError));

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);

        var report = CreateTestReport();
        var config = CreateTestConfig(webhookUrl: "https://hooks.example.com/fail");

        // Act & Assert
        await Assert.ThrowsAsync<HttpRequestException>(() => 
            service.SendNotificationsAsync(report, config));
    }

    [Fact]
    public async Task NoNotifications_WhenConfigEmpty()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        var callCount = 0;

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(() =>
            {
                callCount++;
                return new HttpResponseMessage(HttpStatusCode.OK);
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);

        var report = CreateTestReport();
        var config = CreateTestConfig(); // No webhook, no emails

        // Act
        await service.SendNotificationsAsync(report, config);

        // Assert - no HTTP calls should be made
        Assert.Equal(0, callCount);
    }

    [Fact]
    public async Task SendWebhook_IncludesWeatherCondition()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        WebhookPayload? capturedPayload = null;

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync((HttpRequestMessage req, CancellationToken _) =>
            {
                var content = req.Content!.ReadAsStringAsync().Result;
                capturedPayload = JsonSerializer.Deserialize<WebhookPayload>(content, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
                return new HttpResponseMessage(HttpStatusCode.OK);
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);

        var report = CreateTestReport();
        report.Evidence.WeatherCondition = "Rain, 15°C";
        var config = CreateTestConfig(webhookUrl: "https://hooks.example.com/test");

        // Act
        await service.SendNotificationsAsync(report, config);

        // Assert
        Assert.Equal("Rain, 15°C", capturedPayload!.Report.Evidence.WeatherCondition);
    }

    [Fact]
    public async Task WebhookPayload_HasCorrectTimestamp()
    {
        // Arrange
        var handlerMock = new Mock<HttpMessageHandler>();
        WebhookPayload? capturedPayload = null;
        var beforeCall = DateTime.UtcNow;

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync((HttpRequestMessage req, CancellationToken _) =>
            {
                var content = req.Content!.ReadAsStringAsync().Result;
                capturedPayload = JsonSerializer.Deserialize<WebhookPayload>(content, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
                return new HttpResponseMessage(HttpStatusCode.OK);
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new NotificationService(new NotificationOptions(), httpClient);

        var report = CreateTestReport();
        var config = CreateTestConfig(webhookUrl: "https://hooks.example.com/test");

        // Act
        await service.SendNotificationsAsync(report, config);
        var afterCall = DateTime.UtcNow;

        // Assert - timestamp should be within the test window
        Assert.True(capturedPayload!.Timestamp >= beforeCall.AddSeconds(-1));
        Assert.True(capturedPayload.Timestamp <= afterCall.AddSeconds(1));
    }

    [Fact]
    public void NotificationOptions_HasSensibleDefaults()
    {
        var options = new NotificationOptions();

        Assert.True(options.UseSendGrid);
        Assert.Equal(587, options.SmtpPort);
        Assert.True(options.SmtpUseSsl);
        Assert.Equal("noreply@fleetclaim.app", options.FromEmail);
        Assert.Equal("FleetClaim", options.FromName);
    }

    [Fact]
    public void WebhookReportData_AllFieldsMapped()
    {
        var report = CreateTestReport();
        
        var webhookData = new WebhookReportData
        {
            Id = report.Id,
            IncidentId = report.IncidentId,
            VehicleId = report.VehicleId,
            VehicleName = report.VehicleName,
            DriverId = report.DriverId,
            DriverName = report.DriverName,
            OccurredAt = report.OccurredAt,
            GeneratedAt = report.GeneratedAt,
            Severity = report.Severity.ToString(),
            Summary = report.Summary,
            ShareUrl = report.ShareUrl,
            Evidence = new WebhookEvidenceData
            {
                GpsPointCount = report.Evidence.GpsTrail.Count,
                MaxSpeedKmh = report.Evidence.MaxSpeedKmh,
                SpeedAtEventKmh = report.Evidence.SpeedAtEventKmh,
                DecelerationMps2 = report.Evidence.DecelerationMps2,
                WeatherCondition = report.Evidence.WeatherCondition,
                DiagnosticCount = report.Evidence.Diagnostics.Count
            }
        };

        Assert.Equal("rpt_001", webhookData.Id);
        Assert.Equal("High", webhookData.Severity);
        Assert.Equal(2, webhookData.Evidence.GpsPointCount);
    }
}
