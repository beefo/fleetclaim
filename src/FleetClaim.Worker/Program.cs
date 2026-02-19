using FleetClaim.Core.Geotab;
using FleetClaim.Core.Services;
using FleetClaim.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(args);

// Configuration
var projectId = builder.Configuration["GCP_PROJECT_ID"] 
    ?? Environment.GetEnvironmentVariable("GCP_PROJECT_ID")
    ?? throw new InvalidOperationException("GCP_PROJECT_ID is required");

// PDF options
var pdfOptions = new PdfOptions
{
    CompanyName = builder.Configuration["PDF_COMPANY_NAME"] ?? "FleetClaim",
    GoogleMapsApiKey = builder.Configuration["GOOGLE_MAPS_API_KEY"]
};

// Share link options
var shareLinkOptions = new ShareLinkOptions
{
    BaseUrl = builder.Configuration["SHARE_LINK_BASE_URL"] ?? "https://fleetclaim.app",
    SigningKey = builder.Configuration["SHARE_LINK_SIGNING_KEY"] 
        ?? Environment.GetEnvironmentVariable("SHARE_LINK_SIGNING_KEY")
        ?? throw new InvalidOperationException("SHARE_LINK_SIGNING_KEY is required")
};

// Notification options
var notificationOptions = new NotificationOptions
{
    UseSendGrid = bool.TryParse(builder.Configuration["USE_SENDGRID"], out var useSg) && useSg,
    SendGridApiKey = builder.Configuration["SENDGRID_API_KEY"],
    SmtpHost = builder.Configuration["SMTP_HOST"],
    SmtpPort = int.TryParse(builder.Configuration["SMTP_PORT"], out var port) ? port : 587,
    SmtpUseSsl = !bool.TryParse(builder.Configuration["SMTP_USE_SSL"], out var ssl) || ssl,
    SmtpUsername = builder.Configuration["SMTP_USERNAME"],
    SmtpPassword = builder.Configuration["SMTP_PASSWORD"],
    FromEmail = builder.Configuration["FROM_EMAIL"] ?? "noreply@fleetclaim.app",
    FromName = builder.Configuration["FROM_NAME"] ?? "FleetClaim"
};

// Register services
builder.Services.AddSingleton<ICredentialStore>(new GcpCredentialStore(projectId));
builder.Services.AddSingleton<IGeotabClientFactory, GeotabClientFactory>();
builder.Services.AddSingleton<IAddInDataRepository, AddInDataRepository>();
builder.Services.AddHttpClient<IWeatherService, OpenMeteoWeatherService>();
builder.Services.AddSingleton<IIncidentCollector, IncidentCollector>();
builder.Services.AddSingleton<IPdfRenderer>(new QuestPdfRenderer(pdfOptions));
builder.Services.AddSingleton<IShareLinkService>(new ShareLinkService(shareLinkOptions));
builder.Services.AddSingleton<IMediaFileService>(sp => 
    new MediaFileService(sp.GetService<IHttpClientFactory>()?.CreateClient()));
builder.Services.AddSingleton<INotificationService>(sp => 
    new NotificationService(notificationOptions, sp.GetService<IHttpClientFactory>()?.CreateClient()));
builder.Services.AddSingleton<IReportGenerator>(sp =>
    new ReportGenerator(
        sp.GetRequiredService<IIncidentCollector>(),
        sp.GetRequiredService<IPdfRenderer>(),
        sp.GetRequiredService<IShareLinkService>(),
        sp.GetRequiredService<IMediaFileService>()
    ));
builder.Services.AddHttpClient();

// Worker
builder.Services.AddHostedService<IncidentPollerWorker>();

var host = builder.Build();
await host.RunAsync();
