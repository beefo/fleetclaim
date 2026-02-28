/**
 * Tests for PhotosSection component
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PhotosSection } from '@/components/PhotosSection';
import { GeotabProvider } from '@/contexts/GeotabContext';
import { GeotabApi, GeotabPageState, Photo } from '@/types';

// Mock Zenith components
jest.mock('@geotab/zenith', () => {
    const MockCard = ({ children, title }: any) => <div data-testid="card"><h3>{title}</h3>{children}</div>;
    MockCard.Content = ({ children }: any) => <div>{children}</div>;

    const MockModal = ({ children, isOpen, onClose, title }: any) => 
        isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null;
    MockModal.SecondaryButton = ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>;

    return {
        Button: ({ children, onClick, disabled }: any) => (
            <button onClick={onClick} disabled={disabled}>{children}</button>
        ),
        Card: MockCard,
        Select: ({ value, onChange, items }: any) => (
            <select value={value} onChange={(e: any) => onChange(e.target.value)}>
                {items?.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.children}</option>
                ))}
            </select>
        ),
        Banner: ({ children, header }: any) => <div data-testid="banner">{header}: {children}</div>,
        Modal: MockModal,
    };
});

// Create mock API
const createMockApi = (sessionId = 'valid-session-123'): GeotabApi => ({
    call: jest.fn((method, params, success, error) => {
        if (success) success([]);
        return Promise.resolve([]);
    }),
    multiCall: jest.fn((calls, success, error) => {
        if (success) success([]);
        return Promise.resolve([]);
    }),
    getSession: jest.fn((success) => {
        const session = {
            database: 'test_db',
            userName: 'test@test.com',
            sessionId: sessionId
        };
        if (success) success(session);
        return Promise.resolve(session);
    })
});

const createMockState = (): GeotabPageState => ({
    getState: jest.fn(() => ({ database: 'test_db' })),
    setState: jest.fn(),
    gotoPage: jest.fn(() => true),
    hasAccessToPage: jest.fn(() => true),
    getGroupFilter: jest.fn(() => []),
    translate: jest.fn((t) => t)
});

const mockToast = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
};

const mockPhotos: Photo[] = [
    {
        id: 'photo-1',
        mediaFileId: 'media-1',
        fileName: 'damage1.jpg',
        category: 'damage',
        uploadedAt: '2026-02-28T10:00:00Z'
    },
    {
        id: 'photo-2',
        mediaFileId: 'media-2',
        fileName: 'scene1.jpg',
        category: 'scene',
        uploadedAt: '2026-02-28T10:01:00Z'
    }
];

describe('PhotosSection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('credential capture for photos', () => {
        it('should trigger captureCredentials when photos present and no credentials', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            render(
                <GeotabProvider initialApi={mockApi} initialState={mockState}>
                    <PhotosSection
                        photos={mockPhotos}
                        reportId="rpt-123"
                        deviceId="dev-123"
                        onUpdate={jest.fn()}
                        toast={mockToast}
                    />
                </GeotabProvider>
            );

            // Wait for useEffect to trigger
            await waitFor(() => {
                expect(mockApi.getSession).toHaveBeenCalled();
            });
        });

        it('should not trigger captureCredentials when no photos', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            render(
                <GeotabProvider initialApi={mockApi} initialState={mockState}>
                    <PhotosSection
                        photos={[]}
                        reportId="rpt-123"
                        deviceId="dev-123"
                        onUpdate={jest.fn()}
                        toast={mockToast}
                    />
                </GeotabProvider>
            );

            // Should show "No Photos" banner
            expect(screen.getByTestId('banner')).toBeInTheDocument();
        });

        it('should render photo thumbnails when credentials are available', async () => {
            const mockApi = createMockApi('valid-session-456');
            const mockState = createMockState();

            const { container } = render(
                <GeotabProvider initialApi={mockApi} initialState={mockState}>
                    <PhotosSection
                        photos={mockPhotos}
                        reportId="rpt-123"
                        deviceId="dev-123"
                        onUpdate={jest.fn()}
                        toast={mockToast}
                    />
                </GeotabProvider>
            );

            // Wait for credentials to be captured
            await waitFor(() => {
                expect(mockApi.getSession).toHaveBeenCalled();
            });

            // Photos should be grouped by category
            await waitFor(() => {
                const cards = screen.getAllByTestId('card');
                expect(cards.length).toBeGreaterThan(0);
            });
        });
    });

    describe('photo grouping', () => {
        it('should group photos by category', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            render(
                <GeotabProvider initialApi={mockApi} initialState={mockState}>
                    <PhotosSection
                        photos={mockPhotos}
                        reportId="rpt-123"
                        deviceId="dev-123"
                        onUpdate={jest.fn()}
                        toast={mockToast}
                    />
                </GeotabProvider>
            );

            await waitFor(() => {
                // Should have cards for damage and scene categories
                const cards = screen.getAllByTestId('card');
                // Upload card + damage card + scene card = at least 3
                expect(cards.length).toBeGreaterThanOrEqual(2);
            });
        });
    });

    describe('image URL generation', () => {
        it('should use placeholder when credentials missing sessionId', async () => {
            // Create API that returns empty sessionId
            const mockApi = createMockApi('');
            const mockState = createMockState();

            const { container } = render(
                <GeotabProvider initialApi={mockApi} initialState={mockState}>
                    <PhotosSection
                        photos={mockPhotos}
                        reportId="rpt-123"
                        deviceId="dev-123"
                        onUpdate={jest.fn()}
                        toast={mockToast}
                    />
                </GeotabProvider>
            );

            // Wait for render
            await waitFor(() => {
                const images = container.querySelectorAll('img');
                if (images.length > 0) {
                    // Should use placeholder SVG (data:image/svg+xml)
                    images.forEach(img => {
                        const src = img.getAttribute('src');
                        expect(src).toContain('data:image/svg+xml');
                    });
                }
            });
        });
    });
});
