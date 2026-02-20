using FleetClaim.Core.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace FleetClaim.Core.Services;

/// <summary>
/// PDF renderer using QuestPDF for professional incident reports.
/// Designed for insurance claim submission with all required fields.
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
    
    public async Task<string> RenderPdfAsync(IncidentReport report, CancellationToken ct = default)
    {
        return await RenderPdfAsync(report, null, ct);
    }
    
    public async Task<string> RenderPdfAsync(IncidentReport report, Dictionary<string, byte[]>? photoData, CancellationToken ct = default)
    {
        // Fetch static map image if GPS data available
        byte[]? mapImage = null;
        if (report.Evidence?.GpsTrail?.Count > 0)
        {
            mapImage = await FetchStaticMapImageAsync(report);
        }
        
        var document = new IncidentReportDocument(report, _options, mapImage, photoData);
        var pdfBytes = document.GeneratePdf();
        var base64 = Convert.ToBase64String(pdfBytes);
        return base64;
    }
    
    private async Task<byte[]?> FetchStaticMapImageAsync(IncidentReport report)
    {
        if (report.Evidence?.GpsTrail == null || report.Evidence.GpsTrail.Count == 0)
            return null;
        
        try
        {
            var gpsTrail = report.Evidence.GpsTrail;
            var start = gpsTrail.First();
            var end = gpsTrail.Last();
            
            // Find the incident point (closest to occurred time)
            var incidentPoint = gpsTrail
                .OrderBy(p => Math.Abs((p.Timestamp - report.OccurredAt).TotalSeconds))
                .First();
            
            // Calculate bounds for auto-zoom
            var lats = gpsTrail.Select(p => p.Latitude).ToList();
            var lngs = gpsTrail.Select(p => p.Longitude).ToList();
            var centerLat = (lats.Min() + lats.Max()) / 2;
            var centerLng = (lngs.Min() + lngs.Max()) / 2;
            
            // Sample points for polyline (max ~50 points for URL length)
            var sampleRate = Math.Max(1, gpsTrail.Count / 50);
            var sampledPoints = gpsTrail
                .Where((_, i) => i % sampleRate == 0 || i == gpsTrail.Count - 1)
                .Take(50)
                .ToList();
            
            // Build polyline string for Geoapify: lon,lat;lon,lat;...
            var polylineCoords = string.Join(";", sampledPoints.Select(p => $"{p.Longitude:F5},{p.Latitude:F5}"));
            
            // Use geoapify free tier (3000 req/day) with polyline and markers
            // Markers: green start, red incident, blue end
            var mapUrl = $"https://maps.geoapify.com/v1/staticmap?" +
                $"style=osm-bright&width=600&height=300" +
                $"&center=lonlat:{centerLng:F5},{centerLat:F5}" +
                // Auto-fit to bounds
                $"&geometry=polyline:{polylineCoords};lineColor:%232563eb;lineWidth:4" +
                // Start marker (green)
                $"&marker=lonlat:{start.Longitude:F5},{start.Latitude:F5};color:%2322c55e;size:medium;text:START" +
                // Incident marker (red, prominent)
                $"&marker=lonlat:{incidentPoint.Longitude:F5},{incidentPoint.Latitude:F5};color:%23ef4444;size:large;text:INCIDENT" +
                // End marker (blue)
                $"&marker=lonlat:{end.Longitude:F5},{end.Latitude:F5};color:%233b82f6;size:medium;text:END";
            
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(20);
            httpClient.DefaultRequestHeaders.Add("User-Agent", "FleetClaim/1.0");
            
            var response = await httpClient.GetAsync(mapUrl);
            if (response.IsSuccessStatusCode && response.Content.Headers.ContentType?.MediaType?.StartsWith("image/") == true)
            {
                return await response.Content.ReadAsByteArrayAsync();
            }
            
            // Fallback: try simpler map without geometry (some free tiers limit features)
            var fallbackUrl = $"https://maps.geoapify.com/v1/staticmap?" +
                $"style=osm-bright&width=600&height=300" +
                $"&center=lonlat:{incidentPoint.Longitude:F5},{incidentPoint.Latitude:F5}&zoom=14" +
                $"&marker=lonlat:{incidentPoint.Longitude:F5},{incidentPoint.Latitude:F5};color:%23ef4444;size:large";
            
            response = await httpClient.GetAsync(fallbackUrl);
            if (response.IsSuccessStatusCode && response.Content.Headers.ContentType?.MediaType?.StartsWith("image/") == true)
            {
                return await response.Content.ReadAsByteArrayAsync();
            }
        }
        catch
        {
            // Map fetch failed, continue without map image
        }
        return null;
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
    private readonly byte[]? _mapImage;
    private readonly Dictionary<string, byte[]> _photoData;
    
    private static readonly string PrimaryColor = "#1a365d";
    private static readonly string AccentColor = "#2b6cb0";
    private static readonly string LightGray = "#f7fafc";
    private static readonly string BorderColor = "#e2e8f0";
    private static readonly string WarningColor = "#c53030";
    
    public IncidentReportDocument(IncidentReport report, PdfOptions options, byte[]? mapImage = null, Dictionary<string, byte[]>? photoData = null)
    {
        _report = report;
        _options = options;
        _mapImage = mapImage;
        _photoData = photoData ?? new Dictionary<string, byte[]>();
    }
    
    public DocumentMetadata GetMetadata() => new()
    {
        Title = $"Incident Report - {_report.Id}",
        Author = _options.CompanyName,
        Subject = $"Vehicle Incident Report for Insurance Claim - {_report.IncidentId}",
        Keywords = "incident report, insurance claim, fleet, vehicle accident",
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
                col.Item().Text("Vehicle Incident Report")
                    .FontSize(12).FontColor(AccentColor);
                col.Item().Text("For Insurance Claim Submission")
                    .FontSize(9).FontColor(Colors.Grey.Darken1).Italic();
            });
            
            row.ConstantItem(140).Column(col =>
            {
                col.Item().AlignRight().Text($"Report #{_report.Id}")
                    .Bold().FontSize(10);
                col.Item().AlignRight().Text($"Incident ID: {_report.IncidentId}")
                    .FontSize(8);
                col.Item().AlignRight().Text($"Generated: {_report.GeneratedAt:MMM dd, yyyy HH:mm} UTC")
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
            });
        });
    }
    
    private void ComposeContent(IContainer container)
    {
        container.PaddingVertical(15).Column(col =>
        {
            col.Spacing(12);
            
            // 1. Severity banner + incident summary
            col.Item().Element(ComposeSeverityBanner);
            
            // 2. INCIDENT OVERVIEW (Date, Time, Location)
            col.Item().Element(ComposeIncidentOverview);
            
            // 3. VEHICLE INFORMATION (VIN, Plate, Make/Model)
            col.Item().Element(ComposeVehicleInfo);
            
            // 4. DRIVER INFORMATION (License, Contact)
            col.Item().Element(ComposeDriverInfo);
            
            // 5. DAMAGE ASSESSMENT
            col.Item().Element(ComposeDamageSection);
            
            // 6. POLICE REPORT
            if (!string.IsNullOrEmpty(_report.PoliceReportNumber) || _report.PoliceReportDate.HasValue)
            {
                col.Item().Element(ComposePoliceReport);
            }
            
            // 7. THIRD-PARTY INFORMATION
            if (_report.ThirdParties.Count > 0)
            {
                col.Item().Element(ComposeThirdPartyInfo);
            }
            
            // 8. WITNESS INFORMATION
            if (_report.Witnesses.Count > 0)
            {
                col.Item().Element(ComposeWitnessInfo);
            }
            
            // 9. GPS & TELEMATICS DATA
            col.Item().Element(ComposeGpsSection);
            
            // 10. SPEED ANALYSIS
            col.Item().Element(ComposeSpeedSection);
            
            // 11. DRIVER BEHAVIOR (Hard Events before incident)
            if (_report.Evidence.HardEventsBeforeIncident?.Count > 0)
            {
                col.Item().Element(ComposeDriverBehaviorSection);
            }
            
            // 12. VEHICLE STATUS AT INCIDENT
            col.Item().Element(ComposeVehicleStatusSection);
            
            // 13. CONDITIONS (Weather, Road, Light)
            col.Item().Element(ComposeConditionsSection);
            
            // 14. DIAGNOSTIC DATA
            col.Item().Element(ComposeDiagnosticsSection);
            
            // 15. DRIVER HOS STATUS
            if (_report.Evidence.DriverHosStatus != null)
            {
                col.Item().Element(ComposeHosSection);
            }
            
            // 14. NOTES & DRIVER STATEMENT
            if (!string.IsNullOrWhiteSpace(_report.Notes))
            {
                col.Item().Element(ComposeNotesSection);
            }
            
            // 15. PHOTOS (if any attached)
            if (_report.Evidence.Photos?.Count > 0 && _photoData.Count > 0)
            {
                col.Item().Element(ComposePhotosSection);
            }
            
            // 16. EVIDENCE SUMMARY
            col.Item().Element(ComposeEvidenceSummary);
            
            // 17. CERTIFICATION BLOCK
            col.Item().Element(ComposeCertificationBlock);
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
    
    private void ComposeIncidentOverview(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("INCIDENT OVERVIEW").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Date of Incident"] = _report.OccurredAt.ToString("MMMM dd, yyyy"),
                    ["Time of Incident"] = _report.OccurredAt.ToString("HH:mm:ss") + " UTC",
                    ["Incident Type"] = _report.IsBaselineReport ? "Baseline Report (No Event)" : "Collision/Impact Event",
                }));
                
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Address"] = _report.IncidentAddress ?? "See GPS coordinates",
                    ["City/State"] = FormatCityState(),
                    ["Country"] = _report.IncidentCountry ?? "-",
                }));
            });
            
            // GPS Coordinates
            if (_report.Evidence.GpsTrail.Count > 0)
            {
                var incidentPoint = _report.Evidence.GpsTrail
                    .OrderBy(p => Math.Abs((p.Timestamp - _report.OccurredAt).TotalSeconds))
                    .First();
                col.Item().PaddingTop(8).Text($"GPS Coordinates: {incidentPoint.Latitude:F6}, {incidentPoint.Longitude:F6}")
                    .FontSize(9).FontColor(Colors.Grey.Darken1);
            }
        });
    }
    
    private string FormatCityState()
    {
        var parts = new[] { _report.IncidentCity, _report.IncidentState }
            .Where(p => !string.IsNullOrEmpty(p));
        return parts.Any() ? string.Join(", ", parts) : "-";
    }
    
    private void ComposeVehicleInfo(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("VEHICLE INFORMATION").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Vehicle Name"] = _report.VehicleName ?? "-",
                    ["VIN"] = _report.VehicleVin ?? "-",
                    ["License Plate"] = _report.VehiclePlate ?? "-",
                    ["Geotab Device ID"] = _report.VehicleId,
                }));
                
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Year"] = _report.VehicleYear ?? "-",
                    ["Make"] = _report.VehicleMake ?? "-",
                    ["Model"] = _report.VehicleModel ?? "-",
                    ["Odometer"] = _report.OdometerKm.HasValue ? $"{_report.OdometerKm:N0} km" : "-",
                }));
            });
        });
    }
    
    private void ComposeDriverInfo(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("DRIVER INFORMATION").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Driver Name"] = _report.DriverName ?? "Unknown",
                    ["Driver ID"] = _report.DriverId ?? "-",
                    ["License Number"] = _report.DriverLicenseNumber ?? "-",
                    ["License State/Province"] = _report.DriverLicenseState ?? "-",
                }));
                
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Phone"] = _report.DriverPhone ?? "-",
                    ["Email"] = _report.DriverEmail ?? "-",
                }));
            });
        });
    }
    
    private void ComposeDamageSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("DAMAGE ASSESSMENT").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Damage Level"] = _report.DamageLevel?.ToString() ?? "Not Assessed",
                    ["Vehicle Driveable"] = FormatBool(_report.VehicleDriveable),
                    ["Airbag Deployed"] = FormatBool(_report.AirbagDeployed),
                }));
                
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Injuries Reported"] = FormatBool(_report.InjuriesReported),
                }));
            });
            
            if (!string.IsNullOrWhiteSpace(_report.DamageDescription))
            {
                col.Item().PaddingTop(8).Text("Damage Description:").Bold().FontSize(9);
                col.Item().PaddingTop(4).Background(LightGray).Padding(8)
                    .Text(_report.DamageDescription)
                    .FontSize(9).LineHeight(1.3f);
            }
            
            if (!string.IsNullOrWhiteSpace(_report.InjuryDescription))
            {
                col.Item().PaddingTop(8).Text("Injury Details:").Bold().FontSize(9).FontColor(WarningColor);
                col.Item().PaddingTop(4).Background("#fff5f5").Border(1).BorderColor(WarningColor).Padding(8)
                    .Text(_report.InjuryDescription)
                    .FontSize(9).LineHeight(1.3f);
            }
        });
    }
    
    private static string FormatBool(bool? value) => value switch
    {
        true => "Yes",
        false => "No",
        null => "Unknown"
    };
    
    private void ComposePoliceReport(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("POLICE REPORT").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["Report Number"] = _report.PoliceReportNumber ?? "-",
                    ["Agency"] = _report.PoliceAgency ?? "-",
                    ["Report Date"] = _report.PoliceReportDate?.ToString("yyyy-MM-dd") ?? "-",
                }));
            });
        });
    }
    
    private void ComposeThirdPartyInfo(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("OTHER PARTIES INVOLVED").Bold().FontSize(12).FontColor(PrimaryColor);
            
            for (int i = 0; i < _report.ThirdParties.Count; i++)
            {
                var party = _report.ThirdParties[i];
                col.Item().PaddingTop(i == 0 ? 10 : 15).Text($"Party {i + 1}").Bold().FontSize(10).FontColor(AccentColor);
                
                col.Item().PaddingTop(6).Row(row =>
                {
                    row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                    {
                        ["Driver Name"] = party.DriverName ?? "-",
                        ["Driver Phone"] = party.DriverPhone ?? "-",
                        ["License #"] = party.DriverLicense ?? "-",
                        ["License State"] = party.DriverLicenseState ?? "-",
                    }));
                    
                    row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                    {
                        ["Vehicle Plate"] = party.VehiclePlate ?? "-",
                        ["Make/Model"] = FormatMakeModel(party.VehicleMake, party.VehicleModel),
                        ["Color"] = party.VehicleColor ?? "-",
                        ["VIN"] = party.VehicleVin ?? "-",
                    }));
                });
                
                if (!string.IsNullOrEmpty(party.InsuranceCompany))
                {
                    col.Item().PaddingTop(6).Background(LightGray).Padding(6).Row(row =>
                    {
                        row.RelativeItem().Text($"Insurance: {party.InsuranceCompany}").FontSize(9);
                        if (!string.IsNullOrEmpty(party.InsurancePolicyNumber))
                            row.RelativeItem().Text($"Policy #: {party.InsurancePolicyNumber}").FontSize(9);
                        if (!string.IsNullOrEmpty(party.InsuranceClaimNumber))
                            row.RelativeItem().Text($"Claim #: {party.InsuranceClaimNumber}").FontSize(9);
                    });
                }
            }
        });
    }
    
    private static string FormatMakeModel(string? make, string? model)
    {
        if (string.IsNullOrEmpty(make) && string.IsNullOrEmpty(model)) return "-";
        return $"{make ?? ""} {model ?? ""}".Trim();
    }
    
    private void ComposeWitnessInfo(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("WITNESSES").Bold().FontSize(12).FontColor(PrimaryColor);
            
            col.Item().PaddingTop(10).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(3);
                });
                
                table.Header(header =>
                {
                    header.Cell().Background(LightGray).Padding(4).Text("Name").Bold().FontSize(9);
                    header.Cell().Background(LightGray).Padding(4).Text("Phone").Bold().FontSize(9);
                    header.Cell().Background(LightGray).Padding(4).Text("Email").Bold().FontSize(9);
                    header.Cell().Background(LightGray).Padding(4).Text("Statement").Bold().FontSize(9);
                });
                
                foreach (var witness in _report.Witnesses)
                {
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(witness.Name ?? "-").FontSize(8);
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(witness.Phone ?? "-").FontSize(8);
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(witness.Email ?? "-").FontSize(8);
                    table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                        .Text(witness.Statement ?? "-").FontSize(8);
                }
            });
        });
    }
    
    private void ComposeGpsSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("GPS TRAIL & LOCATION DATA").Bold().FontSize(12).FontColor(PrimaryColor);
            
            if (_report.Evidence.GpsTrail.Count == 0)
            {
                col.Item().PaddingTop(10).Text("No GPS data available for this incident window.")
                    .Italic().FontColor(Colors.Grey.Darken1);
                return;
            }
            
            // Map image or placeholder
            if (_mapImage != null && _mapImage.Length > 0)
            {
                col.Item().PaddingTop(10).AlignCenter().Image(_mapImage).FitWidth();
                col.Item().PaddingTop(4).AlignCenter().Text($"GPS route with {_report.Evidence.GpsTrail.Count} data points")
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
            }
            else
            {
                // Fallback placeholder if map fetch failed
                col.Item().PaddingTop(10).Height(120).Background(LightGray).AlignCenter().AlignMiddle()
                    .Column(inner =>
                    {
                        inner.Item().Text("📍 GPS Data Available").FontSize(10).FontColor(Colors.Grey.Darken1);
                        inner.Item().PaddingTop(5).Text($"{_report.Evidence.GpsTrail.Count} GPS points recorded")
                            .FontSize(9).FontColor(Colors.Grey.Medium);
                        inner.Item().PaddingTop(5).Text("View interactive map at share URL")
                            .FontSize(8).FontColor(AccentColor);
                    });
            }
            
            // GPS coordinates summary
            var first = _report.Evidence.GpsTrail.First();
            var last = _report.Evidence.GpsTrail.Last();
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Text($"Trail Start: {first.Latitude:F5}, {first.Longitude:F5} @ {first.Timestamp:HH:mm:ss}")
                    .FontSize(8);
                row.RelativeItem().Text($"Trail End: {last.Latitude:F5}, {last.Longitude:F5} @ {last.Timestamp:HH:mm:ss}")
                    .FontSize(8);
            });
        });
    }
    
    private void ComposeSpeedSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("SPEED & IMPACT ANALYSIS").Bold().FontSize(12).FontColor(PrimaryColor);
            
            // Main speed metrics
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => SpeedMetric(c, "Speed at Event", 
                    _report.Evidence.SpeedAtEventKmh?.ToString("F0") ?? "-", "km/h"));
                row.RelativeItem().Element(c => SpeedMetric(c, "Max Speed", 
                    _report.Evidence.MaxSpeedKmh?.ToString("F0") ?? "-", "km/h"));
                row.RelativeItem().Element(c => SpeedMetric(c, "Avg Speed", 
                    _report.Evidence.AvgSpeedKmh?.ToString("F0") ?? "-", "km/h"));
            });
            
            // G-Force / Impact metrics
            if (_report.Evidence.MaxGForce.HasValue || _report.Evidence.ImpactGForce.HasValue || 
                _report.Evidence.DecelerationMps2.HasValue)
            {
                col.Item().PaddingTop(10).Row(row =>
                {
                    row.RelativeItem().Element(c => SpeedMetric(c, "Impact G-Force", 
                        _report.Evidence.ImpactGForce?.ToString("F2") ?? "-", "G"));
                    row.RelativeItem().Element(c => SpeedMetric(c, "Max G-Force", 
                        _report.Evidence.MaxGForce?.ToString("F2") ?? "-", "G"));
                    row.RelativeItem().Element(c => SpeedMetric(c, "Deceleration", 
                        _report.Evidence.DecelerationMps2?.ToString("F1") ?? "-", "m/s²"));
                });
                
                // Impact direction if available
                if (!string.IsNullOrEmpty(_report.Evidence.ImpactDirection))
                {
                    col.Item().PaddingTop(8).Background(WarningColor).Padding(8).Row(row =>
                    {
                        row.AutoItem().Text("⚠️ Impact Direction: ").Bold().FontColor(Colors.White).FontSize(10);
                        row.AutoItem().Text(_report.Evidence.ImpactDirection).FontColor(Colors.White).FontSize(10);
                    });
                }
            }
            
            // Speed over time table
            if (_report.Evidence.GpsTrail.Count > 0)
            {
                col.Item().PaddingTop(12).Text("Speed Profile (sampled points)").FontSize(9).FontColor(Colors.Grey.Darken1);
                
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
    
    private void ComposeConditionsSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("CONDITIONS AT TIME OF INCIDENT").Bold().FontSize(12).FontColor(PrimaryColor);
            
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => ConditionItem(c, "Weather", 
                    _report.Evidence.WeatherCondition ?? "Unknown"));
                row.RelativeItem().Element(c => ConditionItem(c, "Temperature", 
                    _report.Evidence.TemperatureCelsius.HasValue 
                        ? $"{_report.Evidence.TemperatureCelsius:F0}°C" 
                        : "Unknown"));
                row.RelativeItem().Element(c => ConditionItem(c, "Road Condition", 
                    _report.Evidence.RoadCondition ?? "Unknown"));
                row.RelativeItem().Element(c => ConditionItem(c, "Lighting", 
                    _report.Evidence.LightCondition ?? "Unknown"));
            });
        });
    }
    
    private void ConditionItem(IContainer container, string label, string value)
    {
        container.Column(col =>
        {
            col.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken1);
            col.Item().Text(value).Bold().FontSize(11);
        });
    }
    
    private void ComposeDriverBehaviorSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("DRIVER BEHAVIOR BEFORE INCIDENT").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(4).Text("Hard driving events detected in the 30 minutes before the incident:")
                .FontSize(9).FontColor(Colors.Grey.Darken1);
            
            // Summary metrics
            col.Item().PaddingTop(10).Row(row =>
            {
                var hardBrakes = _report.Evidence.HardEventsBeforeIncident?.Count(e => e.EventType.Contains("Brak", StringComparison.OrdinalIgnoreCase)) ?? 0;
                var hardAccels = _report.Evidence.HardEventsBeforeIncident?.Count(e => e.EventType.Contains("Accel", StringComparison.OrdinalIgnoreCase)) ?? 0;
                var hardCorners = _report.Evidence.HardEventsBeforeIncident?.Count(e => e.EventType.Contains("Corner", StringComparison.OrdinalIgnoreCase) || e.EventType.Contains("Harsh", StringComparison.OrdinalIgnoreCase)) ?? 0;
                
                row.RelativeItem().Element(c => SpeedMetric(c, "Hard Brakes", hardBrakes.ToString(), "events"));
                row.RelativeItem().Element(c => SpeedMetric(c, "Hard Accels", hardAccels.ToString(), "events"));
                row.RelativeItem().Element(c => SpeedMetric(c, "Hard Corners", hardCorners.ToString(), "events"));
            });
            
            // Driver stats if available
            if (_report.Evidence.DriverSafetyScore.HasValue || _report.Evidence.DriverIncidentCountLast30Days.HasValue ||
                _report.Evidence.TimeDrivingBeforeIncident.HasValue)
            {
                col.Item().PaddingTop(10).Row(row =>
                {
                    if (_report.Evidence.DriverSafetyScore.HasValue)
                        row.RelativeItem().Element(c => SpeedMetric(c, "Driver Safety Score", 
                            _report.Evidence.DriverSafetyScore.Value.ToString("F0"), "/100"));
                    if (_report.Evidence.DriverIncidentCountLast30Days.HasValue)
                        row.RelativeItem().Element(c => SpeedMetric(c, "Incidents (30 days)", 
                            _report.Evidence.DriverIncidentCountLast30Days.Value.ToString(), "total"));
                    if (_report.Evidence.TimeDrivingBeforeIncident.HasValue)
                        row.RelativeItem().Element(c => SpeedMetric(c, "Time Driving", 
                            _report.Evidence.TimeDrivingBeforeIncident.Value.TotalMinutes.ToString("F0"), "min"));
                });
            }
            
            // Event list
            if (_report.Evidence.HardEventsBeforeIncident?.Count > 0)
            {
                col.Item().PaddingTop(10).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(2);
                        columns.RelativeColumn(3);
                        columns.RelativeColumn(1);
                    });
                    
                    table.Header(header =>
                    {
                        header.Cell().Background(LightGray).Padding(4).Text("Time").Bold().FontSize(8);
                        header.Cell().Background(LightGray).Padding(4).Text("Event Type").Bold().FontSize(8);
                        header.Cell().Background(LightGray).Padding(4).Text("G-Force").Bold().FontSize(8);
                    });
                    
                    foreach (var evt in _report.Evidence.HardEventsBeforeIncident.Take(10))
                    {
                        table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                            .Text(evt.Timestamp.ToString("HH:mm:ss")).FontSize(8);
                        table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                            .Text(evt.EventType).FontSize(8);
                        table.Cell().BorderBottom(1).BorderColor(BorderColor).Padding(3)
                            .Text(evt.GForce?.ToString("F2") ?? "-").FontSize(8);
                    }
                });
            }
        });
    }
    
    private void ComposeVehicleStatusSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("VEHICLE STATUS AT INCIDENT").Bold().FontSize(12).FontColor(PrimaryColor);
            
            // Safety systems row
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text("Seatbelt").FontSize(8).FontColor(Colors.Grey.Darken1);
                    c.Item().Text(_report.Evidence.SeatbeltFastened.HasValue 
                        ? (_report.Evidence.SeatbeltFastened.Value ? "✅ Fastened" : "❌ Not Fastened")
                        : "Unknown").Bold().FontSize(10);
                });
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text("Headlights").FontSize(8).FontColor(Colors.Grey.Darken1);
                    c.Item().Text(_report.Evidence.HeadlightsOn.HasValue 
                        ? (_report.Evidence.HeadlightsOn.Value ? "✅ On" : "Off")
                        : "Unknown").Bold().FontSize(10);
                });
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text("ABS Activated").FontSize(8).FontColor(Colors.Grey.Darken1);
                    c.Item().Text(_report.Evidence.AbsActivated.HasValue 
                        ? (_report.Evidence.AbsActivated.Value ? "⚠️ Yes" : "No")
                        : "Unknown").Bold().FontSize(10);
                });
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text("Stability Control").FontSize(8).FontColor(Colors.Grey.Darken1);
                    c.Item().Text(_report.Evidence.StabilityControlActivated.HasValue 
                        ? (_report.Evidence.StabilityControlActivated.Value ? "⚠️ Activated" : "Normal")
                        : "Unknown").Bold().FontSize(10);
                });
            });
            
            // Engine/Fuel row
            col.Item().PaddingTop(10).Row(row =>
            {
                if (_report.Evidence.EngineRpm.HasValue)
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text("Engine RPM").FontSize(8).FontColor(Colors.Grey.Darken1);
                        c.Item().Text($"{_report.Evidence.EngineRpm:N0}").Bold().FontSize(10);
                    });
                }
                if (_report.Evidence.FuelLevelPercent.HasValue)
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text("Fuel Level").FontSize(8).FontColor(Colors.Grey.Darken1);
                        c.Item().Text($"{_report.Evidence.FuelLevelPercent:F0}%").Bold().FontSize(10);
                    });
                }
                if (_report.Evidence.TractionControlActivated.HasValue)
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text("Traction Control").FontSize(8).FontColor(Colors.Grey.Darken1);
                        c.Item().Text(_report.Evidence.TractionControlActivated.Value ? "⚠️ Activated" : "Normal").Bold().FontSize(10);
                    });
                }
            });
        });
    }
    
    private void ComposeDiagnosticsSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("VEHICLE DIAGNOSTIC DATA").Bold().FontSize(12).FontColor(PrimaryColor);
            
            if (_report.Evidence.Diagnostics.Count == 0)
            {
                col.Item().PaddingTop(10).Text("No diagnostic codes recorded during incident window.")
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
                col.Item().PaddingTop(5).Text($"... and {_report.Evidence.Diagnostics.Count - 20} additional codes")
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
            }
        });
    }
    
    private void ComposeHosSection(IContainer container)
    {
        var hos = _report.Evidence.DriverHosStatus!;
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("DRIVER HOURS OF SERVICE (HOS)").Bold().FontSize(12).FontColor(PrimaryColor);
            
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => DetailColumn(c, new Dictionary<string, string?>
                {
                    ["HOS Status at Incident"] = hos.Status ?? "Unknown",
                    ["Drive Time Remaining"] = hos.DriveTimeRemaining?.ToString(@"h\:mm") ?? "-",
                    ["Duty Time Remaining"] = hos.DutyTimeRemaining?.ToString(@"h\:mm") ?? "-",
                }));
            });
        });
    }
    
    private void ComposeNotesSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("NOTES & DRIVER STATEMENT").Bold().FontSize(12).FontColor(PrimaryColor);
            
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
    
    private void ComposePhotosSection(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("PHOTO EVIDENCE").Bold().FontSize(12).FontColor(PrimaryColor);
            col.Item().PaddingTop(4).Text($"{_report.Evidence.Photos.Count} photo(s) attached to this report")
                .FontSize(9).FontColor(Colors.Grey.Darken1);
            
            // Group photos by category
            var photosByCategory = _report.Evidence.Photos
                .GroupBy(p => p.Category)
                .OrderBy(g => g.Key);
            
            foreach (var categoryGroup in photosByCategory)
            {
                col.Item().PaddingTop(10).Text(FormatPhotoCategory(categoryGroup.Key))
                    .Bold().FontSize(10).FontColor(AccentColor);
                
                // Create a grid of photos (3 per row)
                var photosInCategory = categoryGroup.ToList();
                for (int i = 0; i < photosInCategory.Count; i += 3)
                {
                    col.Item().PaddingTop(8).Row(row =>
                    {
                        for (int j = i; j < Math.Min(i + 3, photosInCategory.Count); j++)
                        {
                            var photo = photosInCategory[j];
                            row.RelativeItem().Padding(4).Element(c => ComposePhotoThumbnail(c, photo));
                        }
                        // Fill empty slots
                        for (int k = photosInCategory.Count; k < i + 3; k++)
                        {
                            row.RelativeItem();
                        }
                    });
                }
            }
        });
    }
    
    private void ComposePhotoThumbnail(IContainer container, PhotoAttachment photo)
    {
        container.Border(1).BorderColor(BorderColor).Column(col =>
        {
            // Photo image (if we have the data)
            if (_photoData.TryGetValue(photo.MediaFileId, out var imageBytes) && imageBytes.Length > 0)
            {
                col.Item().Height(120).Image(imageBytes).FitArea();
            }
            else if (_photoData.TryGetValue(photo.ThumbnailMediaFileId ?? "", out var thumbBytes) && thumbBytes.Length > 0)
            {
                col.Item().Height(120).Image(thumbBytes).FitArea();
            }
            else
            {
                // Placeholder if no image data available
                col.Item().Height(120).Background(LightGray).AlignCenter().AlignMiddle()
                    .Text("📷").FontSize(32).FontColor(Colors.Grey.Medium);
            }
            
            // Caption
            col.Item().Background(LightGray).Padding(4).Column(meta =>
            {
                meta.Item().Text(photo.FileName).FontSize(7).FontColor(Colors.Grey.Darken1);
                if (!string.IsNullOrEmpty(photo.Caption))
                {
                    meta.Item().Text(photo.Caption).FontSize(8);
                }
                meta.Item().Text(photo.UploadedAt.ToString("MMM dd, HH:mm"))
                    .FontSize(6).FontColor(Colors.Grey.Medium);
            });
        });
    }
    
    private static string FormatPhotoCategory(PhotoCategory category) => category switch
    {
        PhotoCategory.VehicleDamage => "Vehicle Damage Photos",
        PhotoCategory.SceneOverview => "Scene Overview",
        PhotoCategory.OtherVehicle => "Other Vehicle(s)",
        PhotoCategory.RoadCondition => "Road Conditions",
        PhotoCategory.WeatherCondition => "Weather Conditions",
        PhotoCategory.DriverInjury => "Injury Documentation",
        PhotoCategory.WitnessInfo => "Witness Information",
        PhotoCategory.PoliceReport => "Police Report",
        PhotoCategory.InsuranceDocument => "Insurance Documents",
        _ => "General Photos"
    };
    
    private void ComposeEvidenceSummary(IContainer container)
    {
        container.Element(SectionBox).Column(col =>
        {
            col.Item().Text("EVIDENCE SUMMARY").Bold().FontSize(12).FontColor(PrimaryColor);
            
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Element(c => SummaryItem(c, "GPS Data Points", 
                    _report.Evidence.GpsTrail.Count.ToString()));
                row.RelativeItem().Element(c => SummaryItem(c, "Diagnostic Codes", 
                    _report.Evidence.Diagnostics.Count.ToString()));
                row.RelativeItem().Element(c => SummaryItem(c, "Witnesses", 
                    _report.Witnesses.Count.ToString()));
                row.RelativeItem().Element(c => SummaryItem(c, "Photos", 
                    (_report.Evidence.Photos?.Count ?? 0).ToString()));
            });
            
            col.Item().PaddingTop(10).Text("Data Source: Geotab GO Device Telematics")
                .FontSize(8).FontColor(Colors.Grey.Darken1);
        });
    }
    
    private void SummaryItem(IContainer container, string label, string value)
    {
        container.Column(col =>
        {
            col.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken1);
            col.Item().Text(value).Bold().FontSize(14);
        });
    }
    
    private void ComposeCertificationBlock(IContainer container)
    {
        container.Background("#f0f4f8").Border(1).BorderColor(BorderColor).Padding(12).Column(col =>
        {
            col.Item().Text("CERTIFICATION").Bold().FontSize(10).FontColor(PrimaryColor);
            col.Item().PaddingTop(6).Text(
                "This report was automatically generated from telematics data recorded by the vehicle's " +
                "Geotab GO device. The GPS trail, speed data, and diagnostic information represent an " +
                "unaltered record of the vehicle's operation during the incident window. This data is " +
                "provided for insurance claim purposes and may be used as supporting documentation.")
                .FontSize(8).LineHeight(1.4f);
            
            col.Item().PaddingTop(10).Row(row =>
            {
                row.RelativeItem().Column(sig =>
                {
                    sig.Item().Text("Fleet Manager Signature:").FontSize(8);
                    sig.Item().PaddingTop(20).BorderBottom(1).BorderColor(Colors.Black);
                });
                row.ConstantItem(20);
                row.RelativeItem().Column(date =>
                {
                    date.Item().Text("Date:").FontSize(8);
                    date.Item().PaddingTop(20).BorderBottom(1).BorderColor(Colors.Black);
                });
            });
        });
    }
    
    private void ComposeFooter(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().BorderTop(1).BorderColor(BorderColor).PaddingTop(5).Row(row =>
            {
                row.RelativeItem().Text($"{_options.CompanyName} - Vehicle Incident Report")
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
                col.Item().PaddingTop(3).Text($"View online with interactive map: {_report.ShareUrl}")
                    .FontSize(7).FontColor(AccentColor);
            }
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
                    row.ConstantItem(110).Text(label + ":").FontColor(Colors.Grey.Darken1).FontSize(9);
                    row.RelativeItem().Text(value ?? "-").FontSize(9);
                });
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
    
}
