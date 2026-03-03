namespace FleetClaim.Core.Models;

/// <summary>
/// Persisted state for the IncidentPollerWorker, stored in Geotab AddInData.
/// Tracks the GetFeed version so incremental polling survives Cloud Run Job restarts.
/// </summary>
public class WorkerState
{
    public long FeedVersion { get; set; }
    public DateTime? LastPolledAt { get; set; }
}
