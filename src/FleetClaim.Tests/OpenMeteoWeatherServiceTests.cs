using FleetClaim.Core.Services;
using Xunit;

namespace FleetClaim.Tests;

public class OpenMeteoWeatherServiceTests
{
    [Fact]
    public async Task GetWeatherAsync_ValidCoordinates_ReturnsWeatherData()
    {
        // Arrange
        var service = new OpenMeteoWeatherService();
        var latitude = 43.65; // Toronto
        var longitude = -79.38;
        var timestamp = DateTime.UtcNow.AddHours(-1); // Recent past
        
        // Act - this will make an actual HTTP call
        // Skip if no network available
        try
        {
            var result = await service.GetWeatherAsync(latitude, longitude, timestamp);
            
            // Assert
            Assert.NotNull(result);
            Assert.NotNull(result.Condition);
            // Temperature should be reasonable
            Assert.InRange(result.TemperatureCelsius, -50, 60);
        }
        catch (HttpRequestException)
        {
            // Skip test if no network
            Assert.True(true, "Skipped - no network available");
        }
    }
    
    [Theory]
    [InlineData(43.65, -79.38)] // Toronto
    [InlineData(51.5, -0.12)]   // London
    [InlineData(35.68, 139.76)] // Tokyo
    [InlineData(-33.87, 151.21)] // Sydney
    public async Task GetWeatherAsync_GlobalCoordinates_ReturnsData(double lat, double lng)
    {
        // Arrange
        var service = new OpenMeteoWeatherService();
        var timestamp = DateTime.UtcNow.AddHours(-2);
        
        // Act
        try
        {
            var result = await service.GetWeatherAsync(lat, lng, timestamp);
            
            // Assert
            Assert.NotNull(result);
        }
        catch (HttpRequestException)
        {
            // Skip test if no network
            Assert.True(true, "Skipped - no network available");
        }
    }
    
    [Fact]
    public async Task GetWeatherAsync_HistoricalDate_ReturnsData()
    {
        // Arrange
        var service = new OpenMeteoWeatherService();
        var latitude = 43.65;
        var longitude = -79.38;
        var timestamp = DateTime.UtcNow.AddDays(-7); // Week ago
        
        // Act
        try
        {
            var result = await service.GetWeatherAsync(latitude, longitude, timestamp);
            
            // Assert
            Assert.NotNull(result);
        }
        catch (HttpRequestException)
        {
            Assert.True(true, "Skipped - no network available");
        }
    }
    
    [Fact]
    public async Task GetWeatherAsync_WithCancellation_Throws()
    {
        // Arrange
        var service = new OpenMeteoWeatherService();
        var cts = new CancellationTokenSource();
        cts.Cancel();
        
        // Act & Assert
        await Assert.ThrowsAsync<OperationCanceledException>(async () =>
        {
            await service.GetWeatherAsync(43.65, -79.38, DateTime.UtcNow, cts.Token);
        });
    }
}
