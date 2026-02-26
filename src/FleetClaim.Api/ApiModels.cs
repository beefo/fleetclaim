namespace FleetClaim.Api;

public record GeotabCredentialsRequest
{
    public string Database { get; init; } = "";
    public string UserName { get; init; } = "";
    public string SessionId { get; init; } = "";
    public string? Server { get; init; }
}

public record PdfGenerateRequest
{
    public GeotabCredentialsRequest Credentials { get; init; } = new();
    public string ReportId { get; init; } = "";
}

public record EmailSendRequest
{
    public GeotabCredentialsRequest Credentials { get; init; } = new();
    public string ReportId { get; init; } = "";
    public string Email { get; init; } = "";
    public string? Message { get; init; }
}
