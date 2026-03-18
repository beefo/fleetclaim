import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { SubmissionsList } from '@/components/SubmissionsList';
import { createEmptySubmission } from '@/types';
import { saveSubmission } from '@/services/storageService';

jest.mock('@geotab/zenith', () => {
    const Card = ({ children }: any) => <div>{children}</div>;
    (Card as any).Content = ({ children }: any) => <div>{children}</div>;
    return {
        Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
        Card,
        Pill: ({ children }: any) => <span>{children}</span>
    };
});

describe('SubmissionsList', () => {
    it('refreshes status when submissions are updated in storage', async () => {
        const submission = createEmptySubmission('b1', 'Vehicle 001');
        submission.status = 'pending_sync';
        saveSubmission(submission);

        render(<SubmissionsList onBack={() => undefined} onResume={() => undefined} />);

        expect(screen.getByText('Pending Sync')).toBeInTheDocument();

        submission.status = 'synced';
        await act(async () => {
            saveSubmission(submission);
        });

        expect(await screen.findByText('Awaiting Merge')).toBeInTheDocument();
    });
});
