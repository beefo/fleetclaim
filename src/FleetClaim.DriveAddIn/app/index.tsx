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

const ELEMENT_ID = 'fleetclaim-drive';

// Declare geotab global (provided by Geotab framework, but we need it for standalone testing)
declare const geotab: { addin: Record<string, unknown> };

/**
 * Geotab Drive Add-In Registration
 * 
 * The name "FleetClaimDrive" is derived from config.json "name": "FleetClaim Drive" (spaces removed).
 * Geotab framework provides the `geotab` global before loading our script.
 * 
 * IMPORTANT: Do NOT look up DOM elements at registration time.
 * The element only exists after Geotab loads the Add-In's HTML into the iframe.
 * Look up elements inside initialize() instead.
 */
geotab.addin.FleetClaimDrive = function () {
    'use strict';

    let reactRoot: Root | null = null;
    let elAddin: HTMLElement | null = null;
    let currentApi: GeotabApi | null = null;
    let currentState: GeotabPageState | null = null;

    function renderApp() {
        if (!reactRoot || !currentApi || !currentState || !elAddin) {
            console.error('[FleetClaim Drive] React root or context not initialized');
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
         * DOM element is now available.
         */
        initialize: function (
            freshApi: GeotabApi,
            freshState: GeotabPageState,
            initializeCallback: () => void
        ) {
            currentApi = freshApi;
            currentState = freshState;

            // Look up element HERE, not at registration time
            elAddin = document.getElementById(ELEMENT_ID);
            if (!elAddin) {
                console.error('[FleetClaim Drive] Could not find element #' + ELEMENT_ID);
                initializeCallback();
                return;
            }

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
            if (elAddin) {
                elAddin.classList.remove('hidden');
            }
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
