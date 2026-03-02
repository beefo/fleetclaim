import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GpsPoint } from '@/types';

interface GpsMapProps {
    gpsTrail: GpsPoint[];
    incidentLocation: {
        latitude: number;
        longitude: number;
    };
    occurredAt: string;
    height?: number | string;
}

/**
 * GPS Map component using Leaflet with OpenStreetMap tiles
 * Draws the full GPS trail as a polyline with proper markers
 */
export const GpsMap: React.FC<GpsMapProps> = ({
    gpsTrail,
    incidentLocation,
    occurredAt,
    height = 250
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMapRef = useRef<L.Map | null>(null);

    // Safety check for missing location data
    const hasValidLocation = incidentLocation?.latitude != null && incidentLocation?.longitude != null;
    const hasValidTrail = gpsTrail && gpsTrail.length > 0 && gpsTrail.some(p => p.latitude != null && p.longitude != null);
    
    // Debug logging
    console.log('[GpsMap] gpsTrail length:', gpsTrail?.length, 'hasValidTrail:', hasValidTrail, 'hasValidLocation:', hasValidLocation);
    if (gpsTrail?.length > 0) {
        console.log('[GpsMap] First point:', gpsTrail[0], 'Last point:', gpsTrail[gpsTrail.length - 1]);
    }
    
    // Early return if no valid location data
    if (!hasValidLocation && !hasValidTrail) {
        return (
            <div className="gps-map gps-map-empty">
                <p>📍 Location data not available</p>
            </div>
        );
    }

    // Calculate bounds including all GPS points and incident location
    const bounds = useMemo(() => {
        const points: [number, number][] = [];
        
        if (hasValidTrail) {
            gpsTrail
                .filter(p => p.latitude != null && p.longitude != null)
                .forEach(p => points.push([p.latitude, p.longitude]));
        }
        
        if (hasValidLocation) {
            points.push([incidentLocation.latitude, incidentLocation.longitude]);
        }
        
        if (points.length === 0) {
            return null;
        }
        
        return L.latLngBounds(points);
    }, [gpsTrail, incidentLocation, hasValidLocation, hasValidTrail]);

    // Initialize map
    useEffect(() => {
        if (!mapRef.current || !bounds) return;

        // Cleanup existing map
        if (leafletMapRef.current) {
            leafletMapRef.current.remove();
            leafletMapRef.current = null;
        }

        // Create map
        const map = L.map(mapRef.current, {
            zoomControl: true,
            attributionControl: true
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // Fit to bounds with padding
        map.fitBounds(bounds, { padding: [20, 20] });

        // Draw GPS trail as polyline
        if (hasValidTrail) {
            const validPoints = gpsTrail
                .filter(p => p.latitude != null && p.longitude != null)
                .map(p => [p.latitude, p.longitude] as [number, number]);

            if (validPoints.length > 1) {
                // Draw the path
                L.polyline(validPoints, {
                    color: '#0066ff',
                    weight: 4,
                    opacity: 0.8
                }).addTo(map);

                // Start marker (green)
                const startIcon = L.divIcon({
                    className: 'gps-marker-start',
                    html: '<div style="width:12px;height:12px;background:#22c55e;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                L.marker(validPoints[0], { icon: startIcon }).addTo(map);

                // End marker (orange) - only if different from start
                if (validPoints.length > 1) {
                    const endIcon = L.divIcon({
                        className: 'gps-marker-end',
                        html: '<div style="width:12px;height:12px;background:#f97316;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    });
                    L.marker(validPoints[validPoints.length - 1], { icon: endIcon }).addTo(map);
                }
            }
        }

        // Incident location marker (red pin)
        if (hasValidLocation) {
            const incidentIcon = L.divIcon({
                className: 'gps-marker-incident',
                html: '<div style="width:16px;height:16px;background:#ef4444;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;background:white;border-radius:50%;"></div></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            L.marker([incidentLocation.latitude, incidentLocation.longitude], { icon: incidentIcon })
                .bindPopup(`<b>Incident Location</b><br/>${new Date(occurredAt).toLocaleString()}`)
                .addTo(map);
        }

        leafletMapRef.current = map;

        // Cleanup on unmount
        return () => {
            if (leafletMapRef.current) {
                leafletMapRef.current.remove();
                leafletMapRef.current = null;
            }
        };
    }, [bounds, gpsTrail, incidentLocation, hasValidLocation, hasValidTrail, occurredAt]);

    return (
        <div 
            ref={mapRef}
            className="gps-map-leaflet"
            style={{ 
                width: '100%', 
                height: typeof height === 'number' ? `${height}px` : height,
                minHeight: '200px',
                borderRadius: '8px'
            }}
        />
    );
};
