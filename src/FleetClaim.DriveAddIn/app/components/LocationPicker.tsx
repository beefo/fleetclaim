/**
 * LocationPicker - Interactive map for selecting incident location
 * Uses Leaflet with OpenStreetMap tiles and Nominatim for reverse geocoding
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@geotab/zenith';

// Fix for default marker icons in webpack - use CDN URLs
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LocationPickerProps {
    latitude?: number;
    longitude?: number;
    address?: string;
    onLocationChange: (lat: number, lng: number, address?: string) => void;
    onRefreshLocation: () => Promise<{ latitude: number; longitude: number } | null>;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
    latitude,
    longitude,
    address,
    onLocationChange,
    onRefreshLocation
}) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const [displayAddress, setDisplayAddress] = useState<string>(address || '');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Default to Toronto area if no location
    const defaultLat = latitude || 43.65;
    const defaultLng = longitude || -79.38;

    // Reverse geocode using Nominatim (OpenStreetMap)
    const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
        try {
            setIsGeocoding(true);
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'FleetClaim-DriveAddIn/1.0'
                    }
                }
            );
            
            if (!response.ok) return '';
            
            const data = await response.json();
            
            if (data.address) {
                const addr = data.address;
                const parts: string[] = [];
                
                // Build a friendly address
                if (addr.house_number && addr.road) {
                    parts.push(`${addr.house_number} ${addr.road}`);
                } else if (addr.road) {
                    parts.push(addr.road);
                }
                
                if (addr.city || addr.town || addr.village) {
                    parts.push(addr.city || addr.town || addr.village);
                }
                
                if (addr.state || addr.province) {
                    parts.push(addr.state || addr.province);
                }
                
                return parts.length > 0 ? parts.join(', ') : (data.display_name?.split(',').slice(0, 3).join(',') || '');
            }
            
            return data.display_name?.split(',').slice(0, 3).join(',') || '';
        } catch (err) {
            console.error('[LocationPicker] Reverse geocode failed:', err);
            return '';
        } finally {
            setIsGeocoding(false);
        }
    }, []);

    // Update location and geocode
    const updateLocation = useCallback(async (lat: number, lng: number) => {
        const addr = await reverseGeocode(lat, lng);
        setDisplayAddress(addr);
        onLocationChange(lat, lng, addr || undefined);
    }, [reverseGeocode, onLocationChange]);

    // Initialize map
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        const map = L.map(mapContainerRef.current, {
            center: [defaultLat, defaultLng],
            zoom: 16,
            zoomControl: true,
            attributionControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(map);

        // Add draggable marker
        const marker = L.marker([defaultLat, defaultLng], {
            draggable: true,
            autoPan: true
        }).addTo(map);

        marker.on('dragend', async () => {
            const pos = marker.getLatLng();
            await updateLocation(pos.lat, pos.lng);
        });

        // Allow clicking on map to move marker
        map.on('click', async (e: L.LeafletMouseEvent) => {
            marker.setLatLng(e.latlng);
            await updateLocation(e.latlng.lat, e.latlng.lng);
        });

        mapRef.current = map;
        markerRef.current = marker;

        // Initial reverse geocode if we have coordinates but no address
        if (latitude && longitude && !address) {
            reverseGeocode(latitude, longitude).then(addr => {
                if (addr) {
                    setDisplayAddress(addr);
                    onLocationChange(latitude, longitude, addr);
                }
            });
        }

        // Cleanup
        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
        };
    }, []); // Only run once on mount

    // Update marker position when props change
    useEffect(() => {
        if (mapRef.current && markerRef.current && latitude && longitude) {
            const currentPos = markerRef.current.getLatLng();
            if (Math.abs(currentPos.lat - latitude) > 0.0001 || Math.abs(currentPos.lng - longitude) > 0.0001) {
                markerRef.current.setLatLng([latitude, longitude]);
                mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());
            }
        }
    }, [latitude, longitude]);

    // Update display address when prop changes
    useEffect(() => {
        if (address && address !== displayAddress) {
            setDisplayAddress(address);
        }
    }, [address]);

    const handleRefreshLocation = async () => {
        setIsRefreshing(true);
        try {
            const loc = await onRefreshLocation();
            if (loc && mapRef.current && markerRef.current) {
                markerRef.current.setLatLng([loc.latitude, loc.longitude]);
                mapRef.current.setView([loc.latitude, loc.longitude], 16);
                await updateLocation(loc.latitude, loc.longitude);
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="location-picker">
            <div 
                ref={mapContainerRef} 
                className="location-picker-map"
                style={{ height: '200px', width: '100%', borderRadius: '8px' }}
            />
            
            <div className="location-picker-address">
                {isGeocoding ? (
                    <span className="location-loading">Finding address...</span>
                ) : displayAddress ? (
                    <span className="location-text">
                        <span className="location-icon">📍</span> {displayAddress}
                    </span>
                ) : latitude && longitude ? (
                    <span className="location-coords">
                        {latitude.toFixed(5)}, {longitude.toFixed(5)}
                    </span>
                ) : (
                    <span className="location-empty">Tap map to set location</span>
                )}
            </div>

            <Button
                type="tertiary"
                onClick={handleRefreshLocation}
                disabled={isRefreshing}
                className="location-refresh-btn"
            >
                {isRefreshing ? 'Getting location...' : '🔄 Use Current Location'}
            </Button>
        </div>
    );
};
