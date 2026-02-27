import React, { useEffect, useRef, useMemo } from 'react';
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
 * Simple GPS Map component using OpenStreetMap tiles
 * Renders a static map with the GPS trail overlaid
 */
export const GpsMap: React.FC<GpsMapProps> = ({
    gpsTrail,
    incidentLocation,
    occurredAt,
    height = 250
}) => {
    // Convert height to number for calculations, default to 250 if 'auto'
    const numericHeight = typeof height === 'number' ? height : 250;
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Safety check for missing location data
    const hasValidLocation = incidentLocation?.latitude != null && incidentLocation?.longitude != null;
    
    // Early return if no valid location data
    if (!hasValidLocation && (!gpsTrail || gpsTrail.length === 0)) {
        return (
            <div className="gps-map gps-map-empty">
                <p>📍 Location data not available</p>
            </div>
        );
    }
    
    // Calculate bounds
    const bounds = useMemo(() => {
        if (!hasValidLocation && (!gpsTrail || gpsTrail.length === 0)) {
            // Default to a fallback location (0,0 or return empty)
            return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
        }
        
        const points = gpsTrail && gpsTrail.length > 0 
            ? gpsTrail 
            : hasValidLocation 
                ? [{ latitude: incidentLocation.latitude, longitude: incidentLocation.longitude }]
                : [];
        
        if (points.length === 0) {
            return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
        }
        
        const lats = points.map(p => p.latitude).filter(l => l != null);
        const lngs = points.map(p => p.longitude).filter(l => l != null);
        
        if (lats.length === 0 || lngs.length === 0) {
            return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
        }
        
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        
        // Add padding
        const latPadding = (maxLat - minLat) * 0.2 || 0.005;
        const lngPadding = (maxLng - minLng) * 0.2 || 0.005;
        
        return {
            minLat: minLat - latPadding,
            maxLat: maxLat + latPadding,
            minLng: minLng - lngPadding,
            maxLng: maxLng + lngPadding
        };
    }, [gpsTrail, incidentLocation]);

    // Calculate zoom level for OSM
    const zoom = useMemo(() => {
        const latDiff = bounds.maxLat - bounds.minLat;
        const lngDiff = bounds.maxLng - bounds.minLng;
        const maxDiff = Math.max(latDiff, lngDiff);
        
        // Approximate zoom level
        if (maxDiff > 0.5) return 10;
        if (maxDiff > 0.1) return 12;
        if (maxDiff > 0.05) return 13;
        if (maxDiff > 0.02) return 14;
        if (maxDiff > 0.01) return 15;
        return 16;
    }, [bounds]);

    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLng = (bounds.minLng + bounds.maxLng) / 2;

    // Generate static map URL with polyline path
    const staticMapUrl = useMemo(() => {
        // Use staticmaps.openweathermap.org or staticmap.openstreetmap.de
        // We'll use staticmap.openstreetmap.de which supports path/polyline
        const baseUrl = 'https://staticmap.openstreetmap.de/staticmap.php';
        
        // Build path from GPS trail (limit points for URL length)
        const maxPoints = 50;
        const step = Math.ceil(gpsTrail.length / maxPoints);
        const pathPoints = gpsTrail.filter((_, i) => i % step === 0 || i === gpsTrail.length - 1);
        
        // Build the path string (polyline): lat,lng;lat,lng;...
        const pathStr = pathPoints.map(p => `${p.latitude},${p.longitude}`).join(',');
        
        const params: Record<string, string> = {
            center: `${centerLat},${centerLng}`,
            zoom: zoom.toString(),
            size: '600x300',
            maptype: 'osmarenderer'
        };
        
        // Add path/polyline if we have GPS points
        if (pathPoints.length > 1) {
            params.path = pathStr;
            params.pathcolor = '0066ffff';  // Blue path
            params.pathweight = '3';
        }
        
        // Build query string
        const queryStr = Object.entries(params)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');
        
        // Add markers separately (they need different format)
        let markerStr = '';
        if (incidentLocation?.latitude && incidentLocation?.longitude) {
            markerStr = `&markers=${incidentLocation.latitude},${incidentLocation.longitude},red`;
        }
        // Add start marker (green)
        if (pathPoints.length > 0) {
            markerStr += `&markers=${pathPoints[0].latitude},${pathPoints[0].longitude},green`;
        }
        
        return `${baseUrl}?${queryStr}${markerStr}`;
    }, [centerLat, centerLng, zoom, incidentLocation, gpsTrail]);

    // Use OpenStreetMap embed with bounding box
    const osmEmbedUrl = useMemo(() => {
        // Create a bounding box for the embed
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        // OSM embed URL with marker
        const markerLat = incidentLocation?.latitude || centerLat;
        const markerLng = incidentLocation?.longitude || centerLng;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${markerLat},${markerLng}`;
    }, [bounds, incidentLocation, centerLat, centerLng]);

    // Render a clean OpenStreetMap embed - no overlay, details handled by parent
    // The parent .fc-map-container handles positioning; we just render the iframe
    return (
        <iframe 
            className="gps-map-iframe"
            src={osmEmbedUrl}
            title="GPS Trail Map"
            loading="lazy"
            style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '8px',
                display: 'block'
            }}
        />
    );
};
