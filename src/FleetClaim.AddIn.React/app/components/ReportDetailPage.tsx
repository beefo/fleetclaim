import React, { useState, useCallback, useMemo } from 'react';
import {
    Button,
    Card,
    Pill,
    Tabs,
    Chart,
    Banner,
    IconCheck,
    IconWarning,
    IconCloseCircle,
    IconLoader,
    IconChevronLeft,
    IconDownload
} from '@geotab/zenith';
import { IncidentReport, Severity, Photo } from '@/types';
import { useGeotab } from '@/contexts';
import { downloadPdfSimple, sendReportEmail } from '@/services';
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
    
    // Form state - track all editable fields across all tabs
    const [notes, setNotes] = useState(report.notes || '');
    const [damageAssessment, setDamageAssessment] = useState(report.damageAssessment || {});
    const [thirdPartyInfo, setThirdPartyInfo] = useState(report.thirdPartyInfo || {});
    
    // Track if there are unsaved changes across ANY tab
    const hasUnsavedChanges = useMemo(() => {
        const notesChanged = notes !== (report.notes || '');
        const damageChanged = JSON.stringify(damageAssessment) !== JSON.stringify(report.damageAssessment || {});
        const thirdPartyChanged = JSON.stringify(thirdPartyInfo) !== JSON.stringify(report.thirdPartyInfo || {});
        return notesChanged || damageChanged || thirdPartyChanged;
    }, [notes, damageAssessment, thirdPartyInfo, report]);

    // Normalize field names
    const vehicleName = report.vehicleName || report.deviceName || 'Unknown Vehicle';
    const vehicleId = report.vehicleId || report.deviceId || '';
    
    // Get GPS trail
    const gpsTrail = useMemo(() => {
        const trail = report.evidence?.gpsTrail || report.gpsTrail || [];
        return trail.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
            dateTime: (p as any).timestamp || (p as any).dateTime,
            speed: (p as any).speedKmh ?? (p as any).speed
        }));
    }, [report]);

    const photos = report.evidence?.photos || report.photos || [];
    const isBaseline = report.isBaselineReport || report.id?.includes('baseline') || !report.incidentDetails?.ruleId;
    const incidentLat = report.latitude ?? (gpsTrail.length > 0 ? gpsTrail[gpsTrail.length - 1].latitude : null);
    const incidentLng = report.longitude ?? (gpsTrail.length > 0 ? gpsTrail[gpsTrail.length - 1].longitude : null);

    const handleDownloadPdf = useCallback(async () => {
        if (!database) {
            toast.error('Database not available. Please refresh.');
            return;
        }
        try {
            toast.info('Generating PDF...');
            await downloadPdfSimple(database, report.id);
            toast.success('PDF downloaded');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to download PDF');
        }
    }, [report.id, database, toast]);

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

    // GLOBAL SAVE - saves all tabs at once
    const handleSaveAll = useCallback(async () => {
        setIsSaving(true);
        try {
            await onUpdate(report.id, { 
                notes,
                damageAssessment,
                thirdPartyInfo
            });
            toast.success('All changes saved');
        } catch (err) {
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    }, [report.id, notes, damageAssessment, thirdPartyInfo, onUpdate, toast]);

    const handleUpdatePhotos = useCallback(async (newPhotos: Photo[]) => {
        await onUpdate(report.id, { 
            photos: newPhotos,
            evidence: { ...report.evidence, photos: newPhotos }
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
        const parts = [report.incidentAddress, report.incidentCity, report.incidentState, report.incidentCountry].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
        if (incidentLat != null && incidentLng != null) return `${incidentLat.toFixed(5)}, ${incidentLng.toFixed(5)}`;
        return 'Location unknown';
    }, [report, incidentLat, incidentLng]);

    const tabs = [
        { id: 'overview' as TabId, name: 'Overview' },
        { id: 'photos' as TabId, name: `Photos ${photos?.length ? `(${photos.length})` : ''}` },
        { id: 'damage' as TabId, name: 'Damage Assessment' },
        { id: 'thirdparty' as TabId, name: 'Third Party' }
    ];

    const maxSpeed = gpsTrail.length > 0 ? Math.max(...gpsTrail.map(p => p.speed || 0)) : null;

    return (
        <div className="report-detail-page">
            {/* Compact Header - matches Device Edit style */}
            <div className="detail-header">
                <div className="detail-header-left">
                    <Button type="tertiary" onClick={onBack} className="back-button">
                        <IconChevronLeft />
                    </Button>
                    <h1 className="detail-title">{vehicleName}</h1>
                    {severityPill}
                    {isBaseline && <Pill type="info">Baseline</Pill>}
                </div>
                <div className="detail-header-right">
                    <Button type="secondary" onClick={handleDownloadPdf} disabled={!database}>
                        <IconDownload /> Download PDF
                    </Button>
                    <Button 
                        type="primary" 
                        onClick={handleSaveAll} 
                        disabled={!hasUnsavedChanges || isSaving}
                    >
                        {isSaving ? 'Saving...' : '💾 Save'}
                    </Button>
                </div>
            </div>

            {/* Baseline notice - compact */}
            {isBaseline && (
                <Banner type="info" header="Baseline Report">
                    Generated manually without a collision event. Documents vehicle data for reference.
                </Banner>
            )}

            {/* Tabs */}
            <Tabs tabs={tabs} activeTabId={activeTab} onTabChange={(id) => setActiveTab(id as TabId)} />

            {/* Tab content */}
            <div className="report-tab-content">
                {activeTab === 'overview' && (
                    <div className="overview-grid">
                        {/* LEFT COLUMN */}
                        <div className="overview-left">
                            <Card title="Vehicle Information" autoHeight>
                                <Card.Content>
                                    <div className="detail-rows">
                                        <div className="detail-row">
                                            <span className="detail-label">Vehicle</span>
                                            <span className="detail-value">{vehicleName}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Severity</span>
                                            <span className="detail-value">{severityPill}</span>
                                        </div>
                                        {isBaseline && (
                                            <div className="detail-row">
                                                <span className="detail-label">Type</span>
                                                <span className="detail-value"><Pill type="info">Baseline</Pill></span>
                                            </div>
                                        )}
                                        <div className="detail-row">
                                            <span className="detail-label">Driver</span>
                                            <span className="detail-value">{report.driverName || 'Unknown'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Date & Time</span>
                                            <span className="detail-value">{safeFormat(report.occurredAt, 'MMM d, yyyy h:mm a')}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Coordinates</span>
                                            <span className="detail-value">{incidentLat?.toFixed(5)}, {incidentLng?.toFixed(5)}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Location</span>
                                            <span className="detail-value">{locationString}</span>
                                        </div>
                                        {report.requestedBy && (
                                            <div className="detail-row">
                                                <span className="detail-label">Requested By</span>
                                                <span className="detail-value">{report.requestedBy}</span>
                                            </div>
                                        )}
                                    </div>
                                </Card.Content>
                            </Card>

                            <Card title="Telematics" autoHeight>
                                <Card.Content>
                                    <div className="detail-rows">
                                        <div className="detail-row">
                                            <span className="detail-label">Speed at Event</span>
                                            <span className="detail-value">{report.evidence?.speedAtEventKmh?.toFixed(0) || '0'} km/h</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Max Deceleration</span>
                                            <span className="detail-value">{report.evidence?.decelerationMps2?.toFixed(2) || '—'} G</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Max Speed</span>
                                            <span className="detail-value">{maxSpeed?.toFixed(0) || '—'} km/h</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">GPS Points</span>
                                            <span className="detail-value">{gpsTrail.length}</span>
                                        </div>
                                    </div>
                                </Card.Content>
                            </Card>

                            <Card title="Conditions" autoHeight>
                                <Card.Content>
                                    <div className="detail-rows">
                                        <div className="detail-row">
                                            <span className="detail-label">Weather</span>
                                            <span className="detail-value">{report.evidence?.weatherCondition || 'Unknown'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Temperature</span>
                                            <span className="detail-value">{report.evidence?.temperatureCelsius?.toFixed(0) ?? '—'}°C</span>
                                        </div>
                                    </div>
                                </Card.Content>
                            </Card>

                            <Card title="Notes" autoHeight>
                                <Card.Content>
                                    <textarea
                                        className="notes-textarea"
                                        placeholder="Add notes, driver statements, or context..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={3}
                                    />
                                </Card.Content>
                            </Card>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="overview-right">
                            {/* Speed Profile */}
                            {gpsTrail.length > 0 && (
                                <Card title="Speed Profile" autoHeight>
                                    <Card.Content>
                                        <div className="chart-container">
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
                                                        y: { beginAtZero: true, max: 120, title: { display: true, text: 'km/h' } },
                                                        x: { display: false }
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="chart-legend">
                                            <span><span className="dot green"></span> Normal</span>
                                            <span><span className="dot yellow"></span> Moderate</span>
                                            <span><span className="dot red"></span> High</span>
                                        </div>
                                    </Card.Content>
                                </Card>
                            )}

                            {/* Location Map */}
                            <Card title="Location" autoHeight>
                                <Card.Content>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                        {incidentLat != null && incidentLng != null && (
                                            <a 
                                                href={`https://www.google.com/maps?q=${incidentLat},${incidentLng}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ fontSize: '13px', color: 'var(--zen-color-primary, #0070f3)' }}
                                            >
                                                🗺️ View Map
                                            </a>
                                        )}
                                    </div>
                                    <div className="fc-map-container" style={{ height: '300px' }}>
                                        <GpsMap
                                            gpsTrail={gpsTrail}
                                            incidentLocation={{ latitude: incidentLat, longitude: incidentLng }}
                                            occurredAt={report.occurredAt}
                                            height="300px"
                                        />
                                    </div>
                                    <div className="map-details">
                                        <span className="map-address">{locationString}</span>
                                        <span className="map-updated">Last updated: {safeFormat(report.occurredAt, 'MMM d, yyyy h:mm a')}</span>
                                    </div>
                                </Card.Content>
                            </Card>
                        </div>
                    </div>
                )}

                {activeTab === 'photos' && (
                    <PhotosSection
                        photos={photos}
                        reportId={report.id}
                        deviceId={vehicleId}
                        onUpdate={handleUpdatePhotos}
                        toast={toast}
                    />
                )}

                {activeTab === 'damage' && (
                    <DamageAssessmentForm
                        assessment={damageAssessment}
                        onChange={setDamageAssessment}
                    />
                )}

                {activeTab === 'thirdparty' && (
                    <ThirdPartyInfoForm
                        info={thirdPartyInfo}
                        onChange={setThirdPartyInfo}
                    />
                )}
            </div>
        </div>
    );
};
