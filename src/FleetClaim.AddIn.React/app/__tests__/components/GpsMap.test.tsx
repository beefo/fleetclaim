/**
 * Tests for GpsMap component using Leaflet
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { GpsMap } from '@/components/GpsMap';
import { GpsPoint } from '@/types';

// Mock Leaflet since it requires DOM APIs not available in jsdom
jest.mock('leaflet', () => ({
    map: jest.fn(() => ({
        fitBounds: jest.fn(),
        remove: jest.fn()
    })),
    tileLayer: jest.fn(() => ({
        addTo: jest.fn()
    })),
    polyline: jest.fn(() => ({
        addTo: jest.fn()
    })),
    marker: jest.fn(() => ({
        addTo: jest.fn(),
        bindPopup: jest.fn(() => ({
            addTo: jest.fn()
        }))
    })),
    divIcon: jest.fn(() => ({})),
    latLngBounds: jest.fn((points) => ({
        isValid: () => points.length > 0
    }))
}));

// Mock leaflet CSS
jest.mock('leaflet/dist/leaflet.css', () => ({}));

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

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render map container', () => {
        const { container } = render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const mapDiv = container.querySelector('.gps-map-leaflet');
        expect(mapDiv).toBeInTheDocument();
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
        const { container } = render(
            <GpsMap
                gpsTrail={[]}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const mapDiv = container.querySelector('.gps-map-leaflet');
        expect(mapDiv).toBeInTheDocument();
    });

    it('should render with only GPS trail (no incident location)', () => {
        const { container } = render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={{ latitude: null as any, longitude: null as any }}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const mapDiv = container.querySelector('.gps-map-leaflet');
        expect(mapDiv).toBeInTheDocument();
    });

    it('should have proper styling', () => {
        const { container } = render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        const mapDiv = container.querySelector('.gps-map-leaflet') as HTMLDivElement;
        expect(mapDiv.style.borderRadius).toBe('8px');
        expect(mapDiv.style.width).toBe('100%');
    });

    it('should accept custom height', () => {
        const { container } = render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
                height={400}
            />
        );

        const mapDiv = container.querySelector('.gps-map-leaflet') as HTMLDivElement;
        expect(mapDiv.style.height).toBe('400px');
    });

    it('should initialize Leaflet map with GPS data', () => {
        const L = require('leaflet');
        
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        // Leaflet should be initialized
        expect(L.map).toHaveBeenCalled();
        expect(L.tileLayer).toHaveBeenCalled();
    });

    it('should draw polyline for GPS trail', () => {
        const L = require('leaflet');
        
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        // Should create polyline for the trail
        expect(L.polyline).toHaveBeenCalled();
    });

    it('should create markers for trail start, end, and incident', () => {
        const L = require('leaflet');
        
        render(
            <GpsMap
                gpsTrail={mockGpsTrail}
                incidentLocation={mockIncidentLocation}
                occurredAt="2024-01-01T10:00:00Z"
            />
        );

        // Should create multiple markers
        expect(L.marker).toHaveBeenCalled();
        expect(L.divIcon).toHaveBeenCalled();
    });
});
