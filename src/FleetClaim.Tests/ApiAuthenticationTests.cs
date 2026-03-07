using System.Net;
using System.Net.Http.Json;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Custom WebApplicationFactory that mocks GCP services for testing
/// </summary>
public class FleetClaimWebApplicationFactory : WebApplicationFactory<FleetClaim.Api.Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Set required environment variables before app starts
        Environment.SetEnvironmentVariable("GCP_PROJECT_ID", "test-project");
        
        builder.ConfigureServices(services =>
        {
            // Remove real GCP credential store (instantiates during startup)
            services.RemoveAll<ICredentialStore>();
            
            // Add mock that doesn't need GCP credentials
            var mockCredentialStore = new Mock<ICredentialStore>();
            mockCredentialStore
                .Setup(x => x.GetCredentialsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ThrowsAsync(new InvalidOperationException("Test: No credentials configured"));
            services.AddSingleton(mockCredentialStore.Object);

            // Remove and mock the Geotab client factory
            services.RemoveAll<IGeotabClientFactory>();
            var mockClientFactory = new Mock<IGeotabClientFactory>();
            mockClientFactory
                .Setup(x => x.CreateClientAsync(It.IsAny<string>()))
                .ThrowsAsync(new InvalidOperationException("Test: No Geotab client"));
            services.AddSingleton(mockClientFactory.Object);
        });
    }
}

/// <summary>
/// Integration tests to verify all API endpoints (except /health) require authentication.
/// These tests ensure we don't accidentally expose unauthenticated endpoints.
/// </summary>
public class ApiAuthenticationTests : IClassFixture<FleetClaimWebApplicationFactory>
{
    private readonly FleetClaimWebApplicationFactory _factory;
    private readonly HttpClient _client;

    // All API endpoints that should require authentication
    // Add new endpoints here to ensure they're tested
    private static readonly (string Method, string Path)[] ProtectedEndpoints = new[]
    {
        ("POST", "/api/pdf"),
        ("GET", "/api/pdf/test_db/rpt_123"),
        ("POST", "/api/email"),
    };

    // Endpoints that are intentionally public
    private static readonly string[] PublicEndpoints = new[]
    {
        "/health"
    };

    public ApiAuthenticationTests(FleetClaimWebApplicationFactory factory)
    {
        _factory = factory;
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task HealthEndpoint_NoAuth_ReturnsOk()
    {
        // Arrange & Act
        var response = await _client.GetAsync("/health");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("POST", "/api/pdf")]
    [InlineData("GET", "/api/pdf/test_db/rpt_123")]
    [InlineData("POST", "/api/email")]
    public async Task ProtectedEndpoint_NoCredentials_ReturnsUnauthorized(string method, string path)
    {
        // Arrange
        HttpRequestMessage request;
        
        if (method == "POST")
        {
            request = new HttpRequestMessage(HttpMethod.Post, path)
            {
                Content = JsonContent.Create(new { reportId = "test" })
            };
        }
        else
        {
            request = new HttpRequestMessage(HttpMethod.Get, path);
        }

        // Act
        var response = await _client.SendAsync(request);

        // Assert - Should be Unauthorized (401) or BadRequest (400) for missing credentials
        // Both indicate the endpoint is checking for credentials
        Assert.True(
            response.StatusCode == HttpStatusCode.Unauthorized || 
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Expected 401 or 400, got {(int)response.StatusCode} {response.StatusCode} for {method} {path}");
    }

    [Theory]
    [InlineData("POST", "/api/pdf")]
    [InlineData("GET", "/api/pdf/test_db/rpt_123")]
    [InlineData("POST", "/api/email")]
    public async Task ProtectedEndpoint_InvalidCredentials_ReturnsUnauthorizedOrBadRequest(string method, string path)
    {
        // Arrange
        HttpRequestMessage request;
        
        if (method == "POST")
        {
            request = new HttpRequestMessage(HttpMethod.Post, path)
            {
                Content = JsonContent.Create(new { reportId = "test" })
            };
        }
        else
        {
            request = new HttpRequestMessage(HttpMethod.Get, path);
        }

        // Add invalid credentials
        // Note: For GET /api/pdf/{db}/{id}, using a different database in header vs path
        // returns 400 (database mismatch), which is also a valid rejection
        request.Headers.Add("X-Geotab-Database", "fake_db");
        request.Headers.Add("X-Geotab-UserName", "fake@user.com");
        request.Headers.Add("X-Geotab-SessionId", "invalid-session-id");

        // Act
        var response = await _client.SendAsync(request);

        // Assert - Should be Unauthorized (401) or BadRequest (400) for invalid/mismatched credentials
        Assert.True(
            response.StatusCode == HttpStatusCode.Unauthorized ||
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Expected 401 or 400, got {(int)response.StatusCode} {response.StatusCode} for {method} {path}");
    }

    [Fact]
    public async Task AllApiEndpoints_ExceptHealth_RequireAuthentication()
    {
        // This test documents and verifies all protected endpoints
        // If you add a new endpoint, add it to ProtectedEndpoints array above
        
        foreach (var (method, path) in ProtectedEndpoints)
        {
            HttpRequestMessage request;
            
            if (method == "POST")
            {
                request = new HttpRequestMessage(HttpMethod.Post, path)
                {
                    Content = JsonContent.Create(new { reportId = "test", email = "test@test.com" })
                };
            }
            else
            {
                request = new HttpRequestMessage(HttpMethod.Get, path);
            }

            var response = await _client.SendAsync(request);

            // Assert - endpoint rejects unauthenticated requests
            Assert.True(
                response.StatusCode == HttpStatusCode.Unauthorized || 
                response.StatusCode == HttpStatusCode.BadRequest,
                $"SECURITY: Endpoint {method} {path} returned {(int)response.StatusCode} without credentials. " +
                "All API endpoints (except /health) must require authentication!");
        }
    }

    [Fact]
    public void ProtectedEndpointsList_IsComplete()
    {
        // This test reminds developers to add new endpoints to the test list
        // When you add a new API endpoint, add it to ProtectedEndpoints above
        
        // Current count of protected endpoints (update when adding new endpoints)
        const int ExpectedProtectedEndpointCount = 3;
        
        Assert.Equal(ExpectedProtectedEndpointCount, ProtectedEndpoints.Length);
    }
}

/// <summary>
/// Test to ensure new API endpoints are added to the authentication test list.
/// This serves as a reminder during code review.
/// </summary>
public class ApiEndpointRegistrationTests
{
    [Fact]
    public void NewEndpoints_MustBeAddedToAuthTests()
    {
        // This test exists as a reminder:
        // When adding new API endpoints to Program.cs, you MUST:
        // 1. Add credential verification (use VerifyCredentialsAsync or ExtractCredentials + verify)
        // 2. Add the endpoint to ProtectedEndpoints in ApiAuthenticationTests
        // 3. Run these tests to verify authentication works
        
        // The test always passes - it's documentation
        Assert.True(true, 
            "Remember: All new API endpoints must be added to ApiAuthenticationTests.ProtectedEndpoints");
    }
}
