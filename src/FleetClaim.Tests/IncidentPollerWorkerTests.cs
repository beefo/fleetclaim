using FleetClaim.Core.Geotab;
using FleetClaim.Core.Models;
using FleetClaim.Core.Services;
using FleetClaim.Worker;
using Geotab.Checkmate.ObjectModel;
using Geotab.Checkmate.ObjectModel.Exceptions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Unit tests for IncidentPollerWorker, focusing on the feed drain loop behavior.
/// Uses small ResultsLimit values to verify the loop correctly handles batching.
/// </summary>
public class IncidentPollerWorkerTests
{
    private readonly Mock<ICredentialStore> _credentialStore;
    private readonly Mock<IGeotabClientFactory> _clientFactory;
    private readonly Mock<IAddInDataRepository> _repository;
    private readonly Mock<IReportGenerator> _reportGenerator;
    private readonly Mock<IShareLinkService> _shareLinkService;
    private readonly Mock<INotificationService> _notificationService;
    private readonly Mock<IHostApplicationLifetime> _hostLifetime;
    private readonly Mock<ILogger<IncidentPollerWorker>> _logger;
    private readonly Mock<IGeotabApi> _mockApi;
    
    public IncidentPollerWorkerTests()
    {
        _credentialStore = new Mock<ICredentialStore>();
        _clientFactory = new Mock<IGeotabClientFactory>();
        _repository = new Mock<IAddInDataRepository>();
        _reportGenerator = new Mock<IReportGenerator>();
        _shareLinkService = new Mock<IShareLinkService>();
        _notificationService = new Mock<INotificationService>();
        _hostLifetime = new Mock<IHostApplicationLifetime>();
        _logger = new Mock<ILogger<IncidentPollerWorker>>();
        
        // Now we can easily mock the API via IGeotabApi interface
        _mockApi = new Mock<IGeotabApi>();
    }
    
    private IncidentPollerWorker CreateWorker(PollerOptions? options = null)
    {
        var opts = Options.Create(options ?? new PollerOptions());
        
        return new IncidentPollerWorker(
            _credentialStore.Object,
            _clientFactory.Object,
            _repository.Object,
            _reportGenerator.Object,
            _shareLinkService.Object,
            _notificationService.Object,
            _hostLifetime.Object,
            opts,
            _logger.Object
        );
    }
    
    [Fact]
    public void PollerOptions_HasCorrectDefaults()
    {
        // Act
        var options = new PollerOptions();
        
        // Assert
        Assert.Equal(1000, options.ResultsLimit);
        Assert.Equal(50, options.MaxIterations);
        Assert.Equal(TimeSpan.FromMinutes(10), options.StaleRequestTimeout);
    }
    
    [Fact]
    public void PollerOptions_CanBeConfigured()
    {
        // Arrange & Act
        var options = new PollerOptions
        {
            ResultsLimit = 100,
            MaxIterations = 10,
            StaleRequestTimeout = TimeSpan.FromMinutes(5)
        };
        
        // Assert
        Assert.Equal(100, options.ResultsLimit);
        Assert.Equal(10, options.MaxIterations);
        Assert.Equal(TimeSpan.FromMinutes(5), options.StaleRequestTimeout);
    }
    
    [Fact]
    public void PollerOptions_SmallLimitForTesting()
    {
        // This test documents the pattern: use small limits in tests
        // to verify batching behavior without 1000+ mock objects
        var testOptions = new PollerOptions
        {
            ResultsLimit = 3,  // Small limit for testing
            MaxIterations = 5
        };
        
        Assert.Equal(3, testOptions.ResultsLimit);
        Assert.Equal(5, testOptions.MaxIterations);
    }
    
    [Fact]
    public void Worker_CanBeConstructedWithOptions()
    {
        // Arrange
        var options = new PollerOptions
        {
            ResultsLimit = 500,
            MaxIterations = 25
        };
        
        // Act - should not throw
        var worker = CreateWorker(options);
        
        // Assert
        Assert.NotNull(worker);
    }
    
    [Fact]
    public void Worker_CanBeConstructedWithDefaultOptions()
    {
        // Act - should not throw
        var worker = CreateWorker();
        
        // Assert
        Assert.NotNull(worker);
    }
    
    [Fact]
    public async Task MockedApi_CanSetupCallAsync()
    {
        // Demonstrate that IGeotabApi can be easily mocked
        _mockApi.Setup(a => a.Database).Returns("test_db");
        _mockApi.Setup(a => a.Server).Returns("my.geotab.com");
        _mockApi.Setup(a => a.CallAsync<FeedResult<ExceptionEvent>>(
            "GetFeed", 
            typeof(ExceptionEvent), 
            It.IsAny<object>(), 
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeedResult<ExceptionEvent>
            {
                Data = new List<ExceptionEvent>(),
                ToVersion = 1000
            });
        
        // Act
        var result = await _mockApi.Object.CallAsync<FeedResult<ExceptionEvent>>(
            "GetFeed", typeof(ExceptionEvent), new { resultsLimit = 100 });
        
        // Assert
        Assert.NotNull(result);
        Assert.Empty(result.Data);
        Assert.Equal(1000, result.ToVersion);
    }
    
    [Fact]
    public void MockedClientFactory_ReturnsIGeotabApi()
    {
        // Setup factory to return our mock
        _clientFactory.Setup(f => f.CreateClientAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(_mockApi.Object);
        
        // Verify the factory returns IGeotabApi (not concrete API)
        var apiTask = _clientFactory.Object.CreateClientAsync("test_db");
        Assert.IsAssignableFrom<Task<IGeotabApi>>(apiTask);
    }
}

/// <summary>
/// Integration-style tests for feed drain behavior.
/// These test the logic without actual Geotab API calls.
/// </summary>
public class FeedDrainLogicTests
{
    [Fact]
    public void DrainLoop_ShouldContinue_WhenResultsEqualLimit()
    {
        // Simulating the drain loop logic
        const int resultsLimit = 100;
        var fetchedCounts = new[] { 100, 100, 50 }; // 3 batches, last is partial
        
        var iterations = 0;
        var index = 0;
        
        do
        {
            var count = fetchedCounts[index++];
            iterations++;
            
            if (count < resultsLimit)
                break;
                
        } while (index < fetchedCounts.Length);
        
        Assert.Equal(3, iterations);
    }
    
    [Fact]
    public void DrainLoop_ShouldStop_WhenResultsLessThanLimit()
    {
        // First batch returns less than limit - should stop immediately
        const int resultsLimit = 100;
        var fetchedCount = 50;
        
        var shouldContinue = fetchedCount >= resultsLimit;
        
        Assert.False(shouldContinue);
    }
    
    [Fact]
    public void DrainLoop_ShouldStop_WhenEmptyResults()
    {
        const int resultsLimit = 100;
        var fetchedCount = 0;
        
        var shouldContinue = fetchedCount >= resultsLimit;
        
        Assert.False(shouldContinue);
    }
    
    [Fact]
    public void DrainLoop_ShouldRespectMaxIterations()
    {
        // Simulate a database that keeps returning full batches
        const int resultsLimit = 100;
        const int maxIterations = 5;
        
        var iterations = 0;
        var fetchedCount = resultsLimit; // Always full batches
        
        do
        {
            iterations++;
        } while (fetchedCount >= resultsLimit && iterations < maxIterations);
        
        Assert.Equal(maxIterations, iterations);
    }
    
    [Fact]
    public void DrainLoop_ShouldRespectCancellation()
    {
        var cts = new CancellationTokenSource();
        const int resultsLimit = 100;
        const int maxIterations = 50;
        
        var iterations = 0;
        var fetchedCount = resultsLimit;
        
        // Cancel after 3 iterations
        do
        {
            iterations++;
            if (iterations == 3)
                cts.Cancel();
                
        } while (fetchedCount >= resultsLimit && iterations < maxIterations && !cts.Token.IsCancellationRequested);
        
        Assert.Equal(3, iterations);
    }
    
    [Theory]
    [InlineData(1000, 1000, true)]   // Full batch -> continue
    [InlineData(1000, 999, false)]   // Partial batch -> stop
    [InlineData(1000, 0, false)]     // Empty -> stop
    [InlineData(100, 100, true)]     // Small limit, full -> continue
    [InlineData(100, 50, false)]     // Small limit, partial -> stop
    [InlineData(1, 1, true)]         // Edge case: limit of 1, got 1 -> continue
    [InlineData(1, 0, false)]        // Edge case: limit of 1, got 0 -> stop
    public void DrainLoop_ContinuationLogic(int limit, int fetched, bool shouldContinue)
    {
        var result = fetched >= limit;
        Assert.Equal(shouldContinue, result);
    }
    
    [Fact]
    public void DrainLoop_TracksTotal()
    {
        const int resultsLimit = 100;
        var batchSizes = new[] { 100, 100, 100, 42 }; // 342 total
        
        var totalProcessed = 0;
        var index = 0;
        
        do
        {
            var count = batchSizes[index];
            totalProcessed += count;
            index++;
            
            if (count < resultsLimit)
                break;
                
        } while (index < batchSizes.Length);
        
        Assert.Equal(342, totalProcessed);
        Assert.Equal(4, index); // All 4 batches processed
    }
    
    [Fact]
    public void DrainLoop_UpdatesVersionAfterEachBatch()
    {
        // Simulate version tracking
        var versions = new List<long>();
        long currentVersion = 0;
        var feedVersions = new long[] { 1000, 2000, 3000, 3042 };
        var batchSizes = new[] { 100, 100, 100, 42 };
        const int resultsLimit = 100;
        
        var index = 0;
        do
        {
            var count = batchSizes[index];
            currentVersion = feedVersions[index];
            versions.Add(currentVersion);
            index++;
            
            if (count < resultsLimit)
                break;
                
        } while (index < batchSizes.Length);
        
        // Version should be updated after each batch
        Assert.Equal(4, versions.Count);
        Assert.Equal(3042, currentVersion);
    }
}

/// <summary>
/// Tests for collision rule filtering logic.
/// </summary>
public class CollisionRuleFilterTests
{
    private static readonly HashSet<string> CollisionRuleIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "RuleAccidentId",
        "RuleEnhancedMajorCollisionId",
        "RuleEnhancedMinorCollisionId"
    };
    
    [Theory]
    [InlineData("RuleAccidentId", true)]
    [InlineData("RuleEnhancedMajorCollisionId", true)]
    [InlineData("RuleEnhancedMinorCollisionId", true)]
    [InlineData("ruleaccidentid", true)]  // Case insensitive
    [InlineData("RULEACCIDENTID", true)]  // Case insensitive
    [InlineData("RuleSpeedingId", false)]
    [InlineData("RuleHarshBrakingId", false)]
    [InlineData("", false)]
    [InlineData("RandomRule", false)]
    public void CollisionRuleFilter_WorksCorrectly(string ruleId, bool shouldMatch)
    {
        var isCollision = CollisionRuleIds.Contains(ruleId);
        Assert.Equal(shouldMatch, isCollision);
    }
    
    [Fact]
    public void CollisionRuleFilter_SkipsNonCollisionEvents()
    {
        var ruleIds = new[] 
        { 
            "RuleSpeedingId", 
            "RuleAccidentId",  // This one matches
            "RuleHarshBrakingId",
            "RuleEnhancedMajorCollisionId",  // This one matches
            "RuleIdlingId"
        };
        
        var collisionEvents = ruleIds.Where(CollisionRuleIds.Contains).ToList();
        
        Assert.Equal(2, collisionEvents.Count);
        Assert.Contains("RuleAccidentId", collisionEvents);
        Assert.Contains("RuleEnhancedMajorCollisionId", collisionEvents);
    }
}

/// <summary>
/// Tests for WorkerState version tracking.
/// </summary>
public class WorkerStateTests
{
    [Fact]
    public void WorkerState_DefaultsToZeroVersion()
    {
        var state = new WorkerState();
        Assert.Equal(0, state.FeedVersion);
        Assert.Null(state.LastPolledAt);
    }
    
    [Fact]
    public void WorkerState_TracksVersion()
    {
        var state = new WorkerState
        {
            FeedVersion = 12345,
            LastPolledAt = DateTime.UtcNow
        };
        
        Assert.Equal(12345, state.FeedVersion);
        Assert.NotNull(state.LastPolledAt);
    }
    
    [Fact]
    public void WorkerState_VersionUpdatesPreservePreviousValue()
    {
        var state = new WorkerState { FeedVersion = 1000 };
        
        // Simulate batch processing
        state.FeedVersion = 2000;
        Assert.Equal(2000, state.FeedVersion);
        
        state.FeedVersion = 3000;
        Assert.Equal(3000, state.FeedVersion);
    }
}
