import React from 'react';
import { render, screen } from '@testing-library/react';
import { SubmissionDetail } from '@/components/SubmissionDetail';
import { DriverSubmission } from '@/types';

jest.mock('@geotab/zenith', () => {
    const Card = ({ children }: any) => <div>{children}</div>;
    (Card as any).Content = ({ children }: any) => <div>{children}</div>;
    return {
        Button: ({ children, onClick, ...props }: any) => (
            <button onClick={onClick} {...props}>{children}</button>
        ),
        Card,
        Pill: ({ children, type }: any) => <span data-type={type}>{children}</span>
    };
});

const createTestSubmission = (overrides: Partial<DriverSubmission> = {}): DriverSubmission => ({
    id: 'sub_001',
    deviceId: 'b1',
    deviceName: 'Vehicle 001',
    driverId: 'drv_1',
    driverName: 'John Driver',
    incidentTimestamp: '2026-03-18T10:30:00Z',
    latitude: 43.44,
    longitude: -79.67,
    locationAddress: '123 Main St, Burlington, ON',
    description: 'Hit a pole while turning right',
    severity: 'medium',
    damageAssessment: {
        damageLevel: 'moderate',
        description: 'Front bumper cracked',
        isDriveable: true,
        estimatedRepairCost: 2500
    },
    thirdPartyInfo: {
        otherDriverName: 'Jane Other',
        otherDriverPhone: '555-0123',
        otherVehicleMake: 'Toyota',
        otherVehicleModel: 'Camry',
        otherVehiclePlate: 'ABC 123',
        policeReportNumber: 'PR-2026-001'
    },
    photos: [
        { localId: 'p1', category: 'damage', capturedAt: '2026-03-18T10:31:00Z' },
        { localId: 'p2', category: 'scene', capturedAt: '2026-03-18T10:32:00Z' }
    ],
    policeReportNumber: 'PR-2026-001',
    policeAgency: 'Burlington PD',
    injuriesReported: false,
    injuryDescription: undefined,
    notes: 'Low speed impact in parking lot',
    status: 'synced',
    createdAt: '2026-03-18T10:30:00Z',
    updatedAt: '2026-03-18T10:35:00Z',
    submittedAt: '2026-03-18T10:35:00Z',
    pendingPhotoUploads: 0,
    ...overrides
});

describe('SubmissionDetail', () => {
    it('renders submission basic info', () => {
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Vehicle 001')).toBeInTheDocument();
        expect(screen.getByText('John Driver')).toBeInTheDocument();
        expect(screen.getByText('123 Main St, Burlington, ON')).toBeInTheDocument();
    });

    it('shows status banner with correct label', () => {
        const submission = createTestSubmission({ status: 'synced' });
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Awaiting Merge')).toBeInTheDocument();
    });

    it('shows merged status and report ID', () => {
        const submission = createTestSubmission({ 
            status: 'merged',
            mergedIntoReportId: 'rpt_abc123'
        });
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Merged')).toBeInTheDocument();
        expect(screen.getByText('Report: rpt_abc123')).toBeInTheDocument();
    });

    it('shows converted status', () => {
        const submission = createTestSubmission({ 
            status: 'converted',
            mergedIntoReportId: 'rpt_standalone'
        });
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Report Created')).toBeInTheDocument();
    });

    it('displays severity pill', () => {
        const submission = createTestSubmission({ severity: 'high' });
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('displays damage assessment section', () => {
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Damage Assessment')).toBeInTheDocument();
        expect(screen.getByText('Moderate')).toBeInTheDocument();
        expect(screen.getByText('Front bumper cracked')).toBeInTheDocument();
        expect(screen.getByText('$2,500')).toBeInTheDocument();
    });

    it('displays photo count', () => {
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Photos (2)')).toBeInTheDocument();
    });

    it('displays third party info', () => {
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Third Party & Police')).toBeInTheDocument();
        expect(screen.getByText('Jane Other')).toBeInTheDocument();
        expect(screen.getByText('Toyota Camry')).toBeInTheDocument();
    });

    it('displays police report number', () => {
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
    });

    it('displays injuries section when injuries reported', () => {
        const submission = createTestSubmission({ 
            injuriesReported: true,
            injuryDescription: 'Minor neck pain'
        });
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Injuries')).toBeInTheDocument();
        expect(screen.getByText('Minor neck pain')).toBeInTheDocument();
    });

    it('shows No for injuries when not reported', () => {
        const submission = createTestSubmission({ injuriesReported: false });
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('displays notes section', () => {
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Additional Notes')).toBeInTheDocument();
        expect(screen.getByText('Low speed impact in parking lot')).toBeInTheDocument();
    });

    it('displays submission timestamps', () => {
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Submission Info')).toBeInTheDocument();
        expect(screen.getByText('Created')).toBeInTheDocument();
        expect(screen.getByText('Submitted')).toBeInTheDocument();
    });

    it('calls onBack when back button clicked', () => {
        const onBack = jest.fn();
        const submission = createTestSubmission();
        render(<SubmissionDetail submission={submission} onBack={onBack} />);

        screen.getByText('← Back').click();

        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('handles missing optional fields gracefully', () => {
        const submission = createTestSubmission({
            driverName: undefined,
            locationAddress: undefined,
            severity: undefined,
            damageAssessment: undefined,
            thirdPartyInfo: undefined,
            notes: undefined,
            injuriesReported: undefined
        });
        
        // Should not throw
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        expect(screen.getByText('Incident Information')).toBeInTheDocument();
    });

    it('handles empty photos array', () => {
        const submission = createTestSubmission({ photos: [] });
        render(<SubmissionDetail submission={submission} onBack={() => {}} />);

        // Photos section should not appear
        expect(screen.queryByText(/Photos \(/)).not.toBeInTheDocument();
    });
});
