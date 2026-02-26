import React from 'react';
import { Modal, Button } from '@geotab/zenith';
import { IncidentReport } from '@/types';

interface ReportDetailModalProps {
    report: IncidentReport;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (reportId: string, updates: Partial<IncidentReport>) => Promise<void>;
    onDelete: (reportId: string) => Promise<void>;
    toast: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
    };
}

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
    report,
    isOpen,
    onClose,
}) => {
    console.log('ReportDetailModal: rendering, isOpen=', isOpen, 'report=', report);
    
    if (!isOpen) {
        console.log('ReportDetailModal: not open, returning null');
        return null;
    }
    
    if (!report) {
        console.log('ReportDetailModal: no report, returning null');
        return null;
    }

    console.log('ReportDetailModal: about to render Modal');

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Test Modal"
        >
            <Modal.Content>
                <p>Report ID: {report.id || 'unknown'}</p>
                <p>Device: {report.deviceName || 'unknown'}</p>
            </Modal.Content>
            <Modal.PrimaryButton onClick={onClose}>
                Close
            </Modal.PrimaryButton>
        </Modal>
    );
};
