/**
 * FleetClaim Add-In Entry Point
 * 
 * This file is the Webpack entry point for production builds.
 * It sets up the MyGeotab Add-In integration and React rendering.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { GeotabProvider } from '@/contexts';
import { App } from '@/components';
import { GeotabApi, GeotabPageState } from '@/types';
import './styles/app.css';

const ADDIN_NAME = 'fleetclaim';

// Ensure geotab global exists
if (typeof window !== 'undefined') {
    if (!window.geotab) {
        (window as any).geotab = { addin: {} };
    }
    if (!window.geotab.addin) {
        window.geotab.addin = {};
    }
}

/**
 * MyGeotab Add-In Registration
 */
(window as any).geotab.addin[ADDIN_NAME] = function(api: GeotabApi, state: GeotabPageState) {
    'use strict';
    
    let reactRoot: Root | null = null;
    let currentApi: GeotabApi = api;
    let currentState: GeotabPageState = state;
    const elAddin = document.getElementById(ADDIN_NAME);
    
    if (!elAddin) {
        console.error(`FleetClaim: Could not find element #${ADDIN_NAME}`);
        return {};
    }
    
    function renderApp() {
        if (!reactRoot) {
            console.error('FleetClaim: React root not initialized');
            return;
        }
        
        try {
            reactRoot.render(
                <React.StrictMode>
                    <GeotabProvider initialApi={currentApi} initialState={currentState}>
                        <App />
                    </GeotabProvider>
                </React.StrictMode>
            );
        } catch (error) {
            console.error('FleetClaim: Failed to render app', error);
        }
    }
    
    return {
        /**
         * Initialize is called once when the Add-In is first loaded.
         */
        initialize: function(
            freshApi: GeotabApi, 
            freshState: GeotabPageState, 
            initializeCallback: () => void
        ) {
            console.log('FleetClaim: Initializing...');
            
            // HACK: Try to find credentials through various means
            console.log("FleetClaim: Attempting to find session credentials...");
            
            // Method 1: Check window.geotab for any credential info
            const geotabGlobal = (window as any).geotab;
            console.log("FleetClaim: window.geotab keys:", geotabGlobal ? Object.keys(geotabGlobal) : "undefined");
            
            // Method 2: Check parent window (we're in an iframe)
            try {
                const parentGeotab = (window.parent as any).geotab;
                console.log("FleetClaim: parent.geotab keys:", parentGeotab ? Object.keys(parentGeotab) : "undefined");
            } catch (e) {
                console.log("FleetClaim: Cannot access parent window (cross-origin)");
            }
            
            // Method 3: Inspect the api object deeply
            console.log("FleetClaim: freshApi keys:", Object.keys(freshApi));
            console.log("FleetClaim: freshApi prototype:", Object.getPrototypeOf(freshApi));
            
            // Method 4: Check for any global credentials or session objects
            const windowKeys = Object.keys(window).filter(k => 
                k.toLowerCase().includes('session') || 
                k.toLowerCase().includes('cred') || 
                k.toLowerCase().includes('geotab') ||
                k.toLowerCase().includes('user')
            );
            console.log("FleetClaim: Interesting window keys:", windowKeys);
            
            // Method 5: Try to get credentials from localStorage/sessionStorage
            try {
                const storageKeys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
                const geotabStorageKeys = storageKeys.filter(k => k.toLowerCase().includes('geotab') || k.toLowerCase().includes('session'));
                console.log("FleetClaim: Geotab storage keys:", geotabStorageKeys);
                geotabStorageKeys.forEach(k => {
                    const val = localStorage.getItem(k) || sessionStorage.getItem(k);
                    console.log(`FleetClaim: Storage[${k}]:`, val?.substring(0, 200));
                });
            } catch (e) {
                console.log("FleetClaim: Cannot access storage");
            }
            
            // Method 6: Check cookies
            console.log("FleetClaim: Cookies:", document.cookie?.substring(0, 500) || "none");
            
            // Method 7: Try the standard getSession - NOTE: only ONE callback, no error callback!
            // getSession signature is getSession(callback, newSession?) where newSession is a boolean
            try {
                (freshApi as any).getSession(function(credentials: any, server: any) {
                    console.log("FleetClaim: getSession SUCCESS!", { 
                        database: credentials?.database,
                        userName: credentials?.userName,
                        hasSessionId: !!credentials?.sessionId,
                        server 
                    });
                });
            } catch (e) {
                console.log("FleetClaim: getSession threw:", e);
            }
            
            currentApi = freshApi;
            currentState = freshState;
            
            // Apply translations if available
            if (freshState.translate) {
                freshState.translate(elAddin);
            }
            
            // Create React root
            reactRoot = createRoot(elAddin);
            
            console.log('FleetClaim: Initialized');
            initializeCallback();
        },
        
        /**
         * Focus is called whenever the Add-In receives focus.
         */
        focus: function(freshApi: GeotabApi, freshState: GeotabPageState) {
            console.log('FleetClaim: Focused');
            
            currentApi = freshApi;
            currentState = freshState;
            
            // Remove hidden class if present
            elAddin.classList.remove('hidden');
            
            // Render or re-render the app
            renderApp();
        },
        
        /**
         * Blur is called when the user navigates away from the Add-In.
         */
        blur: function() {
            console.log('FleetClaim: Blurred');
            // Optionally unmount or just hide
            // We leave the app mounted to preserve state
        }
    };
};

console.log('FleetClaim Add-In loaded');
