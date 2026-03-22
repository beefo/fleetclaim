using System.Net;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Services;
using Geotab.Checkmate;
using Moq;
using Moq.Protected;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Tests for MediaFileService - file upload/download via Geotab MediaFile API.
/// </summary>
public class MediaFileServiceTests
{
    private Mock<IGeotabApi> CreateMockApi(string server = "my.geotab.com", string database = "demo_db")
    {
        var mockApi = new Mock<IGeotabApi>();
        mockApi.Setup(a => a.Server).Returns(server);
        mockApi.Setup(a => a.Database).Returns(database);
        
        // Create a real LoginResult with Credentials
        // Note: LoginResult.Credentials property getter creates Credentials from internal fields
        var loginResult = new LoginResult
        {
            Path = server
        };
        
        // Use reflection to set the internal credentials since the SDK doesn't expose a public setter
        // Alternative: Mock the entire IGeotabApi to return credential values from dedicated properties
        var credentialsField = typeof(LoginResult).GetProperty("Credentials");
        
        // For now, return null LoginResult - tests that need credentials will be skipped
        mockApi.Setup(a => a.LoginResult).Returns((LoginResult?)null);
        
        return mockApi;
    }

    [Fact]
    public async Task UploadPdfAsync_CreatesMediaFileEntity()
    {
        // Arrange
        var mockApi = CreateMockApi();
        string? capturedTypeName = null;
        object? capturedEntity = null;

        mockApi.Setup(a => a.CallAsync<string>(
            It.IsAny<string>(),
            It.IsAny<object>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync((string method, object parameters, CancellationToken _) =>
            {
                if (method == "Add")
                {
                    var props = parameters.GetType().GetProperties();
                    capturedTypeName = props.FirstOrDefault(p => p.Name == "typeName")?.GetValue(parameters)?.ToString();
                    capturedEntity = props.FirstOrDefault(p => p.Name == "entity")?.GetValue(parameters);
                }
                return "mf_new_123";
            });

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK));

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new MediaFileService(httpClient);

        var pdfBytes = new byte[] { 0x25, 0x50, 0x44, 0x46 }; // %PDF

        // Act
        var result = await service.UploadPdfAsync(mockApi.Object, "rpt_001", "device_b1", pdfBytes);

        // Assert
        Assert.Equal("mf_new_123", result);
        Assert.Equal("MediaFile", capturedTypeName);
        Assert.NotNull(capturedEntity);
    }

    [Fact]
    public async Task UploadPdfAsync_UploadsToCorrectUrl()
    {
        // Arrange
        var mockApi = CreateMockApi(server: "my.geotab.com");
        mockApi.Setup(a => a.CallAsync<string>(
            It.IsAny<string>(),
            It.IsAny<object>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync("mf_123");

        string? capturedUrl = null;
        var handlerMock = new Mock<HttpMessageHandler>();
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
        var service = new MediaFileService(httpClient);

        // Act
        await service.UploadPdfAsync(mockApi.Object, "rpt_001", "b1", new byte[] { 1, 2, 3 });

        // Assert
        Assert.Equal("https://my.geotab.com/apiv1/UploadMediaFile", capturedUrl);
    }

    [Fact]
    public async Task UploadPdfAsync_ThrowsWhenNoIdReturned()
    {
        // Arrange
        var mockApi = CreateMockApi();
        mockApi.Setup(a => a.CallAsync<string>(
            It.IsAny<string>(),
            It.IsAny<object>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);

        var service = new MediaFileService();

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.UploadPdfAsync(mockApi.Object, "rpt_001", "b1", new byte[] { 1, 2, 3 }));
    }

    [Fact]
    public async Task UploadPdfAsync_CleansUpOnUploadFailure()
    {
        // Arrange
        var mockApi = CreateMockApi();
        var removeCallCount = 0;

        mockApi.Setup(a => a.CallAsync<string>(
            "Add",
            It.IsAny<object>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync("mf_to_cleanup");

        mockApi.Setup(a => a.CallAsync<object>(
            "Remove",
            It.IsAny<object>(),
            It.IsAny<CancellationToken>()))
            .Callback(() => removeCallCount++)
            .ReturnsAsync(new object());

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent("Upload failed")
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new MediaFileService(httpClient);

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.UploadPdfAsync(mockApi.Object, "rpt_001", "b1", new byte[] { 1, 2, 3 }));

        // Verify cleanup was attempted
        Assert.Equal(1, removeCallCount);
    }

    [Fact]
    public async Task DownloadFileAsync_ReturnsBytes()
    {
        // Arrange
        var mockApi = CreateMockApi();
        var expectedBytes = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34 }; // PDF header
        var largeContent = new byte[200]; // > 100 bytes to pass size check
        Array.Copy(expectedBytes, largeContent, expectedBytes.Length);

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(largeContent)
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new MediaFileService(httpClient);

        // Act
        var result = await service.DownloadFileAsync(mockApi.Object, "mf_123");

        // Assert
        Assert.NotNull(result);
        Assert.Equal(200, result!.Length);
    }

    [Fact]
    public async Task DownloadFileAsync_ReturnsNullOnFailure()
    {
        // Arrange
        var mockApi = CreateMockApi();

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.NotFound));

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new MediaFileService(httpClient);

        // Act
        var result = await service.DownloadFileAsync(mockApi.Object, "mf_nonexistent");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task DownloadFileAsync_ReturnsNullForSmallResponse()
    {
        // Arrange - small response likely indicates an error JSON, not a file
        var mockApi = CreateMockApi();

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"error\":\"not found\"}")
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new MediaFileService(httpClient);

        // Act
        var result = await service.DownloadFileAsync(mockApi.Object, "mf_123");

        // Assert - small responses are treated as errors
        Assert.Null(result);
    }

    [Fact]
    public async Task DeleteFileAsync_CallsRemove()
    {
        // Arrange
        var mockApi = CreateMockApi();
        string? capturedMethod = null;
        object? capturedParams = null;

        mockApi.Setup(a => a.CallAsync<object>(
            It.IsAny<string>(),
            It.IsAny<object>(),
            It.IsAny<CancellationToken>()))
            .Callback((string method, object parameters, CancellationToken _) =>
            {
                capturedMethod = method;
                capturedParams = parameters;
            })
            .ReturnsAsync(new object());

        var service = new MediaFileService();

        // Act
        await service.DeleteFileAsync(mockApi.Object, "mf_to_delete");

        // Assert
        Assert.Equal("Remove", capturedMethod);
        Assert.NotNull(capturedParams);
    }

    [Fact]
    public void MediaFileService_CanBeCreatedWithoutHttpClient()
    {
        // Should not throw - creates internal HttpClient
        var service = new MediaFileService();
        Assert.NotNull(service);
    }

    [Fact]
    public async Task UploadPdfAsync_IncludesAllFormFields()
    {
        // Arrange
        var mockApi = CreateMockApi(database: "test_database");
        mockApi.Setup(a => a.CallAsync<string>(
            It.IsAny<string>(),
            It.IsAny<object>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync("mf_123");

        MultipartFormDataContent? capturedContent = null;
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync((HttpRequestMessage req, CancellationToken _) =>
            {
                capturedContent = req.Content as MultipartFormDataContent;
                return new HttpResponseMessage(HttpStatusCode.OK);
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var service = new MediaFileService(httpClient);

        // Act
        await service.UploadPdfAsync(mockApi.Object, "rpt_001", "b1", new byte[] { 1, 2, 3, 4 });

        // Assert
        Assert.NotNull(capturedContent);
        // Content should include id, database, userName, sessionId, and file
        var contentParts = capturedContent!.ToList();
        Assert.True(contentParts.Count >= 5);
    }
}
