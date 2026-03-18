import React, { useMemo, useCallback, useEffect, useState } from 'react';
import {
    Card,
    Table,
    Pill,
    Banner,
    Button,
    getEmptySelection,
    getSortableValue,
    IListColumn,
    ColumnSortDirection,
    SummaryTile,
    SummaryTileType
} from '@geotab/zenith';
import { useGeotab } from '@/contexts';
import { loadSubmissions, SubmissionRecord } from '@/services';
import { DriverSubmission, SubmissionStatus } from '@/types';
import { format } from 'date-fns';

interface SubmissionsTabProps {
    onCreateRequest: (submissionId: string) => void;
    toast: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
    };
}

const statusConfig: Record<SubmissionStatus, { type: 'info' | 'warning' | 'success' | 'error'; label: string }> = {
    synced: { type: 'info', label: 'Awaiting Merge' },
    merged: { type: 'success', label: 'Merged' },
    converted: { type: 'success', label: 'Report Created' },
    standalone: { type: 'warning', label: 'Standalone' }
};

export const SubmissionsTab: React.FC<SubmissionsTabProps> = ({ onCreateRequest, toast }) => {
    const { api } = useGeotab();
    const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [selection, setSelection] = React.useState(getEmptySelection());
    const [sortValue, setSortValue] = React.useState(getSortableValue('fleetclaim-submissions', {
        sortColumn: 'incidentTimestamp',
        sortDirection: ColumnSortDirection.Descending
    }));

    const refresh = useCallback(async () => {
        if (!api) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const loaded = await loadSubmissions(api);
            setSubmissions(loaded);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load submissions');
        } finally {
            setIsLoading(false);
        }
    }, [api]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Auto-refresh every 30 seconds if there are unmerged submissions
    useEffect(() => {
        const hasUnmerged = submissions.some(s => s.submission.status === 'synced');
        if (!hasUnmerged) return;
        
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [submissions, refresh]);

    const stats = useMemo(() => ({
        total: submissions.length,
        awaiting: submissions.filter(s => s.submission.status === 'synced').length,
        merged: submissions.filter(s => s.submission.status === 'merged').length,
        converted: submissions.filter(s => s.submission.status === 'converted').length,
        standalone: submissions.filter(s => s.submission.status === 'standalone').length
    }), [submissions]);

    const columns: IListColumn<{ id: string; submission: DriverSubmission }>[] = [
        {
            id: 'incidentTimestamp',
            title: 'Incident Time',
            meta: { defaultWidth: 160 },
            columnComponent: {
                render: (entity) => format(new Date(entity.submission.incidentTimestamp), 'MMM d, yyyy h:mm a'),
                renderHeader: (title) => title
            }
        },
        {
            id: 'deviceName',
            title: 'Vehicle',
            meta: { defaultWidth: 140 },
            columnComponent: {
                render: (entity) => entity.submission.deviceName || 'Unknown',
                renderHeader: (title) => title
            }
        },
        {
            id: 'driverName',
            title: 'Driver',
            meta: { defaultWidth: 140 },
            columnComponent: {
                render: (entity) => entity.submission.driverName || 'Unknown',
                renderHeader: (title) => title
            }
        },
        {
            id: 'description',
            title: 'Description',
            meta: { defaultWidth: 200 },
            sortable: false,
            columnComponent: {
                render: (entity) => (
                    <span className="description-cell" title={entity.submission.description || ''}>
                        {entity.submission.description || '—'}
                    </span>
                ),
                renderHeader: (title) => title
            }
        },
        {
            id: 'severity',
            title: 'Severity',
            meta: { defaultWidth: 100 },
            columnComponent: {
                render: (entity) => {
                    const sev = entity.submission.severity;
                    if (!sev) return '—';
                    const pillType = sev === 'critical' || sev === 'high' ? 'error' : sev === 'medium' ? 'warning' : 'info';
                    return <Pill type={pillType}>{sev}</Pill>;
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'photos',
            title: 'Photos',
            meta: { defaultWidth: 80 },
            sortable: false,
            columnComponent: {
                render: (entity) => entity.submission.photos?.length || 0,
                renderHeader: (title) => title
            }
        },
        {
            id: 'status',
            title: 'Status',
            meta: { defaultWidth: 130 },
            columnComponent: {
                render: (entity) => {
                    const config = statusConfig[entity.submission.status] || statusConfig.synced;
                    return <Pill type={config.type}>{config.label}</Pill>;
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'actions',
            title: '',
            meta: { defaultWidth: 140 },
            sortable: false,
            columnComponent: {
                render: (entity) => {
                    if (entity.submission.status === 'synced') {
                        return (
                            <Button
                                type="primary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateRequest(entity.submission.id);
                                }}
                            >
                                Create Report
                            </Button>
                        );
                    }
                    if (entity.submission.mergedIntoReportId) {
                        return (
                            <span className="report-link-badge" title={entity.submission.mergedIntoReportId}>
                                🔗 {entity.submission.mergedIntoReportId.slice(0, 8)}...
                            </span>
                        );
                    }
                    return null;
                },
                renderHeader: () => null
            }
        }
    ];

    const entities = useMemo(() => {
        const mapped = submissions.map(s => ({ id: s.submission.id, submission: s.submission }));
        
        const sortColumn = sortValue.sortColumn;
        const sortDirection = sortValue.sortDirection;
        
        if (sortColumn) {
            mapped.sort((a, b) => {
                let comparison = 0;
                
                switch (sortColumn) {
                    case 'incidentTimestamp':
                        comparison = new Date(a.submission.incidentTimestamp).getTime() - new Date(b.submission.incidentTimestamp).getTime();
                        break;
                    case 'deviceName':
                        comparison = (a.submission.deviceName || '').localeCompare(b.submission.deviceName || '');
                        break;
                    case 'driverName':
                        comparison = (a.submission.driverName || '').localeCompare(b.submission.driverName || '');
                        break;
                    case 'severity':
                        comparison = (a.submission.severity || '').localeCompare(b.submission.severity || '');
                        break;
                    case 'status':
                        comparison = (a.submission.status || '').localeCompare(b.submission.status || '');
                        break;
                    default:
                        comparison = 0;
                }
                
                return sortDirection === ColumnSortDirection.Descending ? -comparison : comparison;
            });
        }
        
        return mapped;
    }, [submissions, sortValue]);

    if (error) {
        return (
            <Card title="Error" status="error">
                <Card.Content>
                    <p>{error}</p>
                    <Button onClick={refresh}>Retry</Button>
                </Card.Content>
            </Card>
        );
    }

    return (
        <div className="submissions-tab">
            <div className="summary-tiles-container">
                <SummaryTile title="Total Submissions" tileType={SummaryTileType.Default}>
                    {stats.total}
                </SummaryTile>
                <SummaryTile title="Awaiting Merge" tileType={SummaryTileType.Active}>
                    {stats.awaiting}
                </SummaryTile>
                <SummaryTile title="Merged" tileType={SummaryTileType.Success}>
                    {stats.merged}
                </SummaryTile>
                <SummaryTile title="Report Created" tileType={SummaryTileType.Success}>
                    {stats.converted}
                </SummaryTile>
            </div>

            <Table
                height="500px"
                flexible={{ pageName: 'fleetclaim-submissions' }}
                sortable={{
                    pageName: 'fleetclaim-submissions',
                    value: sortValue,
                    onChange: setSortValue
                }}
                selectable={{
                    selection,
                    onSelect: setSelection
                }}
                columns={columns}
                entities={entities}
            >
                <Table.Empty 
                    description={isLoading ? "Loading submissions..." : "No driver submissions found. Submissions appear here when drivers report incidents via Geotab Drive."}
                />
                <Table.Fullscreen />
            </Table>

            {stats.awaiting > 0 && (
                <Banner type="info" header="Pending Merge">
                    {stats.awaiting} submission{stats.awaiting > 1 ? 's are' : ' is'} waiting to be merged with collision reports. 
                    Click "Create Report" to manually link a submission to a report.
                </Banner>
            )}
        </div>
    );
};
