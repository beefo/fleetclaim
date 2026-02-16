using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace FleetClaim.Core.Services;

/// <summary>
/// Weather service using Open-Meteo (free, no API key required).
/// </summary>
public class OpenMeteoWeatherService : IWeatherService
{
    private readonly HttpClient _http;
    
    public OpenMeteoWeatherService(HttpClient? http = null)
    {
        _http = http ?? new HttpClient();
    }
    
    public async Task<WeatherInfo?> GetWeatherAsync(double lat, double lon, DateTime time, CancellationToken ct = default)
    {
        try
        {
            // Use historical API for past dates, forecast for recent/future
            var isHistorical = time < DateTime.UtcNow.AddDays(-5);
            var dateStr = time.ToString("yyyy-MM-dd");
            
            string url;
            if (isHistorical)
            {
                url = $"https://archive-api.open-meteo.com/v1/archive?" +
                      $"latitude={lat}&longitude={lon}" +
                      $"&start_date={dateStr}&end_date={dateStr}" +
                      $"&hourly=temperature_2m,weathercode";
            }
            else
            {
                url = $"https://api.open-meteo.com/v1/forecast?" +
                      $"latitude={lat}&longitude={lon}" +
                      $"&hourly=temperature_2m,weathercode" +
                      $"&past_days=7";
            }
            
            var response = await _http.GetFromJsonAsync<OpenMeteoResponse>(url, ct);
            if (response?.Hourly == null)
                return null;
            
            // Find closest hour
            var targetHour = time.Hour;
            var hourIndex = Math.Min(targetHour, response.Hourly.Time.Count - 1);
            
            return new WeatherInfo
            {
                TemperatureCelsius = response.Hourly.Temperature2m.ElementAtOrDefault(hourIndex),
                Condition = MapWeatherCode(response.Hourly.Weathercode.ElementAtOrDefault(hourIndex))
            };
        }
        catch
        {
            return null;
        }
    }
    
    private static string MapWeatherCode(int code) => code switch
    {
        0 => "Clear",
        1 or 2 or 3 => "Partly Cloudy",
        45 or 48 => "Fog",
        51 or 53 or 55 => "Drizzle",
        61 or 63 or 65 => "Rain",
        66 or 67 => "Freezing Rain",
        71 or 73 or 75 => "Snow",
        77 => "Snow Grains",
        80 or 81 or 82 => "Rain Showers",
        85 or 86 => "Snow Showers",
        95 => "Thunderstorm",
        96 or 99 => "Thunderstorm with Hail",
        _ => "Unknown"
    };
    
    private class OpenMeteoResponse
    {
        [JsonPropertyName("hourly")]
        public HourlyData? Hourly { get; set; }
    }
    
    private class HourlyData
    {
        [JsonPropertyName("time")]
        public List<string> Time { get; set; } = [];
        
        [JsonPropertyName("temperature_2m")]
        public List<double> Temperature2m { get; set; } = [];
        
        [JsonPropertyName("weathercode")]
        public List<int> Weathercode { get; set; } = [];
    }
}
