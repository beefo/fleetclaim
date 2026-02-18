using FleetClaim.Core.Geotab;
using FleetClaim.Admin;
using Microsoft.AspNetCore.Authentication;

var builder = WebApplication.CreateBuilder(args);

// Configuration
var projectId = builder.Configuration["GCP_PROJECT_ID"] 
    ?? Environment.GetEnvironmentVariable("GCP_PROJECT_ID")
    ?? "fleetclaim";

var adminKey = builder.Configuration["ADMIN_API_KEY"]
    ?? Environment.GetEnvironmentVariable("ADMIN_API_KEY")
    ?? throw new InvalidOperationException("ADMIN_API_KEY is required");

// Services
builder.Services.AddSingleton<ICredentialStore>(new GcpCredentialStore(projectId));
builder.Services.AddSingleton<IGeotabClientFactory, GeotabClientFactory>();
builder.Services.AddSingleton<AdminService>();
builder.Services.AddSingleton(new AdminConfig { ProjectId = projectId, AdminApiKey = adminKey });
builder.Services.AddHttpClient();

// Auth
builder.Services.AddAuthentication("ApiKey")
    .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthHandler>("ApiKey", null);
builder.Services.AddAuthorization();

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Security headers
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});

// Serve static files (Admin UI)
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseSwagger();
app.UseSwaggerUI();
app.UseAuthentication();
app.UseAuthorization();

// Health check (no auth)
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Admin endpoints (require auth)
var admin = app.MapGroup("/admin").RequireAuthorization();

admin.MapGet("/overview", async (AdminService svc) => 
    await svc.GetOverviewAsync());

admin.MapGet("/databases", async (AdminService svc) => 
    await svc.GetDatabasesAsync());

admin.MapGet("/databases/{database}/requests", async (string database, AdminService svc) => 
    await svc.GetRequestsAsync(database));

admin.MapGet("/databases/{database}/reports", async (string database, AdminService svc) => 
    await svc.GetReportsAsync(database));

admin.MapGet("/jobs", async (AdminService svc, int limit = 20) => 
    await svc.GetRecentJobsAsync(limit));

admin.MapGet("/logs", async (AdminService svc, int limit = 100) => 
    await svc.GetRecentLogsAsync(limit));

// Database onboarding
admin.MapPost("/databases", async (OnboardDatabaseRequest request, AdminService svc) =>
{
    if (string.IsNullOrWhiteSpace(request.Database))
        return Results.BadRequest(new { error = "Database name is required" });
    if (string.IsNullOrWhiteSpace(request.Username))
        return Results.BadRequest(new { error = "Username is required" });
    if (string.IsNullOrWhiteSpace(request.Password))
        return Results.BadRequest(new { error = "Password is required" });
    
    try
    {
        var result = await svc.OnboardDatabaseAsync(
            request.Database, 
            request.Username, 
            request.Password,
            request.Server ?? "my.geotab.com");
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

admin.MapDelete("/databases/{database}", async (string database, AdminService svc) =>
{
    try
    {
        await svc.RemoveDatabaseAsync(database);
        return Results.Ok(new { success = true, message = $"Database {database} removed" });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

app.Run();

public record OnboardDatabaseRequest(
    string Database, 
    string Username, 
    string Password, 
    string? Server = "my.geotab.com");
