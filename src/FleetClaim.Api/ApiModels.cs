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
    /// <summary>
    /// The Geotab AddInData record ID (e.g. "aIr43nKVL8U6lf4YbaFjy7A").
    /// When provided, the report is fetched directly by ID — much faster than scanning all records.
    /// </summary>
    public string? AddInDataId { get; init; }
}

public record EmailSendRequest
{
    public GeotabCredentialsRequest Credentials { get; init; } = new();
    public string ReportId { get; init; } = "";
    public string Email { get; init; } = "";
    public string? Message { get; init; }
}
