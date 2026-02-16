using System.Net;
using System.Net.Http.Json;
using System.Net.Mail;
using System.Text;
using FleetClaim.Core.Models;
using SendGrid;
using SendGrid.Helpers.Mail;

namespace FleetClaim.Core.Services;

public interface INotificationService
{
    Task SendNotificationsAsync(IncidentReport report, CustomerConfig config, CancellationToken ct = default);
}

/// <summary>
/// Notification service supporting email (SMTP or SendGrid) and webhooks.
/// </summary>
public class NotificationService : INotificationService
{
    private readonly NotificationOptions _options;
    private readonly HttpClient _httpClient;
    
    public NotificationService(NotificationOptions options, HttpClient? httpClient = null)
    {
        _options = options;
        _httpClient = httpClient ?? new HttpClient();
    }
    
    public async Task SendNotificationsAsync(IncidentReport report, CustomerConfig config, CancellationToken ct = default)
    {
        var tasks = new List<Task>();
        
        // Send emails
        if (config.NotifyEmails.Count > 0)
        {
            tasks.Add(SendEmailsAsync(report, config.NotifyEmails, ct));
        }
        
        // Send webhook
        if (!string.IsNullOrEmpty(config.NotifyWebhook))
        {
            tasks.Add(SendWebhookAsync(report, config.NotifyWebhook, ct));
        }
        
        await Task.WhenAll(tasks);
    }
    
    private async Task SendEmailsAsync(IncidentReport report, List<string> emails, CancellationToken ct)
    {
        if (_options.UseSendGrid && !string.IsNullOrEmpty(_options.SendGridApiKey))
        {
            await SendViaSendGridAsync(report, emails, ct);
        }
        else if (!string.IsNullOrEmpty(_options.SmtpHost))
        {
            await SendViaSmtpAsync(report, emails, ct);
        }
    }
    
    private async Task SendViaSendGridAsync(IncidentReport report, List<string> emails, CancellationToken ct)
    {
        var client = new SendGridClient(_options.SendGridApiKey);
        
        var from = new EmailAddress(_options.FromEmail, _options.FromName ?? "FleetClaim");
        var subject = BuildEmailSubject(report);
        var htmlContent = BuildEmailHtml(report);
        var plainContent = BuildEmailPlain(report);
        
        foreach (var email in emails)
        {
            var to = new EmailAddress(email);
            var msg = MailHelper.CreateSingleEmail(from, to, subject, plainContent, htmlContent);
            
            // Attach PDF if available and not too large
            if (!string.IsNullOrEmpty(report.PdfBase64) && report.PdfBase64.Length < 5_000_000)
            {
                msg.AddAttachment(
                    $"incident-report-{report.Id}.pdf",
                    report.PdfBase64,
                    "application/pdf"
                );
            }
            
            await client.SendEmailAsync(msg, ct);
        }
    }
    
    private async Task SendViaSmtpAsync(IncidentReport report, List<string> emails, CancellationToken ct)
    {
        using var client = new SmtpClient(_options.SmtpHost, _options.SmtpPort)
        {
            EnableSsl = _options.SmtpUseSsl,
            Credentials = !string.IsNullOrEmpty(_options.SmtpUsername)
                ? new NetworkCredential(_options.SmtpUsername, _options.SmtpPassword)
                : null
        };
        
        var from = new MailAddress(_options.FromEmail, _options.FromName ?? "FleetClaim");
        var subject = BuildEmailSubject(report);
        
        foreach (var email in emails)
        {
            using var message = new MailMessage(from, new MailAddress(email))
            {
                Subject = subject,
                Body = BuildEmailHtml(report),
                IsBodyHtml = true
            };
            
            // Attach PDF if available
            if (!string.IsNullOrEmpty(report.PdfBase64))
            {
                var pdfBytes = Convert.FromBase64String(report.PdfBase64);
                var attachment = new System.Net.Mail.Attachment(
                    new MemoryStream(pdfBytes),
                    $"incident-report-{report.Id}.pdf",
                    "application/pdf"
                );
                message.Attachments.Add(attachment);
            }
            
            await client.SendMailAsync(message, ct);
        }
    }
    
    private async Task SendWebhookAsync(IncidentReport report, string webhookUrl, CancellationToken ct)
    {
        var payload = new WebhookPayload
        {
            EventType = "incident.report.generated",
            Timestamp = DateTime.UtcNow,
            Report = new WebhookReportData
            {
                Id = report.Id,
                IncidentId = report.IncidentId,
                VehicleId = report.VehicleId,
                VehicleName = report.VehicleName,
                DriverId = report.DriverId,
                DriverName = report.DriverName,
                OccurredAt = report.OccurredAt,
                GeneratedAt = report.GeneratedAt,
                Severity = report.Severity.ToString(),
                Summary = report.Summary,
                ShareUrl = report.ShareUrl,
                Evidence = new WebhookEvidenceData
                {
                    GpsPointCount = report.Evidence.GpsTrail.Count,
                    MaxSpeedKmh = report.Evidence.MaxSpeedKmh,
                    SpeedAtEventKmh = report.Evidence.SpeedAtEventKmh,
                    DecelerationMps2 = report.Evidence.DecelerationMps2,
                    WeatherCondition = report.Evidence.WeatherCondition,
                    DiagnosticCount = report.Evidence.Diagnostics.Count
                }
            }
        };
        
        var response = await _httpClient.PostAsJsonAsync(webhookUrl, payload, ct);
        response.EnsureSuccessStatusCode();
    }
    
    private static string BuildEmailSubject(IncidentReport report)
    {
        var severityEmoji = report.Severity switch
        {
            IncidentSeverity.Critical => "🔴",
            IncidentSeverity.High => "🟠",
            IncidentSeverity.Medium => "🟡",
            _ => "🟢"
        };
        
        return $"{severityEmoji} [{report.Severity}] Incident Report: {report.VehicleName ?? report.VehicleId}";
    }
    
    private static string BuildEmailHtml(IncidentReport report)
    {
        var severityColor = report.Severity switch
        {
            IncidentSeverity.Critical => "#c53030",
            IncidentSeverity.High => "#dd6b20",
            IncidentSeverity.Medium => "#d69e2e",
            _ => "#38a169"
        };

        var ctaSection = string.IsNullOrEmpty(report.ShareUrl) 
            ? "" 
            : $@"<div class=""cta""><a href=""{report.ShareUrl}"">View Full Report</a></div>";

        var sb = new StringBuilder();
        sb.Append(@"<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f7fafc; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .header { background: #1a365d; color: white; padding: 20px; }
        .header h1 { margin: 0; font-size: 20px; }
        .severity { display: inline-block; background: ");
        sb.Append(severityColor);
        sb.Append(@"; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; margin-top: 10px; }
        .content { padding: 20px; }
        .summary { background: #edf2f7; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .detail-item { }
        .detail-label { font-size: 12px; color: #718096; margin-bottom: 2px; }
        .detail-value { font-size: 14px; font-weight: 500; }
        .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 20px 0; }
        .metric { background: #f7fafc; padding: 12px; border-radius: 6px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #1a365d; }
        .metric-label { font-size: 11px; color: #718096; }
        .cta { text-align: center; margin-top: 20px; }
        .cta a { display: inline-block; background: #2b6cb0; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; }
        .footer { padding: 15px 20px; background: #edf2f7; font-size: 12px; color: #718096; text-align: center; }
    </style>
</head>
<body>
    <div class=""container"">
        <div class=""header"">
            <h1>FleetClaim Incident Report</h1>
            <div class=""severity"">");
        sb.Append(report.Severity.ToString().ToUpper());
        sb.Append(@"</div>
        </div>
        <div class=""content"">
            <div class=""summary"">
                <strong>");
        sb.Append(System.Web.HttpUtility.HtmlEncode(report.Summary));
        sb.Append(@"</strong>
            </div>
            <div class=""details"">
                <div class=""detail-item"">
                    <div class=""detail-label"">Vehicle</div>
                    <div class=""detail-value"">");
        sb.Append(System.Web.HttpUtility.HtmlEncode(report.VehicleName ?? report.VehicleId));
        sb.Append(@"</div>
                </div>
                <div class=""detail-item"">
                    <div class=""detail-label"">Driver</div>
                    <div class=""detail-value"">");
        sb.Append(System.Web.HttpUtility.HtmlEncode(report.DriverName ?? report.DriverId ?? "Unknown"));
        sb.Append(@"</div>
                </div>
                <div class=""detail-item"">
                    <div class=""detail-label"">Occurred At</div>
                    <div class=""detail-value"">");
        sb.Append(report.OccurredAt.ToString("MMM dd, yyyy HH:mm"));
        sb.Append(@" UTC</div>
                </div>
                <div class=""detail-item"">
                    <div class=""detail-label"">Report ID</div>
                    <div class=""detail-value"">");
        sb.Append(report.Id);
        sb.Append(@"</div>
                </div>
            </div>
            <div class=""metrics"">
                <div class=""metric"">
                    <div class=""metric-value"">");
        sb.Append(report.Evidence.SpeedAtEventKmh?.ToString("F0") ?? "-");
        sb.Append(@"</div>
                    <div class=""metric-label"">Speed (km/h)</div>
                </div>
                <div class=""metric"">
                    <div class=""metric-value"">");
        sb.Append(report.Evidence.DecelerationMps2?.ToString("F1") ?? "-");
        sb.Append(@"</div>
                    <div class=""metric-label"">Decel (m/s²)</div>
                </div>
                <div class=""metric"">
                    <div class=""metric-value"">");
        sb.Append(report.Evidence.GpsTrail.Count);
        sb.Append(@"</div>
                    <div class=""metric-label"">GPS Points</div>
                </div>
            </div>
            ");
        sb.Append(ctaSection);
        sb.Append(@"
        </div>
        <div class=""footer"">
            This report was automatically generated by FleetClaim.
            <br>Report #");
        sb.Append(report.Id);
        sb.Append(" | Generated ");
        sb.Append(report.GeneratedAt.ToString("yyyy-MM-dd HH:mm"));
        sb.Append(@" UTC
        </div>
    </div>
</body>
</html>");

        return sb.ToString();
    }
    
    private static string BuildEmailPlain(IncidentReport report)
    {
        var sb = new StringBuilder();
        sb.AppendLine("FleetClaim Incident Report");
        sb.AppendLine("==========================");
        sb.AppendLine();
        sb.AppendLine($"Severity: {report.Severity}");
        sb.AppendLine($"Summary: {report.Summary}");
        sb.AppendLine();
        sb.AppendLine("Details:");
        sb.AppendLine($"- Vehicle: {report.VehicleName ?? report.VehicleId}");
        sb.AppendLine($"- Driver: {report.DriverName ?? report.DriverId ?? "Unknown"}");
        sb.AppendLine($"- Occurred: {report.OccurredAt:yyyy-MM-dd HH:mm} UTC");
        sb.AppendLine($"- Report ID: {report.Id}");
        sb.AppendLine();
        sb.AppendLine("Evidence:");
        sb.AppendLine($"- Speed at Event: {report.Evidence.SpeedAtEventKmh?.ToString("F0") ?? "-"} km/h");
        sb.AppendLine($"- Deceleration: {report.Evidence.DecelerationMps2?.ToString("F1") ?? "-"} m/s²");
        sb.AppendLine($"- GPS Points: {report.Evidence.GpsTrail.Count}");
        sb.AppendLine($"- Weather: {report.Evidence.WeatherCondition ?? "Unknown"}");
        sb.AppendLine();
        if (!string.IsNullOrEmpty(report.ShareUrl))
        {
            sb.AppendLine($"View online: {report.ShareUrl}");
            sb.AppendLine();
        }
        sb.AppendLine("--");
        sb.AppendLine("Generated by FleetClaim");
        
        return sb.ToString();
    }
}

public class NotificationOptions
{
    // SendGrid settings
    public bool UseSendGrid { get; set; } = true;
    public string? SendGridApiKey { get; set; }
    
    // SMTP settings (fallback)
    public string? SmtpHost { get; set; }
    public int SmtpPort { get; set; } = 587;
    public bool SmtpUseSsl { get; set; } = true;
    public string? SmtpUsername { get; set; }
    public string? SmtpPassword { get; set; }
    
    // Common
    public string FromEmail { get; set; } = "noreply@fleetclaim.app";
    public string? FromName { get; set; } = "FleetClaim";
}

// Webhook payload models
public class WebhookPayload
{
    public string EventType { get; set; } = "";
    public DateTime Timestamp { get; set; }
    public WebhookReportData Report { get; set; } = new();
}

public class WebhookReportData
{
    public string Id { get; set; } = "";
    public string IncidentId { get; set; } = "";
    public string VehicleId { get; set; } = "";
    public string? VehicleName { get; set; }
    public string? DriverId { get; set; }
    public string? DriverName { get; set; }
    public DateTime OccurredAt { get; set; }
    public DateTime GeneratedAt { get; set; }
    public string Severity { get; set; } = "";
    public string Summary { get; set; } = "";
    public string? ShareUrl { get; set; }
    public WebhookEvidenceData Evidence { get; set; } = new();
}

public class WebhookEvidenceData
{
    public int GpsPointCount { get; set; }
    public double? MaxSpeedKmh { get; set; }
    public double? SpeedAtEventKmh { get; set; }
    public double? DecelerationMps2 { get; set; }
    public string? WeatherCondition { get; set; }
    public int DiagnosticCount { get; set; }
}
