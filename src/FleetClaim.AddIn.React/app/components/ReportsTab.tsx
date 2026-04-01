import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    Card,
    FiltersBar,
    Table,
    Pill,
    Button,
    IconLoader,
    IconCheck,
    IconWarning,
    IconCloseCircle,
    getEmptySelection,
    getSortableValue,
    IListColumn,
    ColumnSortDirection,
    SummaryTile,
    SummaryTileType
} from '@geotab/zenith';
import { useReports, ReportFilters, SortOptions } from '@/hooks';
import { useGeotab } from '@/contexts';
import { IncidentReport, Severity } from '@/types';
import { ReportDetailPage } from './ReportDetailPage';
import { format } from 'date-fns';

interface ReportsTabProps {
    onRefresh: () => void;
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

const dateRangeOptions = [
    { id: 'day', name: 'Last 24 hours' },
    { id: 'week', name: 'Last 7 days' },
    { id: 'month', name: 'Last 30 days' },
    { id: 'year', name: 'Last year' },
    { id: 'all', name: 'All time' }
];

const severityOptions = [
    { id: 'all', name: 'All severities' },
    { id: 'critical', name: 'Critical' },
    { id: 'high', name: 'High' },
    { id: 'medium', name: 'Medium' },
    { id: 'low', name: 'Low' }
];

export const ReportsTab: React.FC<ReportsTabProps> = ({ onRefresh, toast }) => {
    const { devices, loadDevices } = useGeotab();
    const { 
        reports, 
        isLoading, 
        error, 
        stats, 
        filters, 
        setFilters, 
        refresh,
        update,
        remove 
    } = useReports();
    
    const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [selectedAddInDataId, setSelectedAddInDataId] = useState<string | null>(null);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [selection, setSelection] = useState(getEmptySelection());
    const [sortValue, setSortValue] = useState(getSortableValue('fleetclaim-reports', {
        sortColumn: 'occurredAt',
        sortDirection: ColumnSortDirection.Descending
    }));

    const vehicleOptions = useMemo(() => [
        { id: 'all', name: 'All vehicles' },
        ...devices.map(d => ({ id: d.id, name: d.name }))
    ], [devices]);

    const handleClearFilters = useCallback(() => {
        setFilters({
            search: '',
            severity: 'all',
            dateRange: 'month',
            vehicleId: 'all'
        });
    }, [setFilters]);

    const handleViewReport = useCallback((report: IncidentReport) => {
        // Push a history state so browser back button returns to list
        window.history.pushState({ reportDetail: true, reportId: report.id }, '', window.location.href);
        const record = reports.find(r => r.report.id === report.id);
        setSelectedReport(report);
        setSelectedReportId(report.id);
        setSelectedAddInDataId(record?.addInDataId ?? null);
    }, [reports]);

    // Close detail view - called by UI back button
    const handleCloseModal = useCallback(() => {
        // Use history.back() to properly unwind the history state we pushed
        // The popstate handler will clear the selected report state
        window.history.back();
    }, []);

    // Close detail view after delete - replaces history state instead of going back
    // This prevents going back to a previous page when deleting from detail view
    const handleCloseAfterDelete = useCallback(() => {
        // Replace the current history state (which is the detail view state we pushed)
        // with the original state, effectively removing our pushed entry
        window.history.replaceState(null, '', window.location.href);
        setSelectedReport(null);
        setSelectedReportId(null);
        setSelectedAddInDataId(null);
    }, []);

    // Handle browser back button to return to list from detail view
    useEffect(() => {
        const handlePopState = () => {
            // When back is pressed (browser or via history.back()), close the detail view
            if (selectedReport) {
                setSelectedReport(null);
                setSelectedReportId(null);
                setSelectedAddInDataId(null);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [selectedReport]);

    const handleDeleteReport = useCallback(async (reportId: string) => {
        try {
            await remove(reportId);
            toast.success('Report deleted');
            handleCloseAfterDelete();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete report');
        }
    }, [remove, toast, handleCloseAfterDelete]);

    const handleUpdateReport = useCallback(async (reportId: string, updates: Partial<IncidentReport>) => {
        try {
            await update(reportId, updates);
            toast.success('Report updated');
            // Update the selected report with the changes
            if (selectedReport && selectedReport.id === reportId) {
                setSelectedReport({ ...selectedReport, ...updates });
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update report');
        }
    }, [update, toast, selectedReport]);

    const columns: IListColumn<{ id: string; report: IncidentReport }>[] = [
        {
            id: 'occurredAt',
            title: 'Date/Time',
            meta: { defaultWidth: 160 },
            columnComponent: {
                render: (entity) => (
                    <button 
                        type="button"
                        onClick={() => handleViewReport(entity.report)}
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            padding: 0, 
                            color: 'var(--zen-color-link)', 
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textAlign: 'left',
                            font: 'inherit'
                        }}
                    >
                        {format(new Date(entity.report.occurredAt), 'MMM d, yyyy h:mm a')}
                    </button>
                ),
                renderHeader: (title) => title
            }
        },
        {
            id: 'vehicleName',
            title: 'Vehicle',
            meta: { defaultWidth: 150 },
            columnComponent: {
                render: (entity) => entity.report.vehicleName || entity.report.deviceName || 'Unknown',
                renderHeader: (title) => title
            }
        },
        {
            id: 'driverName',
            title: 'Driver',
            meta: { defaultWidth: 120 },
            columnComponent: {
                render: (entity) => entity.report.driverName || 'N/A',
                renderHeader: (title) => title
            }
        },
        {
            id: 'location',
            title: 'Location',
            meta: { defaultWidth: 180 },
            columnComponent: {
                render: (entity) => {
                    const parts = [entity.report.incidentCity, entity.report.incidentState].filter(Boolean);
                    return parts.join(', ') || 'Unknown';
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'severity',
            title: 'Severity',
            meta: { defaultWidth: 100 },
            columnComponent: {
                render: (entity) => {
                    const config = severityConfig[entity.report.severity];
                    return (
                        <Pill type={config.type} icon={config.icon}>
                            {entity.report.severity.charAt(0).toUpperCase() + entity.report.severity.slice(1)}
                        </Pill>
                    );
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'source',
            title: 'Source',
            meta: { defaultWidth: 90 },
            columnComponent: {
                render: (entity) => {
                    const source = entity.report.source?.toLowerCase() || 'automatic';
                    return (
                        <Pill type={source === 'manual' ? 'info' : 'success'}>
                            {source === 'manual' ? '👤 Manual' : '🤖 Auto'}
                        </Pill>
                    );
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'status',
            title: 'Status',
            meta: { defaultWidth: 100 },
            sortable: false,
            columnComponent: {
                render: (entity) => {
                    const hasPhotos = entity.report.photos && entity.report.photos.length > 0;
                    const hasNotes = entity.report.notes?.trim();
                    const hasDamage = entity.report.damageAssessment?.damageLevel;
                    
                    return (
                        <span className="report-status-icons">
                            {hasPhotos && <span title="Has photos">📷</span>}
                            {hasNotes && <span title="Has notes">📝</span>}
                            {hasDamage && <span title="Damage assessed">🔧</span>}
                        </span>
                    );
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'actions',
            title: '',
            meta: { defaultWidth: 80 },
            sortable: false,
            columnComponent: {
                render: (entity) => (
                    <Button
                        type="tertiary"
                        htmlType="button"
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (confirm('Are you sure you want to delete this report?')) {
                                handleDeleteReport(entity.report.id);
                            }
                        }}
                    >
                        Delete
                    </Button>
                ),
                renderHeader: () => null
            }
        }
    ];

    const entities = useMemo(() => {
        const mapped = reports.map(r => ({ id: r.report.id, report: r.report }));
        
        // Apply sorting based on sortValue
        const sortColumn = sortValue.sortColumn;
        const sortDirection = sortValue.sortDirection;
        
        if (sortColumn) {
            mapped.sort((a, b) => {
                let comparison = 0;
                
                switch (sortColumn) {
                    case 'occurredAt':
                        comparison = new Date(a.report.occurredAt).getTime() - new Date(b.report.occurredAt).getTime();
                        break;
                    case 'vehicleName':
                        comparison = (a.report.vehicleName || a.report.deviceName || '').localeCompare(b.report.vehicleName || b.report.deviceName || '');
                        break;
                    case 'driverName':
                        comparison = (a.report.driverName || '').localeCompare(b.report.driverName || '');
                        break;
                    case 'location':
                        const locA = [a.report.incidentCity, a.report.incidentState].filter(Boolean).join(', ');
                        const locB = [b.report.incidentCity, b.report.incidentState].filter(Boolean).join(', ');
                        comparison = locA.localeCompare(locB);
                        break;
                    case 'severity':
                        const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
                        comparison = (severityOrder[a.report.severity] || 0) - (severityOrder[b.report.severity] || 0);
                        break;
                    case 'source':
                        comparison = (a.report.source || '').localeCompare(b.report.source || '');
                        break;
                    default:
                        comparison = 0;
                }
                
                return sortDirection === ColumnSortDirection.Descending ? -comparison : comparison;
            });
        }
        
        return mapped;
    }, [reports, sortValue]);

    if (error) {
        return (
            <Card title="Error" status="error">
                <Card.Content>
                    <p>{error}</p>
                    <button onClick={refresh}>Retry</button>
                </Card.Content>
            </Card>
        );
    }

    // If a report is selected, show the detail page instead of the list
    if (selectedReport) {
        return (
            <ReportDetailPage
                report={selectedReport}
                addInDataId={selectedAddInDataId ?? undefined}
                onBack={handleCloseModal}
                onUpdate={handleUpdateReport}
                onDelete={handleDeleteReport}
                toast={toast}
            />
        );
    }

    return (
        <div className="reports-tab">
            <div className="summary-tiles-container">
                <SummaryTile title="Total Reports" tileType={SummaryTileType.Default}>
                    {stats.total}
                </SummaryTile>
                <SummaryTile title="Critical" tileType={SummaryTileType.Error}>
                    {stats.critical}
                </SummaryTile>
                <SummaryTile title="High" tileType={SummaryTileType.Warning}>
                    {stats.high}
                </SummaryTile>
                <SummaryTile title="New Today" tileType={SummaryTileType.Active}>
                    {stats.newToday}
                </SummaryTile>
            </div>

            <FiltersBar
                isAllFiltersVisible={isFiltersOpen}
                toggleAllFilters={setIsFiltersOpen}
                getDefaultFiltersState={() => ({
                    search: { state: { value: '' } },
                    severity: { state: { selectedOption: ['all'] } },
                    dateRange: { state: { selectedOption: ['month'] } }
                })}
                onClearAllFilters={handleClearFilters}
            >
                <FiltersBar.Search
                    id="search"
                    state={{ value: filters.search }}
                    onChange={({ value }) => setFilters({ ...filters, search: value })}
                    sidePanelTitle="Search"
                    showInSidePanel={false}
                    props={{ placeholder: 'Search vehicles, drivers, locations...' }}
                />
                <FiltersBar.Dropdown
                    id="severity"
                    showInSidePanel
                    sidePanelTitle="Severity"
                    state={{ selectedOption: [filters.severity] }}
                    props={{
                        multiselect: false,
                        searchField: false,
                        dataItems: severityOptions,
                        placeholder: 'Severity',
                        errorHandler: () => {},
                        showSelection: true,
                        showCounterPill: false
                    }}
                    onChange={({ selectedOption }) => setFilters({ ...filters, severity: selectedOption[0] as Severity | 'all' })}
                />
                <FiltersBar.Dropdown
                    id="dateRange"
                    showInSidePanel={false}
                    sidePanelTitle="Date Range"
                    state={{ selectedOption: [filters.dateRange] }}
                    props={{
                        multiselect: false,
                        searchField: false,
                        dataItems: dateRangeOptions,
                        placeholder: 'Date Range',
                        errorHandler: () => {},
                        showSelection: true,
                        showCounterPill: false
                    }}
                    onChange={({ selectedOption }) => setFilters({ ...filters, dateRange: selectedOption[0] as ReportFilters['dateRange'] })}
                />
            </FiltersBar>

            <Table
                height="600px"
                flexible={{ pageName: 'fleetclaim-reports' }}
                sortable={{
                    pageName: 'fleetclaim-reports',
                    value: sortValue,
                    onChange: setSortValue
                }}
                selectable={{
                    selection,
                    onSelect: (selected: any) => {
                        setSelection(selected);
                        // If a single row is selected, view that report
                        if (selected.length === 1) {
                            const entity = entities.find(e => e.id === selected[0].id);
                            if (entity) handleViewReport(entity.report);
                        }
                    }
                }}
                columns={columns}
                entities={entities}
            >
                <Table.Empty 
                    description={isLoading ? "Loading reports..." : "No reports found. Adjust your filters or submit a new report request."}
                />
                <Table.Fullscreen />
            </Table>

        </div>
    );
};
