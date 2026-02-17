using System.Text.Json;
using System.Text.Json.Serialization;

namespace FleetClaim.Core.Models;

/// <summary>
/// Wrapper for data stored in Geotab AddInData.
/// The "type" field discriminates between reports, requests, and config.
/// </summary>
public class AddInDataWrapper
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };
    
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";
    
    [JsonPropertyName("payload")]
    public JsonElement Payload { get; set; }
    
    public static AddInDataWrapper ForReport(IncidentReport report) => new()
    {
        Type = "report",
        Payload = JsonSerializer.SerializeToElement(report, SerializerOptions)
    };
    
    public static AddInDataWrapper ForRequest(ReportRequest request) => new()
    {
        Type = "reportRequest",
        Payload = JsonSerializer.SerializeToElement(request, SerializerOptions)
    };
    
    public static AddInDataWrapper ForConfig(CustomerConfig config) => new()
    {
        Type = "config",
        Payload = JsonSerializer.SerializeToElement(config, SerializerOptions)
    };
    
    public T? GetPayload<T>() => Payload.Deserialize<T>(SerializerOptions);
}
