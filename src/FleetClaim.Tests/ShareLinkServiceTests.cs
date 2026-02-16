using FleetClaim.Core.Services;
using Xunit;

namespace FleetClaim.Tests;

public class ShareLinkServiceTests
{
    private readonly ShareLinkService _service;
    
    public ShareLinkServiceTests()
    {
        _service = new ShareLinkService(new ShareLinkOptions
        {
            BaseUrl = "https://fleetclaim.app",
            SigningKey = "test-secret-key-12345"
        });
    }
    
    [Fact]
    public void GenerateShareUrl_ReturnsValidUrl()
    {
        // Act
        var url = _service.GenerateShareUrl("rpt_abc123", "mydb");
        
        // Assert
        Assert.StartsWith("https://fleetclaim.app/r/", url);
        Assert.True(url.Length > 30); // Should have a reasonable token length
    }
    
    [Fact]
    public void GenerateShareUrl_IsDeterministic()
    {
        // Act
        var url1 = _service.GenerateShareUrl("rpt_abc123", "mydb");
        var url2 = _service.GenerateShareUrl("rpt_abc123", "mydb");
        
        // Assert
        Assert.Equal(url1, url2);
    }
    
    [Fact]
    public void GenerateShareUrl_DifferentInputsProduceDifferentUrls()
    {
        // Act
        var url1 = _service.GenerateShareUrl("rpt_abc123", "mydb");
        var url2 = _service.GenerateShareUrl("rpt_xyz789", "mydb");
        var url3 = _service.GenerateShareUrl("rpt_abc123", "otherdb");
        
        // Assert
        Assert.NotEqual(url1, url2);
        Assert.NotEqual(url1, url3);
    }
    
    [Fact]
    public void ParseShareToken_ValidToken_ReturnsReportIdAndDatabase()
    {
        // Arrange
        var url = _service.GenerateShareUrl("rpt_abc123", "mydb");
        var token = url.Split("/r/")[1];
        
        // Act
        var result = _service.ParseShareToken(token);
        
        // Assert
        Assert.NotNull(result);
        Assert.Equal("rpt_abc123", result.Value.ReportId);
        Assert.Equal("mydb", result.Value.Database);
    }
    
    [Fact]
    public void ParseShareToken_InvalidToken_ReturnsNull()
    {
        // Act
        var result = _service.ParseShareToken("invalid-token-here");
        
        // Assert
        Assert.Null(result);
    }
    
    [Fact]
    public void ParseShareToken_TamperedToken_ReturnsNull()
    {
        // Arrange
        var url = _service.GenerateShareUrl("rpt_abc123", "mydb");
        var token = url.Split("/r/")[1];
        
        // Tamper with the token
        var chars = token.ToCharArray();
        chars[5] = chars[5] == 'a' ? 'b' : 'a';
        var tamperedToken = new string(chars);
        
        // Act
        var result = _service.ParseShareToken(tamperedToken);
        
        // Assert
        Assert.Null(result);
    }
    
    [Fact]
    public void ParseShareToken_DifferentKey_ReturnsNull()
    {
        // Arrange
        var url = _service.GenerateShareUrl("rpt_abc123", "mydb");
        var token = url.Split("/r/")[1];
        
        var differentService = new ShareLinkService(new ShareLinkOptions
        {
            BaseUrl = "https://fleetclaim.app",
            SigningKey = "different-secret-key"
        });
        
        // Act
        var result = differentService.ParseShareToken(token);
        
        // Assert
        Assert.Null(result);
    }
    
    [Fact]
    public void GenerateShareUrl_UrlSafeCharacters()
    {
        // Act
        var url = _service.GenerateShareUrl("rpt_abc123", "my-db_name.com");
        var token = url.Split("/r/")[1];
        
        // Assert - token should not contain characters that need URL encoding
        Assert.DoesNotContain("+", token);
        Assert.DoesNotContain("/", token);
        Assert.DoesNotContain("=", token);
    }
    
    [Fact]
    public void RoundTrip_SpecialCharactersInDatabase()
    {
        // Arrange
        var database = "customer-db_2024.test";
        var reportId = "rpt_xyz789";
        
        var url = _service.GenerateShareUrl(reportId, database);
        var token = url.Split("/r/")[1];
        
        // Act
        var result = _service.ParseShareToken(token);
        
        // Assert
        Assert.NotNull(result);
        Assert.Equal(reportId, result.Value.ReportId);
        Assert.Equal(database, result.Value.Database);
    }
}
