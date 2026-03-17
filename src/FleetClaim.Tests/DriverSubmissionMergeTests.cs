using FleetClaim.Core.Models;
using FleetClaim.Worker;
using Xunit;

namespace FleetClaim.Tests;

/// <summary>
/// Unit tests for the driver submission merge logic in IncidentPollerWorker.
/// Tests the static MergeSubmissionIntoReport method.
/// </summary>
public class DriverSubmissionMergeTests
{
    private static IncidentReport CreateTestReport(string id = "rpt_001", string vehicleId = "b1")
    {
        return new IncidentReport
        {
            Id = id,
            VehicleId = vehicleId,
            VehicleName = "Vehicle 001",
            OccurredAt = DateTime.UtcNow.AddMinutes(-10),
            Severity = IncidentSeverity.Medium,
            Summary = "Auto-detected collision",
            Evidence = new EvidencePackage()
        };
    }

    private static DriverSubmission CreateTestSubmission(string id = "sub_001", string deviceId = "b1")
    {
        return new DriverSubmission
        {
            Id = id,
            DeviceId = deviceId,
            DeviceName = "Vehicle 001",
            DriverId = "drv_1",
            DriverName = "John Driver",
            IncidentTimestamp = DateTime.UtcNow.AddMinutes(-8),
            Description = "Hit a pole turning right",
            Notes = "Low speed impact, no injuries",
            Severity = IncidentSeverity.Low,
            DamageLevel = DamageSeverity.Moderate,
            DamageDescription = "Front bumper cracked",
            VehicleDriveable = true,
            PoliceReportNumber = "PR-12345",
            PoliceAgency = "Local PD",
            InjuriesReported = false,
            CreatedAt = DateTime.UtcNow,
            Photos = []
        };
    }

    [Fact]
    public void Merge_SetsProvenanceFields()
    {
        var report = CreateTestReport();
        var submission = CreateTestSubmission();

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal(submission.Id, report.MergedFromSubmissionId);
        Assert.NotNull(report.MergedAt);
    }

    [Fact]
    public void Merge_FillsEmptyDriverInfo()
    {
        var report = CreateTestReport();
        report.DriverId = null;
        report.DriverName = null;
        var submission = CreateTestSubmission();

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal("drv_1", report.DriverId);
        Assert.Equal("John Driver", report.DriverName);
    }

    [Fact]
    public void Merge_DoesNotOverwriteExistingDriverInfo()
    {
        var report = CreateTestReport();
        report.DriverId = "existing_driver";
        report.DriverName = "Existing Name";
        var submission = CreateTestSubmission();

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal("existing_driver", report.DriverId);
        Assert.Equal("Existing Name", report.DriverName);
    }

    [Fact]
    public void Merge_FillsDamageInfo()
    {
        var report = CreateTestReport();
        var submission = CreateTestSubmission();

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal(DamageSeverity.Moderate, report.DamageLevel);
        Assert.Equal("Front bumper cracked", report.DamageDescription);
        Assert.True(report.VehicleDriveable);
    }

    [Fact]
    public void Merge_FillsPoliceInfo()
    {
        var report = CreateTestReport();
        var submission = CreateTestSubmission();

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal("PR-12345", report.PoliceReportNumber);
        Assert.Equal("Local PD", report.PoliceAgency);
    }

    [Fact]
    public void Merge_AppendsNotes()
    {
        var report = CreateTestReport();
        report.Notes = "Existing fleet manager notes";
        var submission = CreateTestSubmission();

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Contains("Existing fleet manager notes", report.Notes);
        Assert.Contains("[Driver submission] Low speed impact, no injuries", report.Notes);
        Assert.Contains("[Driver statement] Hit a pole turning right", report.Notes);
    }

    [Fact]
    public void Merge_AppendsNotesWhenReportHasNone()
    {
        var report = CreateTestReport();
        report.Notes = null;
        var submission = CreateTestSubmission();

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Contains("[Driver submission]", report.Notes);
    }

    [Fact]
    public void Merge_AppendsThirdPartyFromInlineFields()
    {
        var report = CreateTestReport();
        var submission = CreateTestSubmission();
        submission.OtherDriverName = "Jane Other";
        submission.OtherDriverPhone = "555-0123";
        submission.OtherVehicleMake = "Toyota";
        submission.OtherVehiclePlate = "ABC 123";

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Single(report.ThirdParties);
        Assert.Equal("Jane Other", report.ThirdParties[0].DriverName);
        Assert.Equal("555-0123", report.ThirdParties[0].DriverPhone);
        Assert.Equal("Toyota", report.ThirdParties[0].VehicleMake);
        Assert.Equal("ABC 123", report.ThirdParties[0].VehiclePlate);
    }

    [Fact]
    public void Merge_AppendsPhotos()
    {
        var report = CreateTestReport();
        var submission = CreateTestSubmission();
        submission.Photos =
        [
            new PhotoAttachment { MediaFileId = "mf_001", FileName = "damage.jpg", CategoryString = "VehicleDamage" },
            new PhotoAttachment { MediaFileId = "mf_002", FileName = "scene.jpg", CategoryString = "SceneOverview" }
        ];

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal(2, report.Evidence.Photos.Count);
    }

    [Fact]
    public void Merge_UpgradesSeverityWhenDriverReportsHigher()
    {
        var report = CreateTestReport();
        report.Severity = IncidentSeverity.Low;
        var submission = CreateTestSubmission();
        submission.Severity = IncidentSeverity.High;

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal(IncidentSeverity.High, report.Severity);
    }

    [Fact]
    public void Merge_DoesNotDowngradeSeverity()
    {
        var report = CreateTestReport();
        report.Severity = IncidentSeverity.Critical;
        var submission = CreateTestSubmission();
        submission.Severity = IncidentSeverity.Low;

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal(IncidentSeverity.Critical, report.Severity);
    }

    [Fact]
    public void Merge_FillsInjuryInfo()
    {
        var report = CreateTestReport();
        report.InjuriesReported = null;
        var submission = CreateTestSubmission();
        submission.InjuriesReported = false;

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.False(report.InjuriesReported);
    }

    [Fact]
    public void Merge_AppendsWitnesses()
    {
        var report = CreateTestReport();
        var submission = CreateTestSubmission();
        submission.Witnesses = "Bob Smith, 555-0199";

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Single(report.Witnesses);
        Assert.Equal("Bob Smith, 555-0199", report.Witnesses[0].Statement);
    }

    [Fact]
    public void Merge_HandlesEmptySubmission()
    {
        var report = CreateTestReport();
        report.Notes = "Existing notes";
        var submission = new DriverSubmission
        {
            Id = "sub_empty",
            DeviceId = "b1",
            IncidentTimestamp = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            Photos = []
        };

        IncidentPollerWorker.MergeSubmissionIntoReport(report, submission);

        Assert.Equal("sub_empty", report.MergedFromSubmissionId);
        Assert.Equal("Existing notes", report.Notes);
    }

    [Fact]
    public void AddInDataWrapper_ForDriverSubmission_SetsCorrectType()
    {
        var submission = CreateTestSubmission();
        var wrapper = AddInDataWrapper.ForDriverSubmission(submission);

        Assert.Equal("driverSubmission", wrapper.Type);
        var deserialized = wrapper.GetPayload<DriverSubmission>();
        Assert.NotNull(deserialized);
        Assert.Equal(submission.Id, deserialized!.Id);
    }

    [Fact]
    public void ReportRequest_LinkedSubmissionId_Serializes()
    {
        var request = new ReportRequest
        {
            Id = "req_001",
            DeviceId = "b1",
            FromDate = DateTime.UtcNow.AddHours(-1),
            ToDate = DateTime.UtcNow,
            LinkedSubmissionId = "sub_123"
        };

        var json = System.Text.Json.JsonSerializer.Serialize(request);
        var deserialized = System.Text.Json.JsonSerializer.Deserialize<ReportRequest>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("sub_123", deserialized!.LinkedSubmissionId);
    }

    [Fact]
    public void ReportRequest_LinkedSubmissionId_Nullable()
    {
        var request = new ReportRequest
        {
            Id = "req_002",
            DeviceId = "b1",
            FromDate = DateTime.UtcNow.AddHours(-1),
            ToDate = DateTime.UtcNow
        };

        Assert.Null(request.LinkedSubmissionId);
    }
}
