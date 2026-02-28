/**
 * Tests for ToastContainer component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from '@/components/ToastContainer';
import { Toast } from '@/hooks';

describe('ToastContainer', () => {
    const mockOnRemove = jest.fn();

    beforeEach(() => {
        mockOnRemove.mockClear();
    });

    it('should render nothing when toasts array is empty', () => {
        const { container } = render(
            <ToastContainer toasts={[]} onRemove={mockOnRemove} />
        );
        
        expect(container.firstChild).toBeNull();
    });

    it('should render toasts with correct messages', () => {
        const toasts: Toast[] = [
            { id: '1', type: 'success', message: 'Success message' },
            { id: '2', type: 'error', message: 'Error message' }
        ];

        render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);

        expect(screen.getByText('Success message')).toBeInTheDocument();
        expect(screen.getByText('Error message')).toBeInTheDocument();
    });

    it('should render correct icons for each toast type', () => {
        const toasts: Toast[] = [
            { id: '1', type: 'success', message: 'Success' },
            { id: '2', type: 'error', message: 'Error' },
            { id: '3', type: 'warning', message: 'Warning' },
            { id: '4', type: 'info', message: 'Info' }
        ];

        render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);

        expect(screen.getByText('✅')).toBeInTheDocument();
        expect(screen.getByText('❌')).toBeInTheDocument();
        expect(screen.getByText('⚠️')).toBeInTheDocument();
        expect(screen.getByText('ℹ️')).toBeInTheDocument();
    });

    it('should apply correct CSS class based on toast type', () => {
        const toasts: Toast[] = [
            { id: '1', type: 'success', message: 'Success' }
        ];

        const { container } = render(
            <ToastContainer toasts={toasts} onRemove={mockOnRemove} />
        );

        const toast = container.querySelector('.toast-success');
        expect(toast).toBeInTheDocument();
    });

    it('should call onRemove when toast is clicked', () => {
        const toasts: Toast[] = [
            { id: '1', type: 'info', message: 'Click me' }
        ];

        render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);

        fireEvent.click(screen.getByText('Click me'));
        
        expect(mockOnRemove).toHaveBeenCalledWith('1');
    });

    it('should call onRemove when close button is clicked', () => {
        const toasts: Toast[] = [
            { id: '1', type: 'info', message: 'Test' }
        ];

        render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);

        const closeButton = screen.getByRole('button');
        fireEvent.click(closeButton);
        
        expect(mockOnRemove).toHaveBeenCalledWith('1');
    });

    it('should stop propagation when close button is clicked', () => {
        const toasts: Toast[] = [
            { id: '1', type: 'info', message: 'Test' }
        ];

        render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);

        const closeButton = screen.getByRole('button');
        fireEvent.click(closeButton);
        
        // onRemove should only be called once (from close button, not from toast click)
        expect(mockOnRemove).toHaveBeenCalledTimes(1);
    });

    it('should render multiple toasts', () => {
        const toasts: Toast[] = [
            { id: '1', type: 'success', message: 'First' },
            { id: '2', type: 'error', message: 'Second' },
            { id: '3', type: 'warning', message: 'Third' }
        ];

        const { container } = render(
            <ToastContainer toasts={toasts} onRemove={mockOnRemove} />
        );

        const toastElements = container.querySelectorAll('.toast');
        expect(toastElements).toHaveLength(3);
    });
});
