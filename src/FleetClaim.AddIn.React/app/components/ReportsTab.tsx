import React, { useState, useMemo, useCallback } from 'react';
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
            dateRange: 'week',
            vehicleId: 'all'
        });
    }, [setFilters]);

    const handleViewReport = useCallback((report: IncidentReport) => {
        setSelectedReport(report);
        setSelectedReportId(report.id);
    }, []);

    const handleCloseModal = useCallback(() => {
        setSelectedReport(null);
        setSelectedReportId(null);
    }, []);

    const handleDeleteReport = useCallback(async (reportId: string) => {
        try {
            await remove(reportId);
            toast.success('Report deleted');
            handleCloseModal();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete report');
        }
    }, [remove, toast, handleCloseModal]);

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
                            console.log('View clicked for:', entity.report.id, entity.report);
                            setSelectedReport(entity.report);
                        }}
                    >
                        View
                    </Button>
                ),
                renderHeader: () => null
            }
        }
    ];

    const entities = useMemo(() => 
        reports.map(r => ({ id: r.report.id, report: r.report })),
        [reports]
    );

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
                    dateRange: { state: { selectedOption: ['week'] } }
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
                    showInSidePanel
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
