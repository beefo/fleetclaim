using FleetClaim.Core.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace FleetClaim.Core.Services;

/// <summary>
/// PDF renderer using QuestPDF for professional incident reports.
/// </summary>
public class QuestPdfRenderer : IPdfRenderer
{
    private readonly PdfOptions _options;
    
    public QuestPdfRenderer(PdfOptions? options = null)
    {
        _options = options ?? new PdfOptions();
        // QuestPDF community license (free for small businesses)
        QuestPDF.Settings.License = LicenseType.Community;
    }
    
    public Task<string> RenderPdfAsync(IncidentReport report, CancellationToken ct = default)
    {
        var document = new IncidentReportDocument(report, _options);
        var pdfBytes = document.GeneratePdf();
        var base64 = Convert.ToBase64String(pdfBytes);
        return Task.FromResult(base64);
    }
}

public class PdfOptions
{
    public string CompanyName { get; set; } = "FleetClaim";
    public string? LogoUrl { get; set; }
    public string? GoogleMapsApiKey { get; set; }
}

internal class IncidentReportDocument : IDocument
{
    private readonly IncidentReport _report;
    private readonly PdfOptions _options;
    
    private static readonly string PrimaryColor = "#1a365d";
    private static readonly string AccentColor = "#2b6cb0";
    private static readonly string LightGray = "#f7fafc";
    private static readonly string BorderColor = "#e2e8f0";
    
    public IncidentReportDocument(IncidentReport report, PdfOptions options)
    {
        _report = report;
        _options = options;
    }
    
    public DocumentMetadata GetMetadata() => new()
    {
        Title = $"Incident Report - {_report.Id}",
        Author = _options.CompanyName,
        Subject = $"Incident {_report.IncidentId}",
        CreationDate = _report.GeneratedAt
    };
    
    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.Letter);
            page.Margin(40);
            page.DefaultTextStyle(x => x.FontSize(10));
            
            page.Header().Element(ComposeHeader);
            page.Content().Element(ComposeContent);
            page.Footer().Element(ComposeFooter);
        });
    }
    
    private void ComposeHeader(IContainer container)
    {
        container.Row(row =>
        {
            row.RelativeItem().Column(col =>
            {
                col.Item().Text(_options.CompanyName)
                    .Bold().FontSize(20).FontColor(PrimaryColor);
                col.Item().Text("Incident Evidence Report")
                    .FontSize(12).FontColor(AccentColor);
            });
            
            row.ConstantItem(120).Column(col =>
            {
                col.Item().AlignRight().Text($"Report #{_report.Id}")
                    .Bold().FontSize(10);
                col.Item().AlignRight().Text($"Generated: {_report.GeneratedAt:MMM dd, yyyy HH:mm}")
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
            });
        });
    }
    
    private void ComposeContent(IContainer container)
    {
        container.PaddingVertical(20).Column(col =>
        {
            col.Spacing(15);
            
            // Severity badge + summary
            col.Item().Element(ComposeSeverityBanner);
            
            // Incident Details section
            col.Item().Element(ComposeIncidentDetails);
            
            // GPS Map placeholder
            col.Item().Element(ComposeMapSection);
            
            // Speed chart (simplified data table)
            col.Item().Element(ComposeSpeedSection);
            
            // Diagnostics table
            col.Item().Element(ComposeDiagnosticsSection);
            
            // Evidence summary
            col.Item().Element(ComposeEvidenceSummary);
            
            // Notes section (if user has added notes)
            if (!string.IsNullOrWhiteSpace(_report.Notes))
            {
                col.Item().Element(ComposeNotesSection);
            }
        });
    }
    
    private void ComposeNotesSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("Notes & Driver Statement").Bold().FontSize(12).FontColor(PrimaryColor);
            
            col.Item().PaddingTop(10).Background(LightGray).Padding(10)
                .Text(_report.Notes ?? "")
                .FontSize(10)
                .LineHeight(1.4f);
            
            if (_report.NotesUpdatedAt.HasValue)
            {
                col.Item().PaddingTop(5).Text(
                    $"Last updated: {_report.NotesUpdatedAt:yyyy-MM-dd HH:mm} UTC" +
                    (!string.IsNullOrEmpty(_report.NotesUpdatedBy) ? $" by {_report.NotesUpdatedBy}" : ""))
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
            }
        });
    }
    
    private void ComposeSeverityBanner(IContainer container)
    {
        var (bgColor, textColor) = _report.Severity switch
        {
            IncidentSeverity.Critical => ("#c53030", "#ffffff"),
            IncidentSeverity.High => ("#dd6b20", "#ffffff"),
            IncidentSeverity.Medium => ("#d69e2e", "#1a202c"),
            _ => ("#38a169", "#ffffff")
        };
        
        container.Background(bgColor).Padding(12).Row(row =>
        {
            row.ConstantItem(100).Text(_report.Severity.ToString().ToUpper())
                .Bold().FontSize(14).FontColor(textColor);
            row.RelativeItem().Text(_report.Summary)
                .FontSize(11).FontColor(textColor);
        });
    }
    
    private void ComposeIncidentDetails(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("Incident Details").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Incident ID"] = _report.IncidentId,
                    ["Occurred At"] = _report.OccurredAt.ToString("yyyy-MM-dd HH:mm:ss UTC"),
                    ["Vehicle"] = _report.VehicleName ?? _report.VehicleId,
                }));
                
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Driver"] = _report.DriverName ?? _report.DriverId ?? "Unknown",
                    ["Vehicle ID"] = _report.VehicleId,
                    ["Report Generated"] = _report.GeneratedAt.ToString("yyyy-MM-dd HH:mm UTC"),
                }));
            });
        });
    }
    
    private void DetailColumn(IContainer container, Dictionary<string, string?> details)
    {
        container.Column(col =>
        {
            col.Spacing(4);
            foreach (var (label, value) in details)
            {
                col.Item().Row(row =>
                {
                    row.ConstantItem(100).Text(label + ":").FontColor(Colors.Grey.Darken1);
                    row.RelativeItem().Text(value ?? "-");
                });
            }
        });
    }
    
    private void ComposeMapSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("GPS Trail").Bold().FontSize(12).FontColor(PrimaryColor);
            
            if (_report.Evidence.GpsTrail.Count == 0)
            {
                col.Item().PaddingTop(10).Text("No GPS data available")
                    .Italic().FontColor(Colors.Grey.Darken1);
                return;
            }
            
            // Show map URL or placeholder
            var mapUrl = GenerateStaticMapUrl();
            col.Item().PaddingTop(10).Height(200).Background(LightGray).AlignCenter().AlignMiddle()
                .Column(inner =>
                {
                    inner.Item().Text("GPS Map Preview").FontSize(10).FontColor(Colors.Grey.Darken1);
                    inner.Item().PaddingTop(5).Text($"{_report.Evidence.GpsTrail.Count} points recorded")
                        .FontSize(9).FontColor(Colors.Grey.Medium);
                    if (!string.IsNullOrEmpty(mapUrl))
                    {
                        inner.Item().PaddingTop(5).Text("Map URL: " + mapUrl[..Math.Min(60, mapUrl.Length)] + "...")
                            .FontSize(7).FontColor(Colors.Grey.Darken1);
                    }
                });
            
            // GPS coordinates summary
            var first = _report.Evidence.GpsTrail.First();
            var last = _report.Evidence.GpsTrail.Last();
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Text($"Start: {first.Latitude:F5}, {first.Longitude:F5} @ {first.Timestamp:HH:mm:ss}")
                    .FontSize(8);
                row.RelativeItem().Text($"End: {last.Latitude:F5}, {last.Longitude:F5} @ {last.Timestamp:HH:mm:ss}")
                    .FontSize(8);
            });
        });
    }
    
    private void ComposeSpeedSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("Speed Analysis").Bold().FontSize(12).FontColor(PrimaryColor);
            
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => SpeedMetric(c, "Speed at Event", 
                    _report.Evidence.SpeedAtEventKmh?.ToString("F0") ?? "-", "km/h"));
                row.RelativeItem().Element(c => SpeedMetric(c, "Max Speed (Window)", 
                    _report.Evidence.MaxSpeedKmh?.ToString("F0") ?? "-", "km/h"));
                row.RelativeItem().Element(c => SpeedMetric(c, "Deceleration", 
                    _report.Evidence.DecelerationMps2?.ToString("F1") ?? "-", "m/s²"));
            });
            
            // Speed over time (simplified - show key points)
            if (_report.Evidence.GpsTrail.Count > 0)
            {
                col.Item().PaddingTop(15).Text("Speed Profile (sampled)").FontSize(9).FontColor(Colors.Grey.Darken1);
                
                // Sample every Nth point to keep table manageable
                var sampleRate = Math.Max(1, _report.Evidence.GpsTrail.Count / 10);
                var samples = _report.Evidence.GpsTrail
                    .Where((_, i) => i % sampleRate == 0)
                    .Take(10)
                    .ToList();
                
                col.Item().PaddingTop(5).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(2);
                        columns.RelativeColumn(1);
                        columns.RelativeColumn(2);
                    });
                    
                    table.Header(header =>
                    {
                        header.Cell().Background(LightGray).Padding(4).Text("Time").Bold().FontSize(8);
                        header.Cell().Background(LightGray).Padding(4).Text("Speed").Bold().FontSize(8);
                        header.Cell().Background(LightGray).Padding(4).Text("Location").Bold().FontSize(8);
                    });
                    
                    foreach (var point in samples)
                    {
                        table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                            .Text(point.Timestamp.ToString("HH:mm:ss")).FontSize(8);
                        table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                            .Text($"{point.SpeedKmh:F0} km/h").FontSize(8);
                        table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                            .Text($"{point.Latitude:F4}, {point.Longitude:F4}").FontSize(8);
                    }
                });
            }
        });
    }
    
    private void SpeedMetric(IContainer container, string label, string value, string unit)
    {
        container.Background(LightGray).Padding(10).Column(col =>
        {
            col.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken1);
            col.Item().Row(row =>
            {
                row.AutoItem().Text(value).Bold().FontSize(18).FontColor(PrimaryColor);
                row.AutoItem().PaddingLeft(2).AlignBottom().Text(unit).FontSize(9);
            });
        });
    }
    
    private void ComposeDiagnosticsSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("Diagnostic Data").Bold().FontSize(12).FontColor(PrimaryColor);
            
            if (_report.Evidence.Diagnostics.Count == 0)
            {
                col.Item().PaddingTop(10).Text("No diagnostic codes recorded during incident window")
                    .Italic().FontColor(Colors.Grey.Darken1);
                return;
            }
            
            col.Item().PaddingTop(10).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(1);
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(1);
                    columns.RelativeColumn(1);
                });
                
                table.Header(header =>
                {
                    header.Cell().Background(LightGray).Padding(4).Text("Code").Bold().FontSize(9);
                    header.Cell().Background(LightGray).Padding(4).Text("Description").Bold().FontSize(9);
                    header.Cell().Background(LightGray).Padding(4).Text("Value").Bold().FontSize(9);
                    header.Cell().Background(LightGray).Padding(4).Text("Unit").Bold().FontSize(9);
                });
                
                foreach (var diag in _report.Evidence.Diagnostics.Take(20))
                {
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(diag.Code).FontSize(8);
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(diag.Description ?? "-").FontSize(8);
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(diag.Value?.ToString("F2") ?? "-").FontSize(8);
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(diag.Unit ?? "-").FontSize(8);
                }
            });
            
            if (_report.Evidence.Diagnostics.Count > 20)
            {
                col.Item().PaddingTop(5).Text($"... and {_report.Evidence.Diagnostics.Count - 20} more")
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
            }
        });
    }
    
    private void ComposeEvidenceSummary(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("Evidence Summary").Bold().FontSize(12).FontColor(PrimaryColor);
            
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => SummaryItem(c, "GPS Points", 
                    _report.Evidence.GpsTrail.Count.ToString()));
                row.RelativeItem().Element(c => SummaryItem(c, "Diagnostic Codes", 
                    _report.Evidence.Diagnostics.Count.ToString()));
                row.RelativeItem().Element(c => SummaryItem(c, "Weather", 
                    _report.Evidence.WeatherCondition ?? "Unknown"));
                row.RelativeItem().Element(c => SummaryItem(c, "Temperature", 
                    _report.Evidence.TemperatureCelsius.HasValue 
                        ? $"{_report.Evidence.TemperatureCelsius:F0}°C" 
                        : "-"));
            });
            
            // HOS status if available
            if (_report.Evidence.DriverHosStatus != null)
            {
                col.Item().PaddingTop(10).Background(LightGray).Padding(8).Column(hos =>
                {
                    hos.Item().Text("Driver HOS Status at Incident").Bold().FontSize(9);
                    hos.Item().PaddingTop(4).Text($"Status: {_report.Evidence.DriverHosStatus.Status ?? "Unknown"}")
                        .FontSize(9);
                });
            }
        });
    }
    
    private void SummaryItem(IContainer container, string label, string value)
    {
        container.Column(col =>
        {
            col.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken1);
            col.Item().Text(value).Bold().FontSize(11);
        });
    }
    
    private void ComposeFooter(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().BorderTop(1).BorderColor(BorderColor).PaddingTop(5).Row(row =>
            {
                row.RelativeItem().Text($"{_options.CompanyName} - Incident Report")
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
                row.RelativeItem().AlignRight().Text(text =>
                {
                    text.Span("Page ").FontSize(8).FontColor(Colors.Grey.Darken1);
                    text.CurrentPageNumber().FontSize(8);
                    text.Span(" of ").FontSize(8).FontColor(Colors.Grey.Darken1);
                    text.TotalPages().FontSize(8);
                });
            });
            
            if (!string.IsNullOrEmpty(_report.ShareUrl))
            {
                col.Item().PaddingTop(3).Text($"View online: {_report.ShareUrl}")
                    .FontSize(7).FontColor(AccentColor);
            }
        });
    }
    
    private static IContainer SectionBox(IContainer container)
    {
        return container
            .Border(1)
            .BorderColor(BorderColor)
            .Background(Colors.White)
            .Padding(12);
    }
    
    private string? GenerateStaticMapUrl()
    {
        if (_report.Evidence.GpsTrail.Count == 0 || string.IsNullOrEmpty(_options.GoogleMapsApiKey))
            return null;
        
        // Build a polyline path for Google Static Maps
        var points = _report.Evidence.GpsTrail
            .Where((_, i) => i % Math.Max(1, _report.Evidence.GpsTrail.Count / 50) == 0)
            .Take(50);
        
        var pathPoints = string.Join("|", points.Select(p => $"{p.Latitude:F5},{p.Longitude:F5}"));
        
        // Find incident point (center)
        var center = _report.Evidence.GpsTrail
            .OrderBy(p => Math.Abs((p.Timestamp - _report.OccurredAt).TotalSeconds))
            .First();
        
        return $"https://maps.googleapis.com/maps/api/staticmap?" +
               $"center={center.Latitude:F5},{center.Longitude:F5}" +
               $"&zoom=14&size=600x300&maptype=roadmap" +
               $"&path=color:0x0000ff|weight:3|{pathPoints}" +
               $"&markers=color:red|{center.Latitude:F5},{center.Longitude:F5}" +
               $"&key={_options.GoogleMapsApiKey}";
    }
}
