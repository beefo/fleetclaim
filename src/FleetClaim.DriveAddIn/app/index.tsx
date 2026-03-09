/**
 * FleetClaim Drive Add-In Entry Point
 *
 * Registers as a Geotab Drive Add-In with initialize, focus, blur, and startup hooks.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { DriveProvider } from '@/contexts';
import { DriveApp } from '@/components';
import { GeotabApi, GeotabPageState, DriveState } from '@/types';
import './styles/drive.css';

const ADDIN_NAME = 'FleetClaimDrive';
const ELEMENT_ID = 'fleetclaim-drive';

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
 * Geotab Drive Add-In Registration
 */
(window as any).geotab.addin[ADDIN_NAME] = function (api: GeotabApi, state: GeotabPageState) {
    'use strict';

    let reactRoot: Root | null = null;
    let currentApi: GeotabApi = api;
    let currentState: GeotabPageState = state;
    const elAddin = document.getElementById(ELEMENT_ID);

    if (!elAddin) {
        console.error('[FleetClaim Drive] Could not find element #' + ELEMENT_ID);
        return {};
    }

    function renderApp() {
        if (!reactRoot) {
            console.error('[FleetClaim Drive] React root not initialized');
            return;
        }

        try {
            reactRoot.render(
                <React.StrictMode>
                    <DriveProvider initialApi={currentApi} initialState={currentState}>
                        <DriveApp />
                    </DriveProvider>
                </React.StrictMode>
            );
        } catch (error) {
            console.error('[FleetClaim Drive] Failed to render app', error);
        }
    }

    return {
        /**
         * Called once when the Add-In is first loaded.
         */
        initialize: function (
            freshApi: GeotabApi,
            freshState: GeotabPageState,
            initializeCallback: () => void
        ) {
            currentApi = freshApi;
            currentState = freshState;

            if (freshState.translate) {
                freshState.translate(elAddin);
            }

            reactRoot = createRoot(elAddin);
            initializeCallback();
        },

        /**
         * Called whenever the Add-In receives focus.
         */
        focus: function (freshApi: GeotabApi, freshState: GeotabPageState) {
            currentApi = freshApi;
            currentState = freshState;
            elAddin.classList.remove('hidden');
            renderApp();
        },

        /**
         * Called when the user navigates away.
         */
        blur: function () {
            // Leave mounted to preserve state
        },

        /**
         * Called on driver login if onStartup: true in config.json.
         * Kicks off online-status monitoring for background sync.
         */
        startup: function (freshApi: GeotabApi, freshState: DriveState, callback: () => void) {
            currentApi = freshApi;
            currentState = freshState;
            console.log('[FleetClaim Drive] Startup - monitoring online status');
            callback();
        }
    };
};
