/**
 * Tests for GpsMap component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { GpsMap } from '@/components/GpsMap';
import { GpsPoint } from '@/types';

describe('GpsMap', () => {
    const mockIncidentLocation = {
        latitude: 43.45,
        longitude: -79.68
    };

    const mockGpsTrail: GpsPoint[] = [
        { latitude: 43.44, longitude: -79.67, timestamp: '2024-01-01T10:00:00Z', speedKmh: 50 },
        { latitude: 43.45, longitude: -79.68, timestamp: '2024-01-01T10:01:00Z', speedKmh: 45 },
        { latitude: 43.46, longitude: -79.69, timestamp: '2024-01-01T10:02:00Z', speedKmh: 40 }
    ];

    it('should render iframe with OpenStreetMap embed', () => {
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const iframe = screen.getByTitle('GPS Trail Map');
        expect(iframe).toBeInTheDocument();
        expect(iframe.tagName).toBe('IFRAME');
    });

    it('should include correct OSM embed URL', () => {
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const iframe = screen.getByTitle('GPS Trail Map') as HTMLIFrameElement;
        expect(iframe.src).toContain('openstreetmap.org/export/embed.html');
        expect(iframe.src).toContain('bbox=');
        // Markers are now drawn on canvas overlay, not in URL
    });

    it('should show empty state when no location data', () => {
        render(
            <GpsMap
                gpsTrail={[]}
                incidentLocation={{ latitude: null as any, longitude: null as any }}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        expect(screen.getByText(/Location data not available/)).toBeInTheDocument();
    });

    it('should render with only incident location (no GPS trail)', () => {
        render(
            <GpsMap
                gpsTrail={[]}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const iframe = screen.getByTitle('GPS Trail Map');
        expect(iframe).toBeInTheDocument();
    });

    it('should render with only GPS trail (no incident location)', () => {
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={{ latitude: null as any, longitude: null as any }}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const iframe = screen.getByTitle('GPS Trail Map');
        expect(iframe).toBeInTheDocument();
    });

    it('should have lazy loading attribute on iframe', () => {
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const iframe = screen.getByTitle('GPS Trail Map') as HTMLIFrameElement;
        // Check the attribute directly since JSDOM doesn't support the loading property
        expect(iframe.getAttribute('loading')).toBe('lazy');
    });

    it('should have border-radius style', () => {
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const iframe = screen.getByTitle('GPS Trail Map') as HTMLIFrameElement;
        expect(iframe.style.borderRadius).toBe('8px');
    });

    it('should render canvas overlay for drawing path and markers', () => {
        const { container } = render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        // Canvas should be rendered for drawing the GPS path
        const canvas = container.querySelector('canvas');
        expect(canvas).toBeInTheDocument();
        expect(canvas?.style.pointerEvents).toBe('none'); // Canvas shouldn't block map interaction
    });
});
