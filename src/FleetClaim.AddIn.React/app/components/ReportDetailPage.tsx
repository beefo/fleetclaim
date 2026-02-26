import React, { useState, useCallback, useMemo } from 'react';
import {
    Button,
    Card,
    Cards,
    Pill,
    Tabs,
    Chart,
    Banner,
    SummaryTile,
    SummaryTileType,
    PageHeader,
    IconCheck,
    IconWarning,
    IconCloseCircle,
    IconLoader,
    IconChevronLeft,
    IconDownload,
    IconEmail,
    IconDelete
} from '@geotab/zenith';
import { IncidentReport, Severity, Photo } from '@/types';
import { useGeotab } from '@/contexts';
import { downloadPdf, sendReportEmail } from '@/services';
import { GpsMap } from './GpsMap';
import { PhotosSection } from './PhotosSection';
import { DamageAssessmentForm } from './DamageAssessmentForm';
import { ThirdPartyInfoForm } from './ThirdPartyInfoForm';
import { format, isValid } from 'date-fns';

// Safe date formatter
const safeFormat = (dateStr: string | undefined, formatStr: string): string => {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        if (!isValid(date)) return 'Invalid date';
        return format(date, formatStr);
    } catch (e) {
        console.error('Date format error:', e);
        return 'Error';
    }
};

interface ReportDetailPageProps {
    report: IncidentReport;
    onBack: () => void;
    onUpdate: (reportId: string, updates: Partial<IncidentReport>) => Promise<void>;
    onDelete: (reportId: string) => Promise<void>;
    toast: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
    };
}

const severityConfig: Record<Severity, { type: 'error' | 'warning' | 'info' | 'success'; icon: typeof IconCloseCircle }> = {
    critical: { type: 'error', icon: IconCloseCircle },
    high: { type: 'warning', icon: IconWarning },
    medium: { type: 'info', icon: IconLoader },
    low: { type: 'success', icon: IconCheck }
};

type TabId = 'overview' | 'photos' | 'damage' | 'thirdparty';

export const ReportDetailPage: React.FC<ReportDetailPageProps> = ({
    report,
    onBack,
    onUpdate,
    onDelete,
    toast
}) => {
    const { state, credentials, geotabHost } = useGeotab();
    const database = (state?.getState()?.database as string) || credentials?.database || '';
    
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notes, setNotes] = useState(report.notes || '');
    
    // Track if there are unsaved changes
    const hasUnsavedChanges = useMemo(() => {
        return notes !== (report.notes || '');
    }, [notes, report.notes]);

    // Normalize field names (backend uses vehicleName, frontend may use deviceName)
    const vehicleName = report.vehicleName || report.deviceName || 'Unknown Vehicle';
    const vehicleId = report.vehicleId || report.deviceId || '';
    
    // Get GPS trail from evidence or root level
    const gpsTrail = useMemo(() => {
        const trail = report.evidence?.gpsTrail || report.gpsTrail || [];
        // Normalize speedKmh to speed
        return trail.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
            dateTime: (p as any).timestamp || (p as any).dateTime,
            speed: (p as any).speedKmh ?? (p as any).speed
        }));
    }, [report]);

    // Get photos from evidence or root level
    const photos = report.evidence?.photos || report.photos || [];
    
    // Check if this is a baseline report
    const isBaseline = report.isBaselineReport || report.id?.includes('baseline') || !report.incidentDetails?.ruleId;

    // Get incident location from GPS trail if not at root
    const incidentLat = report.latitude ?? (gpsTrail.length > 0 ? gpsTrail[gpsTrail.length - 1].latitude : null);
    const incidentLng = report.longitude ?? (gpsTrail.length > 0 ? gpsTrail[gpsTrail.length - 1].longitude : null);

    const handleDownloadPdf = useCallback(async () => {
        if (!credentials || !credentials.sessionId) {
            toast.error('Session not available. Please refresh the page.');
            return;
        }
        try {
            toast.info('Generating PDF...');
            await downloadPdf(report.id, {
                database: credentials.database,
                userName: credentials.userName,
                sessionId: credentials.sessionId,
                server: geotabHost
            });
            toast.success('PDF downloaded');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to download PDF';
            toast.error(message);
        }
    }, [report.id, credentials, geotabHost, toast]);

    const handleSendEmail = useCallback(async () => {
        if (!credentials || !credentials.sessionId) {
            toast.error('Session not available. Please refresh the page.');
            return;
        }
        
        const email = prompt('Enter email address:');
        if (!email) return;
        
        try {
            toast.info('Sending email...');
            await sendReportEmail(report.id, email, {
                database: credentials.database,
                userName: credentials.userName,
                sessionId: credentials.sessionId,
                server: geotabHost
            });
            toast.success('Report sent to ' + email);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send email';
            toast.error(message);
        }
    }, [report.id, credentials, geotabHost, toast]);

    const handleDelete = useCallback(async () => {
        if (!confirm('Are you sure you want to delete this report?')) return;
        
        setIsDeleting(true);
        try {
            await onDelete(report.id);
            toast.success('Report deleted');
            onBack();
        } catch (err) {
            toast.error('Failed to delete report');
        } finally {
            setIsDeleting(false);
        }
    }, [report.id, onDelete, onBack, toast]);

    const handleSaveChanges = useCallback(async () => {
        setIsSaving(true);
        try {
            await onUpdate(report.id, { notes });
            toast.success('Changes saved');
        } catch (err) {
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    }, [report.id, notes, onUpdate, toast]);

    const handleUpdateDamage = useCallback(async (damage: any) => {
        await onUpdate(report.id, { damageAssessment: damage });
        toast.success('Damage assessment saved');
    }, [report.id, onUpdate, toast]);

    const handleUpdateThirdParty = useCallback(async (thirdParty: any) => {
        await onUpdate(report.id, { thirdPartyInfo: thirdParty });
        toast.success('Third party info saved');
    }, [report.id, onUpdate, toast]);

    const handleUpdatePhotos = useCallback(async (newPhotos: Photo[]) => {
        // Update photos at root level and in evidence (to handle both structures)
        await onUpdate(report.id, { 
            photos: newPhotos,
            evidence: {
                ...report.evidence,
                photos: newPhotos
            }
        });
    }, [report.id, report.evidence, onUpdate]);

    const severityPill = useMemo(() => {
        const config = severityConfig[report.severity] || severityConfig.low;
        const Icon = config.icon;
        return (
            <Pill type={config.type}>
                <Icon /> {report.severity?.charAt(0).toUpperCase() + report.severity?.slice(1)}
            </Pill>
        );
    }, [report.severity]);

    const locationString = useMemo(() => {
        const parts = [
            report.incidentAddress,
            report.incidentCity,
            report.incidentState,
            report.incidentCountry
        ].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
        if (incidentLat != null && incidentLng != null) {
            return `${incidentLat.toFixed(5)}, ${incidentLng.toFixed(5)}`;
        }
        return 'Location unknown';
    }, [report]);

    const tabs = [
        { id: 'overview' as TabId, name: 'Overview' },
        { id: 'photos' as TabId, name: `Photos ${photos?.length ? `(${photos.length})` : ''}` },
        { id: 'damage' as TabId, name: 'Damage Assessment' },
        { id: 'thirdparty' as TabId, name: 'Third Party' }
    ];

    return (
        <div className="report-detail-page">
            {/* Header with back button */}
            <PageHeader>
                <PageHeader.Actions>
                    <Button type="tertiary" onClick={onBack}>
                        <IconChevronLeft /> Back
                    </Button>
                    {hasUnsavedChanges && (
                        <Button 
                            type="primary" 
                            onClick={handleSaveChanges} 
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    )}
                    <Button 
                        type="secondary" 
                        onClick={handleDownloadPdf} 
                        disabled={!credentials?.sessionId}
                    >
                        <IconDownload /> Download PDF
                    </Button>
                    <Button 
                        type="secondary" 
                        onClick={handleSendEmail}
                        disabled={!credentials?.sessionId}
                    >
                        <IconEmail /> Email
                    </Button>
                    <Button 
                        type="tertiary-destructive" 
                        onClick={handleDelete} 
                        disabled={isDeleting}
                    >
                        <IconDelete /> Delete
                    </Button>
                </PageHeader.Actions>
            </PageHeader>

            {/* Report title and summary */}
            <div className="page-title-section">
                <h1 className="page-title">{vehicleName}</h1>
                <div className="page-title-badges">
                    {severityPill}
                    {isBaseline && <Pill type="info">Baseline Report</Pill>}
                </div>
            </div>
            <div className="report-detail-meta">
                <span>📅 {safeFormat(report.occurredAt, 'MMMM d, yyyy h:mm a')}</span>
                <span>📍 {locationString}</span>
                {report.driverName && <span>👤 {report.driverName}</span>}
            </div>

            {/* Baseline notice */}
            {isBaseline && (
                <Banner type="info" header="Baseline Report">
                    This report was generated manually without a collision event trigger. 
                    It documents vehicle data for the requested time period for reference purposes.
                </Banner>
            )}

            {/* Tabs */}
            <Tabs
                tabs={tabs}
                activeTabId={activeTab}
                onTabChange={(id) => setActiveTab(id as TabId)}
            />

            {/* Tab content */}
            <div className="report-detail-content">
                {activeTab === 'overview' && (
                    <div className="two-column-layout">
                        {/* LEFT COLUMN - Details (like Asset Information) */}
                        <div className="left-column">
                            {/* Incident Information Card */}
                            <Card title={isBaseline ? "Vehicle Information" : "Incident Information"}>
                                <Card.Content>
                                    <div className="form-rows">
                                        <div className="form-row">
                                            <label>Vehicle</label>
                                            <span>{vehicleName || 'Unknown'}</span>
                                        </div>
                                        <div className="form-row">
                                            <label>Driver</label>
                                            <span>{report.driverName || 'Unknown'}</span>
                                        </div>
                                        <div className="form-row">
                                            <label>Incident Time</label>
                                            <span>{safeFormat(report.occurredAt, 'PPpp')}</span>
                                        </div>
                                        <div className="form-row">
                                            <label>Report Generated</label>
                                            <span>{safeFormat(report.generatedAt, 'PPpp')}</span>
                                        </div>
                                        {report.requestedBy && (
                                            <div className="form-row">
                                                <label>Requested By</label>
                                                <span>{report.requestedBy}</span>
                                            </div>
                                        )}
                                    </div>
                                </Card.Content>
                            </Card>

                            {/* Telematics Data Card */}
                            <Card title="Telematics Data">
                                <Card.Content>
                                    <div className="form-rows">
                                        <div className="form-row">
                                            <label>Speed at Event</label>
                                            <span>{report.evidence?.speedAtEventKmh?.toFixed(0) || report.incidentDetails?.speedAtEvent?.toFixed(0) || '—'} km/h</span>
                                        </div>
                                        <div className="form-row">
                                            <label>Max Deceleration</label>
                                            <span>{report.evidence?.decelerationMps2?.toFixed(2) || report.incidentDetails?.maxDecelerationG?.toFixed(2) || '—'} G</span>
                                        </div>
                                        <div className="form-row">
                                            <label>Max Speed</label>
                                            <span>{report.evidence?.maxSpeedKmh?.toFixed(0) || (gpsTrail.length > 0 ? Math.max(...gpsTrail.map(p => p.speed || 0)).toFixed(0) : '—')} km/h</span>
                                        </div>
                                        <div className="form-row">
                                            <label>GPS Points</label>
                                            <span>{gpsTrail?.length || 0}</span>
                                        </div>
                                    </div>
                                </Card.Content>
                            </Card>

                            {/* Weather Conditions */}
                            <Card title="Conditions">
                                <Card.Content>
                                    <div className="form-rows">
                                        <div className="form-row">
                                            <label>Weather</label>
                                            <span>{report.evidence?.weatherCondition || report.weather?.conditions || 'Unknown'}</span>
                                        </div>
                                        <div className="form-row">
                                            <label>Temperature</label>
                                            <span>{report.evidence?.temperatureCelsius?.toFixed(0) ?? report.weather?.temperature?.toFixed(0) ?? '—'}°C</span>
                                        </div>
                                    </div>
                                </Card.Content>
                            </Card>

                            {/* Notes & Driver Statement */}
                            <Card title="Notes & Driver Statement">
                                <Card.Content>
                                    <p className="notes-hint">Add incident details, driver statements, or context for insurance claims.</p>
                                    <textarea
                                        className="notes-textarea"
                                        placeholder="Enter notes about this incident..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={4}
                                    />
                                    {hasUnsavedChanges && (
                                        <p className="unsaved-hint" style={{ color: '#f59e0b', fontSize: '12px', marginTop: '8px' }}>
                                            ⚠️ You have unsaved changes. Click "Save Changes" in the header to save.
                                        </p>
                                    )}
                                </Card.Content>
                            </Card>
                        </div>

                        {/* RIGHT COLUMN - Visual data (like Usage/Location) */}
                        <div className="right-column">
                            {/* Speed Profile Chart */}
                            {gpsTrail.length > 0 && gpsTrail.some(p => p.speed !== undefined) && (
                                <Card title="Speed Profile">
                                    <Card.Content>
                                        <div style={{ height: 'auto', minHeight: 100 }}>
                                            <Chart
                                                type="bar"
                                                data={{
                                                    datasets: [{
                                                        label: 'Speed',
                                                        data: gpsTrail.slice(-30).map((p, idx) => ({
                                                            x: idx.toString(),
                                                            y: p.speed || 0
                                                        })),
                                                        backgroundColor: gpsTrail.slice(-30).map(p => 
                                                            (p.speed || 0) > 80 ? '#ef4444' : 
                                                            (p.speed || 0) > 50 ? '#f59e0b' : '#22c55e'
                                                        )
                                                    }]
                                                }}
                                                options={{
                                                    responsive: true,
                                                    maintainAspectRatio: false,
                                                    scales: {
                                                        y: {
                                                            beginAtZero: true,
                                                            max: 120,
                                                            title: { display: true, text: 'Speed (km/h)' }
                                                        },
                                                        x: {
                                                            display: false
                                                        }
                                                    }
                                                }}
                                                tooltip={{ 
                                                    title: 'Speed',
                                                    unit: 'km/h'
                                                }}
                                                legend={{ unit: 'km/h' }}
                                            />
                                        </div>
                                        <div className="speed-chart-legend">
                                            <span><span className="legend-dot green"></span> Normal (&lt;50)</span>
                                            <span><span className="legend-dot yellow"></span> Moderate (50-80)</span>
                                            <span><span className="legend-dot red"></span> High (&gt;80)</span>
                                        </div>
                                    </Card.Content>
                                </Card>
                            )}

                            {/* Location Map */}
                            <Card title="Location">
                                <Card.Content>
                                    <GpsMap
                                        gpsTrail={gpsTrail || []}
                                        incidentLocation={{
                                            latitude: incidentLat,
                                            longitude: incidentLng
                                        }}
                                        occurredAt={report.occurredAt}
                                        height="auto"
                                    />
                                    <div className="location-address">
                                        📍 {locationString}
                                    </div>
                                </Card.Content>
                            </Card>

                            {/* Key Metrics using SummaryTile */}
                            <div className="metrics-tiles">
                                <SummaryTile
                                    title="Event Speed"
                                    tileType={
                                        (report.evidence?.speedAtEventKmh || 0) > 80 ? SummaryTileType.Error :
                                        (report.evidence?.speedAtEventKmh || 0) > 50 ? SummaryTileType.Warning :
                                        SummaryTileType.Default
                                    }
                                >
                                    {report.evidence?.speedAtEventKmh?.toFixed(0) || '—'} km/h
                                </SummaryTile>
                                <SummaryTile
                                    title="Max G-Force"
                                    tileType={
                                        Math.abs(report.evidence?.decelerationMps2 || 0) > 3 ? SummaryTileType.Error :
                                        Math.abs(report.evidence?.decelerationMps2 || 0) > 1.5 ? SummaryTileType.Warning :
                                        SummaryTileType.Default
                                    }
                                >
                                    {report.evidence?.decelerationMps2?.toFixed(2) || '—'} G
                                </SummaryTile>
                                <SummaryTile
                                    title="Photos"
                                    tileType={SummaryTileType.Active}
                                >
                                    {photos.length}
                                </SummaryTile>
                                <SummaryTile
                                    title="GPS Points"
                                    tileType={SummaryTileType.Default}
                                >
                                    {gpsTrail?.length || 0}
                                </SummaryTile>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'photos' && (
                    <PhotosSection
                        photos={photos || []}
                        reportId={report.id}
                        deviceId={vehicleId}
                        onUpdate={handleUpdatePhotos}
                        toast={toast}
                    />
                )}

                {activeTab === 'damage' && (
                    <DamageAssessmentForm
                        assessment={report.damageAssessment}
                        onSave={handleUpdateDamage}
                        isSaving={false}
                    />
                )}

                {activeTab === 'thirdparty' && (
                    <ThirdPartyInfoForm
                        info={report.thirdPartyInfo}
                        onSave={handleUpdateThirdParty}
                        isSaving={false}
                    />
                )}
            </div>
        </div>
    );
};
