using System.Net.Mail;
using System.Text;
using FleetClaim.Core.Models;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Gmail.v1;
using Google.Apis.Gmail.v1.Data;
using Google.Apis.Services;
using MimeKit;

namespace FleetClaim.Core.Services;

public interface IGmailEmailService
{
    Task SendReportEmailAsync(IncidentReport report, string recipientEmail, string? customMessage = null, CancellationToken ct = default);
}

/// <summary>
/// Email service using Gmail API with OAuth2 credentials.
/// </summary>
public class GmailEmailService : IGmailEmailService
{
    private readonly GmailService _gmailService;
    private readonly string _fromEmail;
    private readonly string _fromName;
    
    public GmailEmailService(GmailOAuthCredentials credentials, string fromEmail = "clawbif@gmail.com", string fromName = "FleetClaim")
    {
        _fromEmail = fromEmail;
        _fromName = fromName;
        
        var tokenResponse = new TokenResponse
        {
            AccessToken = credentials.AccessToken,
            RefreshToken = credentials.RefreshToken,
            TokenType = "Bearer"
        };
        
        var clientSecrets = new ClientSecrets
        {
            ClientId = credentials.ClientId,
            ClientSecret = credentials.ClientSecret
        };
        
        var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = clientSecrets,
            Scopes = new[] { GmailService.Scope.GmailSend }
        });
        
        var credential = new UserCredential(flow, "user", tokenResponse);
        
        _gmailService = new GmailService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "FleetClaim"
        });
    }
    
    public async Task SendReportEmailAsync(IncidentReport report, string recipientEmail, string? customMessage = null, CancellationToken ct = default)
    {
        var message = CreateEmailMessage(report, recipientEmail, customMessage);
        
        var gmailMessage = new Message
        {
            Raw = Base64UrlEncode(message)
        };
        
        await _gmailService.Users.Messages.Send(gmailMessage, "me").ExecuteAsync(ct);
    }
    
    private MimeMessage CreateEmailMessage(IncidentReport report, string recipientEmail, string? customMessage)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_fromName, _fromEmail));
        message.To.Add(new MailboxAddress("", recipientEmail));
        
        var severityEmoji = report.Severity switch
        {
            IncidentSeverity.Critical => "🔴",
            IncidentSeverity.High => "🟠",
            IncidentSeverity.Medium => "🟡",
            _ => "🟢"
        };
        
        message.Subject = $"{severityEmoji} [{report.Severity}] FleetClaim Report: {report.VehicleName ?? report.VehicleId}";
        
        var builder = new BodyBuilder();
        builder.HtmlBody = BuildHtmlBody(report, customMessage);
        builder.TextBody = BuildTextBody(report, customMessage);
        
        message.Body = builder.ToMessageBody();
        
        return message;
    }
    
    private static string BuildHtmlBody(IncidentReport report, string? customMessage)
    {
        var severityColor = report.Severity switch
        {
            IncidentSeverity.Critical => "#c53030",
            IncidentSeverity.High => "#dd6b20",
            IncidentSeverity.Medium => "#d69e2e",
            _ => "#38a169"
        };

        var customSection = string.IsNullOrWhiteSpace(customMessage) 
            ? "" 
            : $@"<div style=""background:#f0f4f8;padding:12px;border-radius:6px;margin-bottom:16px;font-style:italic;"">{System.Web.HttpUtility.HtmlEncode(customMessage)}</div>";

        var ctaSection = string.IsNullOrEmpty(report.ShareUrl) 
            ? "" 
            : $@"<div style=""text-align:center;margin-top:20px;""><a href=""{report.ShareUrl}"" style=""display:inline-block;background:#2b6cb0;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;"">View Full Report</a></div>";

        return $@"<!DOCTYPE html>
<html>
<head><meta charset=""utf-8""></head>
<body style=""font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#f7fafc;"">
    <div style=""max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"">
        <div style=""background:#1a365d;color:white;padding:20px;"">
            <h1 style=""margin:0;font-size:20px;"">FleetClaim Incident Report</h1>
            <div style=""display:inline-block;background:{severityColor};color:white;padding:4px 12px;border-radius:4px;font-weight:bold;margin-top:10px;"">{report.Severity.ToString().ToUpper()}</div>
        </div>
        <div style=""padding:20px;"">
            {customSection}
            <div style=""background:#edf2f7;padding:15px;border-radius:6px;margin-bottom:20px;"">
                <strong>{System.Web.HttpUtility.HtmlEncode(report.Summary)}</strong>
            </div>
            <table style=""width:100%;border-collapse:collapse;"">
                <tr>
                    <td style=""padding:8px 0;""><span style=""color:#718096;font-size:12px;"">Vehicle</span><br><strong>{System.Web.HttpUtility.HtmlEncode(report.VehicleName ?? report.VehicleId)}</strong></td>
                    <td style=""padding:8px 0;""><span style=""color:#718096;font-size:12px;"">Driver</span><br><strong>{System.Web.HttpUtility.HtmlEncode(report.DriverName ?? report.DriverId ?? "Unknown")}</strong></td>
                </tr>
                <tr>
                    <td style=""padding:8px 0;""><span style=""color:#718096;font-size:12px;"">Date/Time</span><br><strong>{report.OccurredAt:MMM dd, yyyy HH:mm} UTC</strong></td>
                    <td style=""padding:8px 0;""><span style=""color:#718096;font-size:12px;"">Weather</span><br><strong>{System.Web.HttpUtility.HtmlEncode(report.Evidence.WeatherCondition ?? "Unknown")}</strong></td>
                </tr>
            </table>
            <div style=""display:flex;gap:10px;margin:20px 0;"">
                <div style=""flex:1;background:#f7fafc;padding:12px;border-radius:6px;text-align:center;"">
                    <div style=""font-size:24px;font-weight:bold;color:#1a365d;"">{report.Evidence.SpeedAtEventKmh?.ToString("F0") ?? "-"}</div>
                    <div style=""font-size:11px;color:#718096;"">Speed (km/h)</div>
                </div>
                <div style=""flex:1;background:#f7fafc;padding:12px;border-radius:6px;text-align:center;"">
                    <div style=""font-size:24px;font-weight:bold;color:#1a365d;"">{report.Evidence.DecelerationMps2?.ToString("F1") ?? "-"}</div>
                    <div style=""font-size:11px;color:#718096;"">Decel (m/s²)</div>
                </div>
                <div style=""flex:1;background:#f7fafc;padding:12px;border-radius:6px;text-align:center;"">
                    <div style=""font-size:24px;font-weight:bold;color:#1a365d;"">{report.Evidence.GpsTrail.Count}</div>
                    <div style=""font-size:11px;color:#718096;"">GPS Points</div>
                </div>
            </div>
            {ctaSection}
        </div>
        <div style=""padding:15px 20px;background:#edf2f7;font-size:12px;color:#718096;text-align:center;"">
            This report was automatically generated by FleetClaim.<br>
            Report #{report.Id} | Generated {report.GeneratedAt:yyyy-MM-dd HH:mm} UTC
        </div>
    </div>
</body>
</html>";
    }
    
    private static string BuildTextBody(IncidentReport report, string? customMessage)
    {
        var sb = new StringBuilder();
        sb.AppendLine("FleetClaim Incident Report");
        sb.AppendLine("==========================");
        sb.AppendLine();
        
        if (!string.IsNullOrWhiteSpace(customMessage))
        {
            sb.AppendLine(customMessage);
            sb.AppendLine();
        }
        
        sb.AppendLine($"Severity: {report.Severity}");
        sb.AppendLine($"Summary: {report.Summary}");
        sb.AppendLine();
        sb.AppendLine("Details:");
        sb.AppendLine($"- Vehicle: {report.VehicleName ?? report.VehicleId}");
        sb.AppendLine($"- Driver: {report.DriverName ?? report.DriverId ?? "Unknown"}");
        sb.AppendLine($"- Occurred: {report.OccurredAt:yyyy-MM-dd HH:mm} UTC");
        sb.AppendLine($"- Weather: {report.Evidence.WeatherCondition ?? "Unknown"}");
        sb.AppendLine();
        sb.AppendLine("Metrics:");
        sb.AppendLine($"- Speed at Event: {report.Evidence.SpeedAtEventKmh?.ToString("F0") ?? "-"} km/h");
        sb.AppendLine($"- Deceleration: {report.Evidence.DecelerationMps2?.ToString("F1") ?? "-"} m/s²");
        sb.AppendLine($"- GPS Points: {report.Evidence.GpsTrail.Count}");
        sb.AppendLine();
        
        if (!string.IsNullOrEmpty(report.ShareUrl))
        {
            sb.AppendLine($"View Full Report: {report.ShareUrl}");
            sb.AppendLine();
        }
        
        sb.AppendLine("--");
        sb.AppendLine($"Report #{report.Id}");
        sb.AppendLine("Generated by FleetClaim");
        
        return sb.ToString();
    }
    
    private static string Base64UrlEncode(MimeMessage message)
    {
        using var stream = new MemoryStream();
        message.WriteTo(stream);
        var bytes = stream.ToArray();
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .Replace("=", "");
    }
}

public class GmailOAuthCredentials
{
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string AccessToken { get; set; } = "";
    public string RefreshToken { get; set; } = "";
}
