namespace FleetClaim.Core.Models;

public class CustomerConfig
{
    public List<string> NotifyEmails { get; set; } = [];
    public string? NotifyWebhook { get; set; }
    public IncidentSeverity SeverityThreshold { get; set; } = IncidentSeverity.Medium;
    public List<string> AutoGenerateRules { get; set; } = ["HarshBraking", "Collision", "Speeding"];
}
