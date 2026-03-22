using FleetClaim.Core.Services;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Tests for ShareLinkService - URL generation and token parsing.
/// </summary>
public class ShareLinkServiceTests
{
    private const string TestSigningKey = "test-signing-key-32-bytes-long!!";
    private const string TestBaseUrl = "https://fleetclaim.app";

    private ShareLinkService CreateService(string? baseUrl = null, string? signingKey = null)
    {
        return new ShareLinkService(new ShareLinkOptions
        {
            BaseUrl = baseUrl ?? TestBaseUrl,
            SigningKey = signingKey ?? TestSigningKey
        });
    }

    [Fact]
    public void GenerateShareUrl_ReturnsValidUrl()
    {
        var service = CreateService();

        var url = service.GenerateShareUrl("rpt_001", "demo_db");

        Assert.StartsWith("https://fleetclaim.app/r/", url);
        Assert.True(url.Length > 30); // Should have a reasonable token length
    }

    [Fact]
    public void GenerateShareUrl_UsesConfiguredBaseUrl()
    {
        var service = CreateService(baseUrl: "https://custom.domain.com");

        var url = service.GenerateShareUrl("rpt_001", "demo_db");

        Assert.StartsWith("https://custom.domain.com/r/", url);
    }

    [Fact]
    public void GenerateShareUrl_TrimsTrailingSlash()
    {
        var service = CreateService(baseUrl: "https://fleetclaim.app/");

        var url = service.GenerateShareUrl("rpt_001", "demo_db");

        Assert.StartsWith("https://fleetclaim.app/r/", url);
        Assert.DoesNotContain("//r/", url); // No double slash
    }

    [Fact]
    public void ParseShareToken_RoundTrip()
    {
        var service = CreateService();

        var url = service.GenerateShareUrl("rpt_test123", "my_database");
        var token = url.Split("/r/")[1];

        var result = service.ParseShareToken(token);

        Assert.NotNull(result);
        Assert.Equal("rpt_test123", result.Value.ReportId);
        Assert.Equal("my_database", result.Value.Database);
    }

    [Fact]
    public void ParseShareToken_RejectsInvalidSignature()
    {
        var service1 = CreateService(signingKey: "key-one-32-bytes-xxxxxxxxxx!!");
        var service2 = CreateService(signingKey: "key-two-32-bytes-xxxxxxxxxx!!");

        var url = service1.GenerateShareUrl("rpt_001", "demo_db");
        var token = url.Split("/r/")[1];

        // Try to parse with different signing key
        var result = service2.ParseShareToken(token);

        Assert.Null(result);
    }

    [Fact]
    public void ParseShareToken_RejectsTamperedToken()
    {
        var service = CreateService();

        var url = service.GenerateShareUrl("rpt_001", "demo_db");
        var token = url.Split("/r/")[1];

        // Tamper with the token
        var tamperedToken = "X" + token.Substring(1);

        var result = service.ParseShareToken(tamperedToken);

        Assert.Null(result);
    }

    [Fact]
    public void ParseShareToken_RejectsGarbage()
    {
        var service = CreateService();

        var result = service.ParseShareToken("not-a-valid-token!!!");

        Assert.Null(result);
    }

    [Fact]
    public void ParseShareToken_RejectsEmptyString()
    {
        var service = CreateService();

        var result = service.ParseShareToken("");

        Assert.Null(result);
    }

    [Fact]
    public void GenerateShareUrl_ProducesDifferentTokensForDifferentReports()
    {
        var service = CreateService();

        var url1 = service.GenerateShareUrl("rpt_001", "demo_db");
        var url2 = service.GenerateShareUrl("rpt_002", "demo_db");

        Assert.NotEqual(url1, url2);
    }

    [Fact]
    public void GenerateShareUrl_ProducesDifferentTokensForDifferentDatabases()
    {
        var service = CreateService();

        var url1 = service.GenerateShareUrl("rpt_001", "db_one");
        var url2 = service.GenerateShareUrl("rpt_001", "db_two");

        Assert.NotEqual(url1, url2);
    }

    [Fact]
    public void GenerateShareUrl_SameInputProducesSameOutput()
    {
        var service = CreateService();

        var url1 = service.GenerateShareUrl("rpt_001", "demo_db");
        var url2 = service.GenerateShareUrl("rpt_001", "demo_db");

        Assert.Equal(url1, url2);
    }

    [Fact]
    public void Token_IsUrlSafe()
    {
        var service = CreateService();

        var url = service.GenerateShareUrl("rpt_001", "demo_db");
        var token = url.Split("/r/")[1];

        // URL-safe base64 should not contain +, /, or =
        Assert.DoesNotContain("+", token);
        Assert.DoesNotContain("/", token);
        Assert.DoesNotContain("=", token);
    }

    [Fact]
    public void ParseShareToken_HandlesSpecialCharactersInReportId()
    {
        var service = CreateService();

        var url = service.GenerateShareUrl("rpt_special-chars_123", "demo_db");
        var token = url.Split("/r/")[1];

        var result = service.ParseShareToken(token);

        Assert.NotNull(result);
        Assert.Equal("rpt_special-chars_123", result.Value.ReportId);
    }

    [Fact]
    public void ParseShareToken_HandlesUnicodeInDatabase()
    {
        var service = CreateService();

        var url = service.GenerateShareUrl("rpt_001", "company_日本語");
        var token = url.Split("/r/")[1];

        var result = service.ParseShareToken(token);

        Assert.NotNull(result);
        Assert.Equal("company_日本語", result.Value.Database);
    }

    [Fact]
    public void ShareLinkOptions_Defaults()
    {
        var options = new ShareLinkOptions();

        Assert.Equal("https://fleetclaim.app", options.BaseUrl);
        Assert.Equal("", options.SigningKey);
    }
}
