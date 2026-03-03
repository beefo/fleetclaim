import React, { useState, useEffect, useCallback } from 'react';
import {
    Card,
    Cards,
    ToggleButton,
    Button,
    Select
} from '@geotab/zenith';
import { useGeotab } from '@/contexts';

interface SettingsTabProps {
    toast: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
    };
}

interface Settings {
    autoRefresh: boolean;
    showNotifications: boolean;
    defaultDateRange: 'day' | 'week' | 'month' | 'year' | 'all';
    includeHistoricDevices: boolean;
}

const SETTINGS_KEY = 'fleetclaim_settings';

const defaultSettings: Settings = {
    autoRefresh: true,
    showNotifications: true,
    defaultDateRange: 'week',
    includeHistoricDevices: false
};

export const SettingsTab: React.FC<SettingsTabProps> = ({ toast }) => {
    const { session, loadDevices } = useGeotab();
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [hasChanges, setHasChanges] = useState(false);

    // Load settings from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                setSettings({ ...defaultSettings, ...JSON.parse(saved) });
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    }, []);

    const handleChange = useCallback((key: keyof Settings, value: unknown) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    }, []);

    const handleSave = useCallback(() => {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            setHasChanges(false);
            toast.success('Settings saved');
            
            // Apply settings that need immediate effect
            if (settings.includeHistoricDevices) {
                loadDevices(true);
            } else {
                loadDevices(false);
            }
        } catch (e) {
            toast.error('Failed to save settings');
        }
    }, [settings, toast, loadDevices]);

    const handleReset = useCallback(() => {
        setSettings(defaultSettings);
        setHasChanges(true);
    }, []);

    return (
        <div className="settings-tab">
            <Cards>
                <Card size="L" title="Preferences">
                    <Card.Content>
                        <div className="settings-form">
                            <div className="setting-item">
                                <div className="setting-label">
                                    <span className="setting-title">Auto-refresh</span>
                                    <span className="setting-description">
                                        Automatically refresh data when returning to the page
                                    </span>
                                </div>
                                <ToggleButton
                                    checked={settings.autoRefresh}
                                    onChange={() => handleChange('autoRefresh', !settings.autoRefresh)}
                                />
                            </div>
                            
                            <div className="setting-item">
                                <div className="setting-label">
                                    <span className="setting-title">Show notifications</span>
                                    <span className="setting-description">
                                        Display toast notifications for actions
                                    </span>
                                </div>
                                <ToggleButton
                                    checked={settings.showNotifications}
                                    onChange={() => handleChange('showNotifications', !settings.showNotifications)}
                                />
                            </div>
                            
                            <div className="setting-item">
                                <div className="setting-label">
                                    <span className="setting-title">Include historic devices</span>
                                    <span className="setting-description">
                                        Show inactive/historic devices in the vehicle list
                                    </span>
                                </div>
                                <ToggleButton
                                    checked={settings.includeHistoricDevices}
                                    onChange={() => handleChange('includeHistoricDevices', !settings.includeHistoricDevices)}
                                />
                            </div>
                            
                            <div className="setting-item">
                                <div className="setting-label">
                                    <span className="setting-title">Default date range</span>
                                    <span className="setting-description">
                                        Default filter for reports list
                                    </span>
                                </div>
                                <Select
                                    title=""
                                    value={settings.defaultDateRange}
                                    onChange={(id) => handleChange('defaultDateRange', id || 'week')}
                                    items={[
                                        { id: 'day', children: 'Last 24 hours' },
                                        { id: 'week', children: 'Last 7 days' },
                                        { id: 'month', children: 'Last 30 days' },
                                        { id: 'year', children: 'Last year' },
                                        { id: 'all', children: 'All time' }
                                    ] as any}
                                />
                            </div>
                        </div>
                        
                        <div className="settings-actions">
                            <Button type="tertiary" onClick={handleReset}>
                                Reset to defaults
                            </Button>
                            <Button 
                                type="primary" 
                                onClick={handleSave}
                                disabled={!hasChanges}
                            >
                                Save changes
                            </Button>
                        </div>
                    </Card.Content>
                </Card>
                
                <Card size="M" title="About">
                    <Card.Content>
                        <div className="about-section">
                            <h3>FleetClaim</h3>
                            <p>Automated incident evidence reports for fleet management</p>
                            <div className="about-details">
                                <div><strong>Version:</strong> 2.0.0 (React + Zenith)</div>
                                <div><strong>Database:</strong> {session?.database || 'N/A'}</div>
                                <div><strong>User:</strong> {session?.userName || 'N/A'}</div>
                            </div>
                            <div className="about-links">
                                <a 
                                    href="https://github.com/beefo/fleetclaim" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="zen-link"
                                >
                                    GitHub Repository
                                </a>
                                <a 
                                    href="https://github.com/beefo/fleetclaim/issues" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="zen-link"
                                >
                                    Report an Issue
                                </a>
                            </div>
                        </div>
                    </Card.Content>
                </Card>
            </Cards>

        </div>
    );
};
