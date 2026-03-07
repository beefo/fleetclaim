namespace FleetClaim.Core.Models;

/// <summary>
/// Configuration options for the incident poller worker.
/// Extracted to enable unit testing with different limits.
/// </summary>
public class PollerOptions
{
    /// <summary>
    /// Maximum number of exception events to fetch per GetFeed call.
    /// Default: 1000 (Geotab API maximum).
    /// </summary>
    public int ResultsLimit { get; set; } = 1000;
    
    /// <summary>
    /// Maximum number of GetFeed iterations per database before stopping.
    /// Prevents runaway loops if something goes wrong.
    /// Default: 50 (50 * 1000 = 50,000 events max per poll cycle).
    /// </summary>
    public int MaxIterations { get; set; } = 50;
    
    /// <summary>
    /// Timeout for stale report requests (stuck in Processing status).
    /// Default: 10 minutes.
    /// </summary>
    public TimeSpan StaleRequestTimeout { get; set; } = TimeSpan.FromMinutes(10);
}
