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
 * GPS Map component using OpenStreetMap tiles with canvas overlay for path
 * Draws the full GPS trail as a polyline on top of the map
 */
export const GpsMap: React.FC<GpsMapProps> = ({
    gpsTrail,
    incidentLocation,
    occurredAt,
    height = 250
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
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
    
    // Calculate bounds including all GPS points and incident location
    const bounds = useMemo(() => {
        const points: { latitude: number; longitude: number }[] = [];
        
        if (gpsTrail && gpsTrail.length > 0) {
            points.push(...gpsTrail.filter(p => p.latitude != null && p.longitude != null));
        }
        
        if (hasValidLocation) {
            points.push({ latitude: incidentLocation.latitude, longitude: incidentLocation.longitude });
        }
        
        if (points.length === 0) {
            return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
        }
        
        const lats = points.map(p => p.latitude);
        const lngs = points.map(p => p.longitude);
        
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        
        // Add padding (20% or minimum for single point)
        const latPadding = Math.max((maxLat - minLat) * 0.2, 0.002);
        const lngPadding = Math.max((maxLng - minLng) * 0.2, 0.002);
        
        return {
            minLat: minLat - latPadding,
            maxLat: maxLat + latPadding,
            minLng: minLng - lngPadding,
            maxLng: maxLng + lngPadding
        };
    }, [gpsTrail, incidentLocation, hasValidLocation]);

    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLng = (bounds.minLng + bounds.maxLng) / 2;

    // Convert lat/lng to canvas pixel coordinates
    const toPixel = (lat: number, lng: number, width: number, height: number) => {
        const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width;
        const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height; // Y is inverted
        return { x, y };
    };

    // Draw the path on canvas when map loads
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match container
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw GPS trail as a polyline
        if (gpsTrail && gpsTrail.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#0066ff';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const validPoints = gpsTrail.filter(p => p.latitude != null && p.longitude != null);
            
            if (validPoints.length > 0) {
                const first = toPixel(validPoints[0].latitude, validPoints[0].longitude, canvas.width, canvas.height);
                ctx.moveTo(first.x, first.y);

                for (let i = 1; i < validPoints.length; i++) {
                    const pt = toPixel(validPoints[i].latitude, validPoints[i].longitude, canvas.width, canvas.height);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();

                // Draw start point (green circle)
                ctx.beginPath();
                ctx.fillStyle = '#22c55e';
                ctx.arc(first.x, first.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw end point (last point in trail, orange)
                const last = toPixel(validPoints[validPoints.length - 1].latitude, validPoints[validPoints.length - 1].longitude, canvas.width, canvas.height);
                ctx.beginPath();
                ctx.fillStyle = '#f97316';
                ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        // Draw incident location marker (red)
        if (hasValidLocation) {
            const incident = toPixel(incidentLocation.latitude, incidentLocation.longitude, canvas.width, canvas.height);
            
            // Draw a pin-style marker
            ctx.beginPath();
            ctx.fillStyle = '#ef4444';
            ctx.arc(incident.x, incident.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Inner dot
            ctx.beginPath();
            ctx.fillStyle = '#fff';
            ctx.arc(incident.x, incident.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }, [gpsTrail, incidentLocation, bounds, hasValidLocation]);

    // Use OpenStreetMap embed with bounding box
    const osmEmbedUrl = useMemo(() => {
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`;
    }, [bounds]);

    return (
        <div 
            ref={containerRef}
            className="gps-map-container"
            style={{ position: 'relative', width: '100%', height: '100%' }}
        >
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
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    borderRadius: '8px'
                }}
            />
        </div>
    );
};
