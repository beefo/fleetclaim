using FleetClaim.Admin;
using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Unit tests for AdminService.
/// Tests admin operations with mocked Geotab API.
/// </summary>
public class AdminServiceTests
{
    private readonly Mock<ICredentialStore> _credentialStore;
    private readonly Mock<IGeotabClientFactory> _clientFactory;
    private readonly Mock<IGeotabApi> _mockApi;
    private readonly Mock<ILogger<AdminService>> _logger;
    private readonly AdminConfig _config;
    
    public AdminServiceTests()
    {
        _credentialStore = new Mock<ICredentialStore>();
        _clientFactory = new Mock<IGeotabClientFactory>();
        _mockApi = new Mock<IGeotabApi>();
        _logger = new Mock<ILogger<AdminService>>();
        _config = new AdminConfig
        {
            ProjectId = "test-project",
            AdminApiKey = "test-api-key"
        };
    }
    
    private AdminService CreateService()
    {
        return new AdminService(
            _credentialStore.Object,
            _clientFactory.Object,
            _config,
            _logger.Object
        );
    }
    
    [Fact]
    public async Task GetOverviewAsync_ReturnsDatabaseCount()
    {
        // Arrange
        _credentialStore.Setup(c => c.ListDatabasesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "db1", "db2", "db3" }.AsReadOnly());
        
        var service = CreateService();
        
        // Act
        var result = await service.GetOverviewAsync();
        
        // Assert
        Assert.NotNull(result);
        var props = result.GetType().GetProperties();
        var totalDbProp = props.FirstOrDefault(p => p.Name == "totalDatabases");
        Assert.NotNull(totalDbProp);
        Assert.Equal(3, totalDbProp.GetValue(result));
    }
    
    [Fact]
    public async Task GetOverviewAsync_IncludesProjectId()
    {
        // Arrange
        _credentialStore.Setup(c => c.ListDatabasesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string>().AsReadOnly());
        
        var service = CreateService();
        
        // Act
        var result = await service.GetOverviewAsync();
        
        // Assert
        var props = result.GetType().GetProperties();
        var projectIdProp = props.FirstOrDefault(p => p.Name == "projectId");
        Assert.NotNull(projectIdProp);
        Assert.Equal("test-project", projectIdProp.GetValue(result));
    }
    
    [Fact]
    public async Task GetDatabasesAsync_ReturnsEmptyListWhenNoDatabases()
    {
        // Arrange
        _credentialStore.Setup(c => c.ListDatabasesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string>().AsReadOnly());
        
        var service = CreateService();
        
        // Act
        var result = await service.GetDatabasesAsync();
        
        // Assert
        Assert.NotNull(result);
        var list = result as System.Collections.IEnumerable;
        Assert.NotNull(list);
        Assert.Empty(list.Cast<object>());
    }
    
    [Fact]
    public async Task GetDatabasesAsync_HandlesConnectionErrors()
    {
        // Arrange
        _credentialStore.Setup(c => c.ListDatabasesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "failing_db" }.AsReadOnly());
        
        _clientFactory.Setup(c => c.CreateClientAsync("failing_db", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("Connection failed"));
        
        var service = CreateService();
        
        // Act
        var result = await service.GetDatabasesAsync();
        
        // Assert - should not throw, should return error status
        Assert.NotNull(result);
        var list = (result as System.Collections.IEnumerable)?.Cast<object>().ToList();
        Assert.NotNull(list);
        Assert.Single(list);
        
        var item = list[0];
        var statusProp = item.GetType().GetProperty("status");
        Assert.Equal("error", statusProp?.GetValue(item));
    }
    
    [Fact]
    public void AdminConfig_RequiresProjectId()
    {
        // AdminConfig has required properties
        var config = new AdminConfig
        {
            ProjectId = "my-project",
            AdminApiKey = "secret-key"
        };
        
        Assert.Equal("my-project", config.ProjectId);
        Assert.Equal("secret-key", config.AdminApiKey);
    }
}

/// <summary>
/// Tests for API key authentication handler.
/// </summary>
public class ApiKeyAuthTests
{
    [Fact]
    public void AdminConfig_StoresApiKey()
    {
        var config = new AdminConfig
        {
            ProjectId = "test",
            AdminApiKey = "my-secret-key-123"
        };
        
        Assert.Equal("my-secret-key-123", config.AdminApiKey);
    }
    
    [Theory]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("a-very-long-api-key-that-is-still-valid")]
    public void AdminConfig_AcceptsVariousKeyFormats(string apiKey)
    {
        var config = new AdminConfig
        {
            ProjectId = "test",
            AdminApiKey = apiKey
        };
        
        Assert.Equal(apiKey, config.AdminApiKey);
    }
}

/// <summary>
/// Tests to ensure AdminService uses IGeotabApi correctly (compilation tests).
/// These tests verify the interface integration works properly.
/// </summary>
public class AdminServiceGeotabApiIntegrationTests
{
    [Fact]
    public void AdminService_AcceptsIGeotabClientFactory()
    {
        // This test ensures AdminService compiles with IGeotabClientFactory
        var credentialStore = new Mock<ICredentialStore>();
        var clientFactory = new Mock<IGeotabClientFactory>();
        var logger = new Mock<ILogger<AdminService>>();
        var config = new AdminConfig { ProjectId = "test", AdminApiKey = "key" };
        
        // Should compile and not throw
        var service = new AdminService(
            credentialStore.Object,
            clientFactory.Object,
            config,
            logger.Object
        );
        
        Assert.NotNull(service);
    }
    
    [Fact]
    public async Task AdminService_ClientFactoryReturnsIGeotabApi()
    {
        // Verify the factory returns IGeotabApi which AdminService can use
        var credentialStore = new Mock<ICredentialStore>();
        var clientFactory = new Mock<IGeotabClientFactory>();
        var mockApi = new Mock<IGeotabApi>();
        var logger = new Mock<ILogger<AdminService>>();
        var config = new AdminConfig { ProjectId = "test", AdminApiKey = "key" };
        
        credentialStore.Setup(c => c.ListDatabasesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "test_db" }.AsReadOnly());
        
        clientFactory.Setup(f => f.CreateClientAsync("test_db", It.IsAny<CancellationToken>()))
            .ReturnsAsync(mockApi.Object);
        
        mockApi.Setup(a => a.CallAsync<List<object>>(
            "Get", 
            It.IsAny<Type>(), 
            It.IsAny<object>(), 
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<object>());
        
        var service = new AdminService(
            credentialStore.Object,
            clientFactory.Object,
            config,
            logger.Object
        );
        
        // Act - this exercises the IGeotabApi integration
        var result = await service.GetDatabasesAsync();
        
        // Assert
        Assert.NotNull(result);
        clientFactory.Verify(f => f.CreateClientAsync("test_db", It.IsAny<CancellationToken>()), Times.Once);
    }
}
