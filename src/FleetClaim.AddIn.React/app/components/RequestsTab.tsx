import React, { useMemo, useCallback } from 'react';
import {
    Card,
    Table,
    Pill,
    Banner,
    IconLoader,
    IconCheck,
    IconCloseCircle,
    Button,
    getEmptySelection,
    getSortableValue,
    IListColumn,
    ColumnSortDirection,
    SummaryTile,
    SummaryTileType
} from '@geotab/zenith';
import { useRequests } from '@/hooks';
import { ReportRequest, RequestStatus } from '@/types';
import { format } from 'date-fns';

interface RequestsTabProps {
    onRefresh: () => void;
    toast: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
    };
}

const statusConfig: Record<RequestStatus, { type: 'info' | 'warning' | 'success' | 'error'; label: string; icon: typeof IconLoader }> = {
    pending: { type: 'info', label: 'Pending', icon: IconLoader },
    processing: { type: 'warning', label: 'Processing', icon: IconLoader },
    completed: { type: 'success', label: 'Completed', icon: IconCheck },
    failed: { type: 'error', label: 'Failed', icon: IconCloseCircle }
};

export const RequestsTab: React.FC<RequestsTabProps> = ({ onRefresh, toast }) => {
    const { requests, isLoading, error, stats, refresh, remove } = useRequests();
    
    const [selection, setSelection] = React.useState(getEmptySelection());
    const [sortValue, setSortValue] = React.useState(getSortableValue('fleetclaim-requests', {
        sortColumn: 'requestedAt',
        sortDirection: ColumnSortDirection.Descending
    }));

    const handleDelete = useCallback(async (requestId: string) => {
        if (!confirm('Delete this request?')) return;
        
        try {
            await remove(requestId);
            toast.success('Request deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete request');
        }
    }, [remove, toast]);

    const columns: IListColumn<{ id: string; request: ReportRequest }>[] = [
        {
            id: 'requestedAt',
            title: 'Requested',
            meta: { defaultWidth: 160 },
            columnComponent: {
                render: (entity) => format(new Date(entity.request.requestedAt), 'MMM d, yyyy h:mm a'),
                renderHeader: (title) => title
            }
        },
        {
            id: 'deviceName',
            title: 'Vehicle',
            meta: { defaultWidth: 150 },
            columnComponent: {
                render: (entity) => entity.request.deviceName || 'Unknown',
                renderHeader: (title) => title
            }
        },
        {
            id: 'requestedBy',
            title: 'Requested By',
            meta: { defaultWidth: 140 },
            columnComponent: {
                render: (entity) => entity.request.requestedBy,
                renderHeader: (title) => title
            }
        },
        {
            id: 'timeRange',
            title: 'Time Range',
            meta: { defaultWidth: 200 },
            sortable: false,
            columnComponent: {
                render: (entity) => {
                    const start = format(new Date(entity.request.rangeStart), 'MMM d, h:mm a');
                    const end = format(new Date(entity.request.rangeEnd), 'h:mm a');
                    return `${start} - ${end}`;
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'status',
            title: 'Status',
            meta: { defaultWidth: 120 },
            columnComponent: {
                render: (entity) => {
                    const config = statusConfig[entity.request.status];
                    return (
                        <Pill type={config.type} icon={config.icon}>
                            {config.label}
                        </Pill>
                    );
                },
                renderHeader: (title) => title
            }
        },
        {
            id: 'options',
            title: 'Options',
            meta: { defaultWidth: 100 },
            sortable: false,
            columnComponent: {
                render: (entity) => (
                    <span className="request-options">
                        {entity.request.forceReport && (
                            <span className="badge" title="Force Report">⚡</span>
                        )}
                    </span>
                ),
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
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entity.request.id);
                        }}
                    >
                        Delete
                    </Button>
                ),
                renderHeader: () => null
            }
        }
    ];

    const entities = useMemo(() => 
        requests.map(r => ({ id: r.request.id, request: r.request })),
        [requests]
    );

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
        <div className="requests-tab">
            <div className="summary-tiles-container">
                <SummaryTile title="Total Requests" tileType={SummaryTileType.Default}>
                    {stats.total}
                </SummaryTile>
                <SummaryTile title="Pending" tileType={SummaryTileType.Active}>
                    {stats.pending}
                </SummaryTile>
                <SummaryTile title="Processing" tileType={SummaryTileType.Warning}>
                    {stats.processing}
                </SummaryTile>
                <SummaryTile title="Completed" tileType={SummaryTileType.Success}>
                    {stats.completed}
                </SummaryTile>
            </div>

            <Table
                height="500px"
                flexible={{ pageName: 'fleetclaim-requests' }}
                sortable={{
                    pageName: 'fleetclaim-requests',
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
                    description={isLoading ? "Loading requests..." : "No requests found. Click 'New Report Request' to create one."}
                />
                <Table.Fullscreen />
            </Table>

            {stats.pending > 0 && (
                <Banner type="info" header="Processing">
                    Pending requests are processed automatically. This page will refresh when updates are available.
                </Banner>
            )}
        </div>
    );
};
