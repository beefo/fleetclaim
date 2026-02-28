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
        console.error('[FleetClaim] Could not find element #' + ADDIN_NAME);
        return {};
    }
    
    function renderApp() {
        if (!reactRoot) {
            console.error('[FleetClaim] React root not initialized');
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
            console.error('[FleetClaim] Failed to render app', error);
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
            currentApi = freshApi;
            currentState = freshState;
            
            // Apply translations if available
            if (freshState.translate) {
                freshState.translate(elAddin);
            }
            
            // Create React root
            reactRoot = createRoot(elAddin);
            
            initializeCallback();
        },
        
        /**
         * Focus is called whenever the Add-In receives focus.
         */
        focus: function(freshApi: GeotabApi, freshState: GeotabPageState) {
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
            // Optionally unmount or just hide
            // We leave the app mounted to preserve state
        }
    };
};
