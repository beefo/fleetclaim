import React, { useState, useCallback, useEffect, useRef } from 'react';
import '@geotab/zenith/dist/index.css';
import {
    Header,
    Layout,
    Menu,
    Tabs,
    useMobile
} from '@geotab/zenith';
import { useGeotab } from '@/contexts';
import { useToast } from '@/hooks';
import { ReportsTab } from './ReportsTab';
import { RequestsTab } from './RequestsTab';
import { SettingsTab } from './SettingsTab';
import { ToastContainer } from './ToastContainer';
import { NewRequestModal } from './NewRequestModal';
import '../styles/app.css';

type TabId = 'reports' | 'requests' | 'settings';

const App: React.FC = () => {
    const isMobile = useMobile();
    const { session, api, captureCredentials, credentials } = useGeotab();
    const toast = useToast();
    const credentialAttempted = useRef(false);
    
    // Capture credentials after API is available
    // We try immediately and also after a delay to handle session warmup
    useEffect(() => {
        if (api && !credentials && !credentialAttempted.current) {
            credentialAttempted.current = true;
            
            // Try immediately
            captureCredentials().catch(() => {});
            
            // Also retry after a delay in case session needs warmup
            const timer = setTimeout(() => {
                captureCredentials().catch(() => {});
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [api, credentials, captureCredentials]);
    
    const [activeTab, setActiveTab] = useState<TabId>('reports');
    const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);

    const handleRefresh = useCallback(() => {
        // Will be passed to child components
        toast.info('Refreshing...', 2000);
    }, [toast]);

    const handleNewRequest = useCallback(() => {
        setIsNewRequestOpen(true);
    }, []);

    const handleRequestSubmitted = useCallback(() => {
        setIsNewRequestOpen(false);
        setActiveTab('requests');
        toast.success('Report request submitted');
    }, [toast]);

    const tabs = [
        { id: 'reports', name: 'Reports' },
        { id: 'requests', name: 'Requests' },
        { id: 'settings', name: 'Settings' }
    ];

    return (
        <Layout>
            <Header>
                <Header.Title pageName="FleetClaim" />
                <Header.Menu id="actions-menu" name="Actions">
                    <Menu.Item 
                        id="refresh" 
                        name="Refresh" 
                        onClick={handleRefresh} 
                    />
                    <Menu.Separator />
                    <Menu.Item 
                        id="help" 
                        name="Help & Documentation" 
                        onClick={() => window.open('https://github.com/beefo/fleetclaim', '_blank')} 
                    />
                </Header.Menu>
                <Header.Button 
                    id="new-request" 
                    type="primary" 
                    onClick={handleNewRequest}
                >
                    New Report Request
                </Header.Button>
            </Header>
            
            <Tabs
                tabs={tabs}
                activeTabId={activeTab}
                onTabChange={(tabId) => setActiveTab(tabId as TabId)}
            />
            
            <div className="fleetclaim-content">
                {activeTab === 'reports' && (
                    <ReportsTab onRefresh={handleRefresh} toast={toast} />
                )}
                {activeTab === 'requests' && (
                    <RequestsTab onRefresh={handleRefresh} toast={toast} />
                )}
                {activeTab === 'settings' && (
                    <SettingsTab toast={toast} />
                )}
            </div>
            
            <NewRequestModal
                isOpen={isNewRequestOpen}
                onClose={() => setIsNewRequestOpen(false)}
                onSubmit={handleRequestSubmitted}
                toast={toast}
            />
            
            <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        </Layout>
    );
};

export default App;
