/**
 * FleetClaim MyGeotab Add-In
 * 
 * Reads processed reports from AddInData and displays them.
 * Does NOT process incidents - that's handled by the backend worker.
 */

// Add-In ID for MyGeotab AddInData
const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';

// Backend API URL for fallback operations (photo upload, etc.)
const API_BASE_URL = 'https://fleetclaim-api-589116575765.us-central1.run.app';

// Geotab API instance (injected by MyGeotab)
let api = null;
let state = null;
let reports = [];
let requests = [];

// Stored credentials for MediaFile upload (captured from api.getSession)
let storedCredentials = null;
let geotabHost = null;

// Store AddInData records for delete operations
let reportRecords = {};  // Map of report.id -> AddInData record id
let requestRecords = {}; // Map of request.id -> AddInData record id

// Delete confirmation state
let pendingDelete = null;

// Ensure geotab object exists
if (typeof geotab === 'undefined') {
    window.geotab = { addin: {} };
}
if (!geotab.addin) {
    geotab.addin = {};
}

// Initialize the Add-In
// The function name MUST match the Add-In name (lowercased, spaces removed)
// For "FleetClaim" -> "fleetclaim"
geotab.addin.fleetclaim = function(geotabApi, pageState) {
    api = geotabApi;
    state = pageState;
    
    console.log('FleetClaim Add-In initializing...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeUI();
            loadGroups();
            loadDevices();
            loadReports();
            loadRequests();
        });
    } else {
        initializeUI();
        loadGroups();
        loadDevices();
        loadReports();
        loadRequests();
    }
    
    console.log('FleetClaim Add-In initialized');
};

// Focus handler - called when Add-In page becomes active
geotab.addin.fleetclaim.focus = function(geotabApi, pageState) {
    console.log('FleetClaim focused');
    api = geotabApi;
    state = pageState;
    
    // Capture credentials for MediaFile upload (following Geotab's mg-media-files example)
    captureCredentials();
    
    loadGroups();
    loadDevices();
    loadReports();
    loadRequests();
};

// Capture session credentials for MediaFile upload
// Following the exact pattern from Geotab's mg-media-files example:
// They call api.getSession() AFTER making API calls, in a .then() chain
function captureCredentials() {
    console.log('Attempting to capture credentials for MediaFile upload...');
    
    // The getSession must be called after API is "warmed up" with calls
    // We'll capture it here and it should work since loadReports() was just called
    if (api && typeof api.getSession === 'function') {
        api.getSession(function(session) {
            console.log('Session captured via api.getSession:', {
                server: session.server,
                database: session.credentials?.database || session.database,
                userName: session.credentials?.userName || session.userName,
                hasSessionId: !!(session.credentials?.sessionId || session.sessionId)
            });
            
            const getHost = (s) => {
                if (s && s.startsWith('http')) {
                    return new URL(s).hostname;
                }
                return s || document.location.hostname;
            };
            
            geotabHost = getHost(session.server);
            storedCredentials = session.credentials || session;
            
            console.log('Credentials stored for uploads:', {
                host: geotabHost,
                database: storedCredentials?.database,
                hasSessionId: !!storedCredentials?.sessionId
            });
        }, function(err) {
            console.warn('api.getSession failed:', err);
            console.warn('Photo uploads may not work without session credentials');
        });
    } else {
        console.warn('api.getSession not available');
    }
}

// Blur handler - called when user navigates away
geotab.addin.fleetclaim.blur = function() {
    console.log('FleetClaim blurred');
};

function initializeUI() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });
    
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadReports();
        loadRequests();
    });
    
    // Search and filters
    document.getElementById('search').addEventListener('input', filterAndSortReports);
    document.getElementById('group-filter')?.addEventListener('change', onGroupFilterChange);
    document.getElementById('severity-filter').addEventListener('change', filterAndSortReports);
    document.getElementById('date-filter').addEventListener('change', filterAndSortReports);
    document.getElementById('vehicle-filter')?.addEventListener('change', filterAndSortReports);
    document.getElementById('sort-by').addEventListener('change', filterAndSortReports);
    
    // Load saved preferences from localStorage
    loadFilterPreferences();
    
    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('report-modal').addEventListener('click', (e) => {
        if (e.target.id === 'report-modal') closeModal();
    });
    
    // Request modal
    document.getElementById('cancel-request').addEventListener('click', closeRequestModal);
    document.getElementById('submit-request').addEventListener('click', submitReportRequest);
    
    // Toggle state indicator
    const forceReportCheckbox = document.getElementById('force-report');
    const forceReportState = document.getElementById('force-report-state');
    if (forceReportCheckbox && forceReportState) {
        forceReportCheckbox.addEventListener('change', () => {
            forceReportState.textContent = forceReportCheckbox.checked ? 'ON' : 'OFF';
        });
    }
    
    // Delete modal
    document.getElementById('cancel-delete').addEventListener('click', closeDeleteModal);
    document.getElementById('confirm-delete').addEventListener('click', confirmDelete);
    
    // Email modal
    document.getElementById('cancel-email')?.addEventListener('click', closeEmailModal);
    document.getElementById('send-email')?.addEventListener('click', sendReportEmail);
    
    // Settings
    initializeSettingsUI();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function handleKeyboardShortcuts(e) {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }
    
    // R - Refresh
    if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        loadReports();
        loadRequests();
        showToast('Refreshed', 'info', 2000);
    }
    
    // N - New request
    if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        showRequestModal();
    }
    
    // Escape - Close modals
    if (e.key === 'Escape') {
        closeModal();
        closeRequestModal();
        closeDeleteModal();
        closeEmailModal();
    }
    
    // 1, 2, 3 - Switch tabs
    if (e.key === '1') {
        document.querySelector('.tab[data-tab="reports"]')?.click();
    }
    if (e.key === '2') {
        document.querySelector('.tab[data-tab="requests"]')?.click();
    }
    if (e.key === '3') {
        document.querySelector('.tab[data-tab="settings"]')?.click();
    }
}

// Load reports from AddInData
async function loadReports() {
    const listEl = document.getElementById('reports-list');
    listEl.innerHTML = '<div class="loading">Loading reports...</div>';
    
    try {
        const addInData = await apiCall('Get', {
            typeName: 'AddInData',
            search: { addInId: ADDIN_ID }
        });
        
        reportRecords = {}; // Reset mapping
        
        reports = addInData
            .map(item => {
                try {
                    // Geotab API returns 'details', not 'data'
                    const raw = item.details || item.data;
                    const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (wrapper && wrapper.type === 'report') {
                        const report = wrapper.payload || wrapper;
                        // Store mapping of report ID to AddInData record ID
                        reportRecords[report.id] = item.id;
                        return report;
                    }
                } catch (e) { console.warn('Error parsing report:', e); }
                return null;
            })
            .filter(r => r !== null);
        
        // Apply filters and sorting (respects user preferences)
        filterAndSortReports();
    } catch (err) {
        console.error('Error loading reports:', err);
        listEl.innerHTML = `<div class="empty-state"><h3>Error loading reports</h3><p>${err.message}</p></div>`;
    }
}

// Load pending requests from AddInData
async function loadRequests() {
    const listEl = document.getElementById('requests-list');
    listEl.innerHTML = '<div class="loading">Loading requests...</div>';
    console.log('FleetClaim: Loading requests...');
    
    try {
        const addInData = await apiCall('Get', {
            typeName: 'AddInData',
            search: { addInId: ADDIN_ID }
        });
        
        console.log('FleetClaim: Got', addInData.length, 'AddInData records');
        
        requestRecords = {}; // Reset mapping
        
        requests = addInData
            .map(item => {
                try {
                    // Geotab API returns 'details', not 'data'
                    const raw = item.details || item.data;
                    console.log('FleetClaim: Processing item:', raw);
                    const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (wrapper && wrapper.type === 'reportRequest') {
                        const request = wrapper.payload || wrapper;
                        // Store mapping of request ID to AddInData record ID
                        requestRecords[request.id] = item.id;
                        return request;
                    }
                } catch (e) { console.warn('FleetClaim: Error parsing request:', e); }
                return null;
            })
            .filter(r => r !== null);
        
        console.log('FleetClaim: Found', requests.length, 'requests');
        
        // Apply same sorting as reports
        const sortedRequests = sortRequests(requests);
        renderRequests(sortedRequests);
    } catch (err) {
        console.error('Error loading requests:', err);
        listEl.innerHTML = `<div class="empty-state"><h3>Error loading requests</h3><p>${err.message}</p></div>`;
    }
}

function renderReportsStats(filtered, total) {
    const statsEl = document.getElementById('reports-stats');
    if (!statsEl) return;
    
    const critical = filtered.filter(r => r.severity?.toLowerCase() === 'critical').length;
    const high = filtered.filter(r => r.severity?.toLowerCase() === 'high').length;
    const withNotes = filtered.filter(r => r.notes?.trim()).length;
    const recent = filtered.filter(r => r.generatedAt && (Date.now() - new Date(r.generatedAt).getTime()) < 24 * 60 * 60 * 1000).length;
    
    statsEl.innerHTML = `
        <div class="stats-bar">
            <span class="stat">📊 <strong>${filtered.length}</strong> reports${filtered.length !== total ? ` (${total} total)` : ''}</span>
            ${critical > 0 ? `<span class="stat stat-critical">🔴 ${critical} critical</span>` : ''}
            ${high > 0 ? `<span class="stat stat-high">🟠 ${high} high</span>` : ''}
            ${recent > 0 ? `<span class="stat stat-new">✨ ${recent} new today</span>` : ''}
            ${withNotes > 0 ? `<span class="stat">📝 ${withNotes} with notes</span>` : ''}
        </div>
    `;
}

function renderReports(reportsToRender) {
    const listEl = document.getElementById('reports-list');
    
    if (reportsToRender.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <h3>No reports yet</h3>
                <p>Reports will appear here when incidents are detected and processed by FleetClaim.</p>
            </div>`;
        return;
    }
    
    listEl.innerHTML = reportsToRender.map(report => {
        const isBaseline = report.isBaselineReport || (report.incidentId && report.incidentId.startsWith('baseline_'));
        const isNew = report.generatedAt && (Date.now() - new Date(report.generatedAt).getTime()) < 24 * 60 * 60 * 1000;
        const hasNotes = report.notes && report.notes.trim().length > 0;
        return `
        <div class="report-card" data-id="${report.id}">
            <div class="report-info">
                <div class="report-title">
                    ${isBaseline ? '📋' : '⚠️'} ${escapeHtml(report.summary || 'Incident Report')}
                    ${isNew ? '<span class="badge badge-new">NEW</span>' : ''}
                    ${hasNotes ? '<span class="badge badge-notes" title="Has notes">📝</span>' : ''}
                </div>
                <div class="report-meta">
                    <span>🚗 ${escapeHtml(report.vehicleName || report.vehicleId || 'Unknown')}</span>
                    <span>👤 ${escapeHtml(report.driverName || 'Unknown Driver')}</span>
                    <span>📅 ${formatDate(report.occurredAt)}</span>
                    ${isBaseline ? '<span class="baseline-tag">Baseline</span>' : ''}
                </div>
            </div>
            <div class="card-actions">
                <span class="severity severity-${(report.severity || 'medium').toLowerCase()}">
                    ${report.severity || 'Medium'}
                </span>
                <button class="btn-delete" data-delete-report="${report.id}" title="Delete report">🗑️</button>
            </div>
        </div>
    `}).join('');
    
    // Add click handlers for report cards
    listEl.querySelectorAll('.report-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't open detail if clicking delete button
            if (e.target.closest('.btn-delete')) return;
            const report = reports.find(r => r.id === card.dataset.id);
            if (report) showReportDetail(report);
        });
    });
    
    // Add click handlers for delete buttons
    listEl.querySelectorAll('.btn-delete[data-delete-report]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const reportId = btn.dataset.deleteReport;
            const report = reports.find(r => r.id === reportId);
            if (report) {
                showDeleteConfirmation('report', reportId, report.summary || 'Incident Report');
            }
        });
    });
}

function renderRequests(requestsToRender) {
    const listEl = document.getElementById('requests-list');
    
    if (requestsToRender.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <h3>No pending requests</h3>
                <p>Request collision reports for any vehicle and date range.</p>
                <button class="btn btn-primary" onclick="showRequestModal()">+ Request Report</button>
            </div>`;
        return;
    }
    
    listEl.innerHTML = `
        <div style="margin-bottom: 16px;">
            <button class="btn btn-primary" onclick="showRequestModal()">+ Request Report</button>
        </div>
    ` + requestsToRender.map(req => {
        const status = (req.status || 'pending').toLowerCase();
        const canDelete = status === 'completed' || status === 'failed';
        return `
        <div class="report-card" data-request-id="${req.id}">
            <div class="report-info">
                <div class="report-title">🚗 ${escapeHtml(req.deviceName || req.deviceId || 'Unknown Vehicle')}</div>
                <div class="report-meta">
                    <span>📅 ${formatDate(req.fromDate)} - ${formatDate(req.toDate)}</span>
                    <span>By: ${escapeHtml(req.requestedBy || 'Unknown')}</span>
                    ${req.incidentsFound !== undefined ? `<span>Found: ${req.incidentsFound} incidents</span>` : ''}
                </div>
            </div>
            <div class="card-actions">
                <span class="status status-${status}">
                    ${req.status || 'Pending'}
                </span>
                ${canDelete ? `<button class="btn-delete" data-delete-request="${req.id}" title="Delete request">🗑️</button>` : ''}
            </div>
        </div>
    `}).join('');
    
    // Add click handlers for delete buttons
    listEl.querySelectorAll('.btn-delete[data-delete-request]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const requestId = btn.dataset.deleteRequest;
            const request = requests.find(r => r.id === requestId);
            if (request) {
                showDeleteConfirmation('request', requestId, request.deviceName || 'Request');
            }
        });
    });
}

function showReportDetail(report) {
    const detailEl = document.getElementById('report-detail');
    const evidence = report.evidence || {};
    
    const isBaseline = report.isBaselineReport || (report.incidentId && report.incidentId.startsWith('baseline_'));
    
    detailEl.innerHTML = `
        <div class="report-detail-header">
            <h2>${escapeHtml(report.summary || 'Incident Report')}</h2>
            <span class="severity severity-${(report.severity || 'medium').toLowerCase()}">
                ${report.severity || 'Medium'}
            </span>
            ${isBaseline ? '<span class="baseline-badge">📋 Baseline Report</span>' : ''}
        </div>
        
        ${isBaseline ? `
        <div class="baseline-notice">
            <strong>ℹ️ Baseline Report:</strong> This report was generated manually without a collision event trigger. 
            It documents vehicle data for the requested time period for reference purposes.
        </div>
        ` : ''}
        
        <div class="report-section">
            <h3>${isBaseline ? 'Vehicle Details' : 'Incident Details'}</h3>
            <div class="evidence-grid">
                <div class="evidence-item">
                    <label>Vehicle</label>
                    <div class="value">${escapeHtml(report.vehicleName || report.vehicleId || 'Unknown')}</div>
                </div>
                <div class="evidence-item">
                    <label>Driver</label>
                    <div class="value">${escapeHtml(report.driverName || 'Unknown')}</div>
                </div>
                <div class="evidence-item">
                    <label>Occurred</label>
                    <div class="value">${formatDate(report.occurredAt)}</div>
                </div>
                <div class="evidence-item">
                    <label>Report Generated</label>
                    <div class="value">${formatDate(report.generatedAt)}</div>
                </div>
            </div>
        </div>
        
        <div class="report-section">
            <h3>Evidence</h3>
            <div class="evidence-grid">
                <div class="evidence-item">
                    <label>Speed at Event</label>
                    <div class="value">${evidence.speedAtEventKmh?.toFixed(0) || '—'} km/h</div>
                </div>
                <div class="evidence-item">
                    <label>Max Speed</label>
                    <div class="value">${evidence.maxSpeedKmh?.toFixed(0) || '—'} km/h</div>
                </div>
                <div class="evidence-item">
                    <label>Deceleration</label>
                    <div class="value">${evidence.decelerationMps2?.toFixed(1) || '—'} m/s²</div>
                </div>
                <div class="evidence-item">
                    <label>Weather</label>
                    <div class="value">${escapeHtml(evidence.weatherCondition || 'Unknown')}</div>
                </div>
                <div class="evidence-item">
                    <label>Temperature</label>
                    <div class="value">${evidence.temperatureCelsius?.toFixed(0) || '—'}°C</div>
                </div>
                <div class="evidence-item">
                    <label>GPS Points</label>
                    <div class="value">${evidence.gpsTrail?.length || 0}</div>
                </div>
            </div>
        </div>
        
        ${(evidence.gpsTrail && evidence.gpsTrail.length > 0) ? `
        <div class="report-section">
            <h3>🗺️ GPS Trail <span style="font-weight:normal;font-size:0.9em">(${evidence.gpsTrail.length} points)</span></h3>
            <div id="map-container" class="map-container">
                <div class="map-loading">Loading map...</div>
            </div>
        </div>
        ` : ''}
        
        <div class="report-section">
            <h3>📝 Notes & Driver Statement</h3>
            <p class="notes-hint">Add incident details, driver statements, or context for insurance claims.</p>
            <textarea id="report-notes" class="notes-textarea" placeholder="Enter notes about this incident...">${escapeHtml(report.notes || '')}</textarea>
            <div class="notes-actions">
                <button class="btn btn-secondary" onclick="saveReportNotes('${report.id}')">💾 Save Notes</button>
                <span id="notes-status" class="notes-status"></span>
                ${report.notesUpdatedAt ? `<span class="notes-meta">Last updated: ${formatDate(report.notesUpdatedAt)}</span>` : ''}
            </div>
        </div>
        
        <div class="report-section collapsible">
            <h3 onclick="toggleSection(this)">📷 Photo Evidence <span class="toggle-icon">▼</span></h3>
            <div class="section-content collapsed">
                <p class="section-hint">Attach photos of vehicle damage, scene, documents, etc. Photos are stored in Geotab.</p>
                
                <div class="photo-upload-area">
                    <input type="file" id="photo-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple style="display:none">
                    <button class="btn btn-secondary" onclick="document.getElementById('photo-input').click()">
                        📷 Add Photos
                    </button>
                    <select id="photo-category" class="filter-select" style="margin-left: 10px;">
                        <option value="VehicleDamage">Vehicle Damage</option>
                        <option value="SceneOverview">Scene Overview</option>
                        <option value="OtherVehicle">Other Vehicle</option>
                        <option value="RoadCondition">Road Condition</option>
                        <option value="WeatherCondition">Weather</option>
                        <option value="PoliceReport">Police Report</option>
                        <option value="InsuranceDocument">Insurance Doc</option>
                        <option value="General">General</option>
                    </select>
                </div>
                
                <div id="photo-upload-progress" class="photo-upload-progress" style="display:none;">
                    <div class="progress-bar"><div class="progress-fill"></div></div>
                    <span class="progress-text">Uploading...</span>
                </div>
                
                <div id="photos-grid" class="photos-grid">
                    ${renderPhotosGrid(evidence.photos || [])}
                </div>
                
                <span id="photo-status" class="notes-status"></span>
            </div>
        </div>
        
        <div class="report-section collapsible">
            <h3 onclick="toggleSection(this)">🚗 Third Party Information <span class="toggle-icon">▼</span></h3>
            <div class="section-content collapsed">
                <p class="section-hint">Add information about other vehicles/parties involved (for insurance claims).</p>
                <div class="third-party-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Vehicle Plate</label>
                            <input type="text" id="tp-plate" value="${escapeHtml(report.thirdParties?.[0]?.vehiclePlate || '')}" placeholder="ABC-1234">
                        </div>
                        <div class="form-group">
                            <label>Make/Model</label>
                            <input type="text" id="tp-vehicle" value="${escapeHtml((report.thirdParties?.[0]?.vehicleMake || '') + ' ' + (report.thirdParties?.[0]?.vehicleModel || '')).trim()}" placeholder="Toyota Camry">
                        </div>
                        <div class="form-group">
                            <label>Color</label>
                            <input type="text" id="tp-color" value="${escapeHtml(report.thirdParties?.[0]?.vehicleColor || '')}" placeholder="Blue">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Driver Name</label>
                            <input type="text" id="tp-driver" value="${escapeHtml(report.thirdParties?.[0]?.driverName || '')}" placeholder="John Smith">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" id="tp-phone" value="${escapeHtml(report.thirdParties?.[0]?.driverPhone || '')}" placeholder="555-1234">
                        </div>
                        <div class="form-group">
                            <label>Insurance Company</label>
                            <input type="text" id="tp-insurance" value="${escapeHtml(report.thirdParties?.[0]?.insuranceCompany || '')}" placeholder="State Farm">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Policy Number</label>
                        <input type="text" id="tp-policy" value="${escapeHtml(report.thirdParties?.[0]?.insurancePolicy || '')}" placeholder="POL-12345">
                    </div>
                    <button class="btn btn-secondary" onclick="saveThirdPartyInfo('${report.id}')">💾 Save Third Party Info</button>
                    <span id="tp-status" class="notes-status"></span>
                </div>
            </div>
        </div>
        
        <div class="report-actions">
            ${report.shareUrl ? `
                <button class="btn btn-primary" onclick="downloadPdfForReport('${report.id}')">📄 Download PDF</button>
                <button class="btn btn-secondary" onclick="copyShareLink('${report.shareUrl}')">🔗 Copy Share Link</button>
                <button class="btn btn-secondary" onclick="showEmailModal('${report.id}')">📧 Send to Email</button>
            ` : `
                <div class="legacy-report-notice">
                    <p>⚠️ This report was generated before PDF support was added.</p>
                    <button class="btn btn-primary" onclick="regenerateReport('${report.id}')">🔄 Regenerate Report with PDF</button>
                </div>
            `}
        </div>
    `;
    
    document.getElementById('report-modal').classList.remove('hidden');
    
    // Render map if GPS data available
    if (evidence.gpsTrail && evidence.gpsTrail.length > 0) {
        setTimeout(() => renderGpsMap(evidence.gpsTrail, report.occurredAt), 100);
    }
    
    // Load photo thumbnails
    const photos = evidence.photos || [];
    if (photos.length > 0) {
        // Small delay to let DOM render first
        setTimeout(() => loadPhotoThumbnails(photos), 100);
    }
    
    // Set up photo upload handler
    const photoInput = document.getElementById('photo-input');
    if (photoInput) {
        photoInput.onchange = () => handlePhotoUpload(report.id, report.vehicleId);
    }
}

// Toggle collapsible sections
function toggleSection(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        icon.textContent = '▲';
    } else {
        content.classList.add('collapsed');
        icon.textContent = '▼';
    }
}

// Save third party info
async function saveThirdPartyInfo(reportId) {
    const statusEl = document.getElementById('tp-status');
    statusEl.textContent = 'Saving...';
    statusEl.className = 'notes-status';
    
    const thirdParty = {
        vehiclePlate: document.getElementById('tp-plate').value.trim(),
        vehicleMake: document.getElementById('tp-vehicle').value.trim().split(' ')[0] || '',
        vehicleModel: document.getElementById('tp-vehicle').value.trim().split(' ').slice(1).join(' ') || '',
        vehicleColor: document.getElementById('tp-color').value.trim(),
        driverName: document.getElementById('tp-driver').value.trim(),
        driverPhone: document.getElementById('tp-phone').value.trim(),
        insuranceCompany: document.getElementById('tp-insurance').value.trim(),
        insurancePolicy: document.getElementById('tp-policy').value.trim()
    };
    
    try {
        const results = await new Promise((resolve, reject) => {
            api.call('Get', {
                typeName: 'AddInData',
                search: { addInId: ADDIN_ID }
            }, resolve, reject);
        });
        
        let reportRecord = null;
        let reportWrapper = null;
        
        for (const item of results) {
            try {
                const wrapper = typeof item.details === 'string' 
                    ? JSON.parse(item.details) 
                    : item.details;
                
                if (wrapper.type === 'report' && wrapper.payload.id === reportId) {
                    reportRecord = item;
                    reportWrapper = wrapper;
                    break;
                }
            } catch (e) {}
        }
        
        if (!reportRecord || !reportWrapper) {
            throw new Error('Report not found');
        }
        
        // Update third parties (replace first or add)
        reportWrapper.payload.thirdParties = [thirdParty];
        
        // Remove old and add updated
        await new Promise((resolve, reject) => {
            api.call('Remove', {
                typeName: 'AddInData',
                entity: { id: reportRecord.id }
            }, resolve, reject);
        });
        
        await new Promise((resolve, reject) => {
            api.call('Add', {
                typeName: 'AddInData',
                entity: {
                    addInId: ADDIN_ID,
                    details: reportWrapper
                }
            }, resolve, reject);
        });
        
        // Update local state
        const localReport = reports.find(r => r.id === reportId);
        if (localReport) {
            localReport.thirdParties = [thirdParty];
        }
        
        statusEl.textContent = '✓ Saved!';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
        console.error('Error saving third party info:', err);
        statusEl.textContent = '✗ Failed to save';
        statusEl.className = 'notes-status error';
    }
}

// ============================================
// PHOTO UPLOAD FUNCTIONS (MediaFile API)
// ============================================

// FleetClaim Solution ID for MediaFile API 
// Generated using Geotab's recommended method (base64 encoded GUID with 'a' prefix)
// This must match the ADDIN_ID or be a valid SolutionId
const FLEETCLAIM_SOLUTION_ID = ADDIN_ID; // Use same ID as AddInData for simplicity

// Render photos grid
function renderPhotosGrid(photos) {
    if (!photos || photos.length === 0) {
        return '<p class="no-photos">No photos attached yet.</p>';
    }
    
    return photos.map(photo => `
        <div class="photo-card" data-media-id="${photo.mediaFileId}">
            <div class="photo-thumbnail" onclick="viewPhoto('${photo.mediaFileId}')">
                <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" 
                     data-media-id="${photo.mediaFileId}" 
                     alt="${escapeHtml(photo.fileName)}"
                     class="photo-img">
                <div class="photo-loading">Loading...</div>
            </div>
            <div class="photo-meta">
                <span class="photo-category-badge">${formatPhotoCategory(photo.category)}</span>
                <span class="photo-filename">${escapeHtml(photo.fileName)}</span>
                ${photo.caption ? `<span class="photo-caption">${escapeHtml(photo.caption)}</span>` : ''}
            </div>
            <button class="photo-delete" onclick="deletePhoto('${photo.mediaFileId}')" title="Delete photo">×</button>
        </div>
    `).join('');
}

function formatPhotoCategory(category) {
    const labels = {
        'VehicleDamage': '🚗 Damage',
        'SceneOverview': '📸 Scene',
        'OtherVehicle': '🚙 Other Vehicle',
        'RoadCondition': '🛣️ Road',
        'WeatherCondition': '🌧️ Weather',
        'PoliceReport': '👮 Police',
        'InsuranceDocument': '📄 Insurance',
        'General': '📷 Photo'
    };
    return labels[category] || labels['General'];
}

// Handle photo file selection and upload
async function handlePhotoUpload(reportId, deviceId) {
    const input = document.getElementById('photo-input');
    const progressEl = document.getElementById('photo-upload-progress');
    const statusEl = document.getElementById('photo-status');
    const category = document.getElementById('photo-category').value;
    
    if (!input.files || input.files.length === 0) return;
    
    progressEl.style.display = 'block';
    statusEl.textContent = '';
    
    const uploadedPhotos = [];
    
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const progressText = progressEl.querySelector('.progress-text');
        const progressFill = progressEl.querySelector('.progress-fill');
        
        progressText.textContent = `Uploading ${i + 1}/${input.files.length}: ${file.name}`;
        progressFill.style.width = `${((i + 1) / input.files.length) * 100}%`;
        
        try {
            const mediaFileId = await uploadPhotoToGeotab(file, deviceId, reportId, category);
            if (mediaFileId) {
                uploadedPhotos.push({
                    mediaFileId: mediaFileId,
                    fileName: file.name,
                    contentType: file.type || 'image/jpeg',
                    category: category,
                    uploadedAt: new Date().toISOString()
                });
            }
        } catch (err) {
            console.error('Error uploading photo:', err);
            statusEl.textContent = `Failed to upload ${file.name}: ${err.message}`;
            statusEl.className = 'notes-status error';
        }
    }
    
    progressEl.style.display = 'none';
    input.value = ''; // Reset file input
    
    if (uploadedPhotos.length > 0) {
        // Save photo references to report
        await savePhotosToReport(reportId, uploadedPhotos);
        
        // Refresh the photos grid
        const photosGrid = document.getElementById('photos-grid');
        const report = reports.find(r => r.id === reportId);
        if (report && photosGrid) {
            const photos = report.evidence?.photos || [];
            photosGrid.innerHTML = renderPhotosGrid(photos);
            loadPhotoThumbnails(photos);
        }
        
        statusEl.textContent = `✓ Uploaded ${uploadedPhotos.length} photo(s)`;
        statusEl.className = 'notes-status';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
}

// Upload a single photo to Geotab MediaFile API
// First tries direct upload (like Geotab's example), falls back to backend API
async function uploadPhotoToGeotab(file, deviceId, reportId, category) {
    console.log('Uploading photo:', file.name);
    
    // Step 1: Create MediaFile entity via Geotab API
    // Add timestamp to filename to avoid DuplicateException
    const baseName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
    const ext = baseName.includes('.') ? baseName.substring(baseName.lastIndexOf('.')) : '';
    const nameWithoutExt = baseName.includes('.') ? baseName.substring(0, baseName.lastIndexOf('.')) : baseName;
    const fileName = `${nameWithoutExt}_${Date.now()}${ext}`;
    
    const mediaFile = {
        name: fileName,
        solutionId: FLEETCLAIM_SOLUTION_ID,
        fromDate: new Date().toISOString(),
        toDate: new Date().toISOString(),
        mediaType: 'Image',
        metaData: JSON.stringify({
            reportId: reportId,
            category: category,
            uploadedAt: new Date().toISOString(),
            originalName: file.name,
            size: file.size
        })
    };
    
    console.log('Creating MediaFile entity:', mediaFile);
    
    let mediaFileId;
    try {
        mediaFileId = await new Promise((resolve, reject) => {
            api.call('Add', {
                typeName: 'MediaFile',
                entity: mediaFile
            }, resolve, reject);
        });
        console.log('MediaFile created:', mediaFileId);
    } catch (err) {
        console.error('Failed to create MediaFile:', err);
        throw new Error('Failed to create media file: ' + (err?.message || JSON.stringify(err)));
    }
    
    // Step 2: Upload binary file
    // Check if we have stored credentials from getSession
    if (storedCredentials && storedCredentials.sessionId && geotabHost) {
        console.log('Uploading binary via direct Geotab API...');
        try {
            await uploadBinaryToGeotab(file, mediaFileId, fileName);
            return mediaFileId;
        } catch (uploadErr) {
            console.error('Direct upload failed:', uploadErr);
            // Don't fallback to backend, just report the error
            // Clean up the MediaFile entity
            try {
                await new Promise((resolve, reject) => {
                    api.call('Remove', { typeName: 'MediaFile', entity: { id: mediaFileId } }, resolve, reject);
                });
            } catch (e) {}
            throw uploadErr;
        }
    } else {
        // No session credentials - backend will create AND upload
        // Clean up our MediaFile since backend will create its own
        console.log('No session credentials, deleting our MediaFile and using backend API...');
        try {
            await new Promise((resolve, reject) => {
                api.call('Remove', { typeName: 'MediaFile', entity: { id: mediaFileId } }, resolve, reject);
            });
        } catch (e) {
            console.warn('Could not delete MediaFile:', e);
        }
        
        try {
            // Pass null mediaFileId so backend creates its own
            const result = await uploadViaBackendApi(file, null, reportId, category);
            return result.mediaFileId;
        } catch (backendErr) {
            console.error('Backend upload failed:', backendErr);
            throw backendErr;
        }
    }
}

// Upload binary to Geotab using XMLHttpRequest (matching Geotab's official example exactly)
async function uploadBinaryToGeotab(file, mediaFileId, fileName) {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        
        // JSON-RPC parameters (MUST be URL encoded per Geotab example)
        const parameters = {
            method: 'UploadMediaFile',
            params: {
                credentials: storedCredentials,
                mediaFile: { id: mediaFileId }
            }
        };
        
        fd.append('JSON-RPC', encodeURIComponent(JSON.stringify(parameters)));
        fd.append(fileName, file, fileName);
        
        const xhr = new XMLHttpRequest();
        
        xhr.addEventListener('load', function(e) {
            if (e.target && e.target.responseText) {
                try {
                    const jsonResponse = JSON.parse(e.target.responseText);
                    if (jsonResponse.error) {
                        reject(new Error(jsonResponse.error.message || JSON.stringify(jsonResponse.error)));
                    } else {
                        console.log('Upload success:', jsonResponse);
                        resolve(jsonResponse);
                    }
                } catch (parseErr) {
                    // Non-JSON response might be OK
                    resolve(e.target.responseText);
                }
            } else {
                reject(new Error('Empty response from upload'));
            }
        });
        
        xhr.addEventListener('error', function(e) {
            reject(new Error('Network error during upload'));
        });
        
        const uploadUrl = `https://${geotabHost}/apiv1/`;
        console.log('Uploading to:', uploadUrl);
        
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Accept', 'application/json, */*;q=0.8');
        xhr.send(fd);
    });
}

// Fallback: Upload via FleetClaim backend API
async function uploadViaBackendApi(file, mediaFileId, reportId, category) {
    const urlMatch = window.location.href.match(/my\.geotab\.com\/([^\/\#]+)/);
    const database = urlMatch ? urlMatch[1] : null;
    
    if (!database) {
        throw new Error('Could not determine database from URL');
    }
    
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('database', database);
    formData.append('reportId', reportId);
    formData.append('category', category);
    // Only append mediaFileId if it's a valid ID (not null)
    if (mediaFileId) {
        formData.append('mediaFileId', mediaFileId);
    }
    
    const response = await fetch(`${API_BASE_URL}/api/photos/upload`, {
        method: 'POST',
        headers: { 'X-Database': database },
        body: formData
    });
    
    const result = await response.json();
    
    if (!response.ok) {
        throw new Error(result.error || result.detail || 'Backend upload failed');
    }
    
    return result;
}

// Save photo references to the report's AddInData
async function savePhotosToReport(reportId, newPhotos) {
    try {
        const results = await new Promise((resolve, reject) => {
            api.call('Get', {
                typeName: 'AddInData',
                search: { addInId: ADDIN_ID }
            }, resolve, reject);
        });
        
        let reportRecord = null;
        let reportWrapper = null;
        
        for (const item of results) {
            try {
                const wrapper = typeof item.details === 'string' 
                    ? JSON.parse(item.details) 
                    : item.details;
                
                if (wrapper.type === 'report' && wrapper.payload.id === reportId) {
                    reportRecord = item;
                    reportWrapper = wrapper;
                    break;
                }
            } catch (e) {}
        }
        
        if (!reportRecord || !reportWrapper) {
            throw new Error('Report not found');
        }
        
        // Initialize photos array if needed
        if (!reportWrapper.payload.evidence) {
            reportWrapper.payload.evidence = {};
        }
        if (!reportWrapper.payload.evidence.photos) {
            reportWrapper.payload.evidence.photos = [];
        }
        
        // Add new photos
        reportWrapper.payload.evidence.photos.push(...newPhotos);
        
        // Update AddInData
        await new Promise((resolve, reject) => {
            api.call('Remove', {
                typeName: 'AddInData',
                entity: { id: reportRecord.id }
            }, resolve, reject);
        });
        
        await new Promise((resolve, reject) => {
            api.call('Add', {
                typeName: 'AddInData',
                entity: {
                    addInId: ADDIN_ID,
                    details: reportWrapper
                }
            }, resolve, reject);
        });
        
        // Update local state
        const localReport = reports.find(r => r.id === reportId);
        if (localReport) {
            if (!localReport.evidence) localReport.evidence = {};
            if (!localReport.evidence.photos) localReport.evidence.photos = [];
            localReport.evidence.photos.push(...newPhotos);
        }
        
    } catch (err) {
        console.error('Error saving photos to report:', err);
        throw err;
    }
}

// Load photo thumbnails from Geotab MediaFile API
async function loadPhotoThumbnails(photos) {
    if (!photos || photos.length === 0) return;
    
    console.log(`Loading ${photos.length} photo thumbnails...`);
    
    // Get database from URL
    const urlMatch = window.location.href.match(/my\.geotab\.com\/([^\/\#]+)/);
    const database = urlMatch ? urlMatch[1] : null;
    console.log('Database for photo fetch:', database);
    
    for (const photo of photos) {
        try {
            const imgEl = document.querySelector(`img[data-media-id="${photo.mediaFileId}"]`);
            if (!imgEl) {
                console.log(`No img element found for mediaFileId: ${photo.mediaFileId}`);
                continue;
            }
            
            const url = `${API_BASE_URL}/api/photos/${encodeURIComponent(photo.mediaFileId)}`;
            console.log('Fetching photo:', url);
            
            // Use backend API to fetch photo (handles Geotab auth)
            const response = await fetch(url, {
                headers: { 'X-Database': database }
            });
            
            console.log(`Photo response: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const blob = await response.blob();
                console.log(`Photo blob: ${blob.size} bytes, type: ${blob.type}`);
                imgEl.src = URL.createObjectURL(blob);
                const loadingEl = imgEl.parentElement?.querySelector('.photo-loading');
                if (loadingEl) loadingEl.style.display = 'none';
            } else {
                console.error('Photo fetch failed:', response.status, await response.text());
                imgEl.alt = '📷 Photo';
                const loadingEl = imgEl.parentElement?.querySelector('.photo-loading');
                if (loadingEl) loadingEl.textContent = '📷';
            }
        } catch (err) {
            console.error('Error loading photo thumbnail:', err);
            const imgEl = document.querySelector(`img[data-media-id="${photo.mediaFileId}"]`);
            if (imgEl) {
                imgEl.alt = '📷';
                const loadingEl = imgEl.parentElement?.querySelector('.photo-loading');
                if (loadingEl) loadingEl.textContent = '📷';
            }
        }
    }
    console.log('Photo thumbnail loading complete');
}

// View full-size photo
function viewPhoto(mediaFileId) {
    // Get database from URL
    const urlMatch = window.location.href.match(/my\.geotab\.com\/([^\/\#]+)/);
    const database = urlMatch ? urlMatch[1] : null;
    
    console.log('viewPhoto called:', { mediaFileId, database, url: window.location.href });
    
    if (!database) {
        console.error('Could not extract database from URL');
        alert('Could not load photo - database not found');
        return;
    }
    
    if (!mediaFileId) {
        console.error('No mediaFileId provided');
        alert('Could not load photo - invalid photo ID');
        return;
    }
    
    const photoUrl = `${API_BASE_URL}/api/photos/${encodeURIComponent(mediaFileId)}`;
    console.log('Fetching photo:', photoUrl);
    
    // Fetch via backend API and open in new tab
    fetch(photoUrl, {
        headers: { 'X-Database': database }
    })
    .then(response => {
        console.log('Photo response:', response.status, response.statusText);
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`${response.status}: ${text}`);
            });
        }
        return response.blob();
    })
    .then(blob => {
        console.log('Photo blob:', blob.size, blob.type);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    })
    .catch(err => {
        console.error('Error opening photo:', err);
        alert('Could not load photo: ' + err.message);
    });
}

// Delete photo from report and Geotab
async function deletePhoto(mediaFileId) {
    if (!confirm('Delete this photo?')) return;
    
    const statusEl = document.getElementById('photo-status');
    statusEl.textContent = 'Deleting...';
    
    try {
        // Find which report has this photo
        let targetReport = null;
        let photoIndex = -1;
        
        for (const report of reports) {
            const photos = report.evidence?.photos || [];
            const idx = photos.findIndex(p => p.mediaFileId === mediaFileId);
            if (idx >= 0) {
                targetReport = report;
                photoIndex = idx;
                break;
            }
        }
        
        if (!targetReport || photoIndex < 0) {
            throw new Error('Photo not found in any report');
        }
        
        // Remove from MediaFile API
        try {
            await new Promise((resolve, reject) => {
                api.call('Remove', {
                    typeName: 'MediaFile',
                    entity: { id: mediaFileId }
                }, resolve, reject);
            });
        } catch (err) {
            console.warn('Could not delete MediaFile (may already be deleted):', err);
        }
        
        // Remove from report's photo list
        targetReport.evidence.photos.splice(photoIndex, 1);
        
        // Update AddInData
        const results = await new Promise((resolve, reject) => {
            api.call('Get', {
                typeName: 'AddInData',
                search: { addInId: ADDIN_ID }
            }, resolve, reject);
        });
        
        for (const item of results) {
            try {
                const wrapper = typeof item.details === 'string' 
                    ? JSON.parse(item.details) 
                    : item.details;
                
                if (wrapper.type === 'report' && wrapper.payload.id === targetReport.id) {
                    wrapper.payload.evidence.photos = targetReport.evidence.photos;
                    
                    await new Promise((resolve, reject) => {
                        api.call('Remove', {
                            typeName: 'AddInData',
                            entity: { id: item.id }
                        }, resolve, reject);
                    });
                    
                    await new Promise((resolve, reject) => {
                        api.call('Add', {
                            typeName: 'AddInData',
                            entity: {
                                addInId: ADDIN_ID,
                                details: wrapper
                            }
                        }, resolve, reject);
                    });
                    break;
                }
            } catch (e) {}
        }
        
        // Remove from UI
        const photoCard = document.querySelector(`.photo-card[data-media-id="${mediaFileId}"]`);
        if (photoCard) photoCard.remove();
        
        // Check if grid is now empty
        const photosGrid = document.getElementById('photos-grid');
        if (photosGrid && photosGrid.children.length === 0) {
            photosGrid.innerHTML = '<p class="no-photos">No photos attached yet.</p>';
        }
        
        statusEl.textContent = '✓ Photo deleted';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
        
    } catch (err) {
        console.error('Error deleting photo:', err);
        statusEl.textContent = '✗ Failed to delete';
        statusEl.className = 'notes-status error';
    }
}

// ============================================

// Render GPS trail on a Leaflet map
function renderGpsMap(gpsTrail, occurredAt) {
    const container = document.getElementById('map-container');
    if (!container || !window.L) {
        // Leaflet not loaded yet - show static fallback
        if (container) {
            const center = gpsTrail[Math.floor(gpsTrail.length / 2)];
            container.innerHTML = `
                <div class="map-static">
                    <p>📍 ${gpsTrail.length} GPS points recorded</p>
                    <p>Center: ${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}</p>
                    <a href="https://www.google.com/maps?q=${center.latitude},${center.longitude}" target="_blank" class="btn btn-secondary">
                        🗺️ Open in Google Maps
                    </a>
                </div>
            `;
        }
        return;
    }
    
    container.innerHTML = '<div id="gps-map" style="height: 300px; width: 100%;"></div>';
    
    // Calculate center
    const lats = gpsTrail.map(p => p.latitude);
    const lngs = gpsTrail.map(p => p.longitude);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    
    const map = L.map('gps-map').setView([centerLat, centerLng], 14);
    
    // Add OpenStreetMap tiles (free)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Draw the GPS trail as a polyline
    const coordinates = gpsTrail.map(p => [p.latitude, p.longitude]);
    const polyline = L.polyline(coordinates, { color: '#2563eb', weight: 4 }).addTo(map);
    
    // Add markers for start, end, and incident point
    if (gpsTrail.length > 0) {
        const start = gpsTrail[0];
        const end = gpsTrail[gpsTrail.length - 1];
        
        // Find point closest to occurred time
        let incidentPoint = start;
        if (occurredAt) {
            const occurredTime = new Date(occurredAt).getTime();
            incidentPoint = gpsTrail.reduce((closest, point) => {
                const pointTime = new Date(point.timestamp).getTime();
                const closestTime = new Date(closest.timestamp).getTime();
                return Math.abs(pointTime - occurredTime) < Math.abs(closestTime - occurredTime) ? point : closest;
            }, start);
        }
        
        L.marker([start.latitude, start.longitude], {
            icon: L.divIcon({ className: 'map-marker map-marker-start', html: '🟢' })
        }).addTo(map).bindPopup('Start');
        
        L.marker([end.latitude, end.longitude], {
            icon: L.divIcon({ className: 'map-marker map-marker-end', html: '🏁' })
        }).addTo(map).bindPopup('End');
        
        L.marker([incidentPoint.latitude, incidentPoint.longitude], {
            icon: L.divIcon({ className: 'map-marker map-marker-incident', html: '⚠️' })
        }).addTo(map).bindPopup(`Incident Point<br>Speed: ${incidentPoint.speedKmh?.toFixed(0) || '?'} km/h`);
    }
    
    // Fit bounds to show entire trail
    map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
}

// Save notes for a report
async function saveReportNotes(reportId) {
    const notesEl = document.getElementById('report-notes');
    const statusEl = document.getElementById('notes-status');
    const notes = notesEl.value.trim();
    
    statusEl.textContent = 'Saving...';
    statusEl.className = 'notes-status';
    
    try {
        // Find the report's AddInData record
        const results = await new Promise((resolve, reject) => {
            api.call('Get', {
                typeName: 'AddInData',
                search: { addInId: ADDIN_ID }
            }, resolve, reject);
        });
        
        let reportRecord = null;
        let reportWrapper = null;
        
        for (const item of results) {
            try {
                const wrapper = typeof item.details === 'string' 
                    ? JSON.parse(item.details) 
                    : item.details;
                
                if (wrapper.type === 'report' && wrapper.payload.id === reportId) {
                    reportRecord = item;
                    reportWrapper = wrapper;
                    break;
                }
            } catch (e) {}
        }
        
        if (!reportRecord || !reportWrapper) {
            throw new Error('Report not found');
        }
        
        // Update notes
        reportWrapper.payload.notes = notes;
        reportWrapper.payload.notesUpdatedAt = new Date().toISOString();
        reportWrapper.payload.notesUpdatedBy = 'FleetClaim User'; // Could get from Geotab session
        
        // Remove old record and add updated one (Geotab's Set creates duplicates)
        await new Promise((resolve, reject) => {
            api.call('Remove', {
                typeName: 'AddInData',
                entity: { id: reportRecord.id }
            }, resolve, reject);
        });
        
        await new Promise((resolve, reject) => {
            api.call('Add', {
                typeName: 'AddInData',
                entity: {
                    addInId: ADDIN_ID,
                    details: reportWrapper
                }
            }, resolve, reject);
        });
        
        // Update local state
        const localReport = reports.find(r => r.id === reportId);
        if (localReport) {
            localReport.notes = notes;
            localReport.notesUpdatedAt = reportWrapper.payload.notesUpdatedAt;
        }
        
        statusEl.textContent = '✓ Saved!';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
        console.error('Error saving notes:', err);
        statusEl.textContent = '✗ Failed to save';
        statusEl.className = 'notes-status error';
    }
}

// Download PDF for a report by ID
async function downloadPdfForReport(reportId) {
    const report = reports.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }
    
    if (!report.shareUrl) {
        showToast('PDF not available — request a new report for this time period', 'info', 5000);
        // Pre-fill the request modal with this report's data
        prefillRequestModal(report);
        return;
    }
    
    await downloadPdf(report.shareUrl);
}

// Email modal state
let emailReportId = null;

function showEmailModal(reportId) {
    emailReportId = reportId;
    const report = reports.find(r => r.id === reportId);
    
    // Pre-fill with configured notification emails if available
    if (config.notifyEmails && config.notifyEmails.length > 0) {
        document.getElementById('email-recipient').value = config.notifyEmails[0];
    } else {
        document.getElementById('email-recipient').value = '';
    }
    
    // Default message
    document.getElementById('email-message').value = 
        `Please find the FleetClaim incident report for ${report?.vehicleName || 'the vehicle'} (${formatDate(report?.occurredAt)}).\n\nClick the link below to view the full report with GPS data, speed analysis, and weather conditions.`;
    
    document.getElementById('email-modal').classList.remove('hidden');
}

function closeEmailModal() {
    document.getElementById('email-modal').classList.add('hidden');
    emailReportId = null;
}

async function sendReportEmail() {
    const email = document.getElementById('email-recipient').value.trim();
    const message = document.getElementById('email-message').value.trim();
    
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    const report = reports.find(r => r.id === emailReportId);
    if (!report || !report.shareUrl) {
        showToast('Report not found or has no share link', 'error');
        return;
    }
    
    const sendBtn = document.getElementById('send-email');
    sendBtn.disabled = true;
    sendBtn.textContent = '📤 Sending...';
    
    try {
        // Send via backend API (uses SendGrid)
        const emailUrl = report.shareUrl + '/email';
        
        const response = await fetch(emailUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                message: message
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const result = await response.json();
        closeEmailModal();
        showToast(`✅ ${result.message || 'Email sent successfully!'}`, 'success', 4000);
    } catch (err) {
        console.error('Email send error:', err);
        // Fallback to mailto if API fails
        const subject = encodeURIComponent(`FleetClaim Incident Report: ${report.vehicleName || report.vehicleId}`);
        const body = encodeURIComponent(`${message}\n\n🔗 View Report: ${report.shareUrl}\n\n---\nGenerated by FleetClaim`);
        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
        showToast('Email service unavailable. Opened your email client instead.', 'warning', 4000);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '📤 Send Email';
    }
}

// Pre-fill request modal with report data (for regenerating old reports)
function prefillRequestModal(report) {
    showRequestModal();
    
    // Pre-select the vehicle
    const deviceSelect = document.getElementById('device-select');
    if (report.vehicleId) {
        deviceSelect.value = report.vehicleId;
    }
    
    // Pre-fill time range (1 hour before and after occurred time)
    if (report.occurredAt) {
        const occurred = new Date(report.occurredAt);
        const from = new Date(occurred.getTime() - 30 * 60 * 1000); // 30 min before
        const to = new Date(occurred.getTime() + 30 * 60 * 1000);   // 30 min after
        
        // Format for datetime-local
        const formatDatetime = (d) => {
            const pad = (n) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        
        document.getElementById('from-datetime').value = formatDatetime(from);
        document.getElementById('to-datetime').value = formatDatetime(to);
    }
    
    // Enable force report since we're regenerating
    document.getElementById('force-report').checked = true;
    updateForceReportState();
    
    showToast('Pre-filled with old report data. Submit to generate new PDF.', 'info', 4000);
}

// Download PDF from API using signed share URL
async function downloadPdf(shareUrl) {
    // shareUrl is like https://fleetclaim-api.../r/TOKEN
    // PDF endpoint is shareUrl + /pdf
    const pdfUrl = shareUrl + '/pdf';
    
    try {
        // Show loading state
        const btn = document.querySelector('.report-actions .btn-primary');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Generating...';
        btn.disabled = true;
        
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`Failed to generate PDF: ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // Download - extract report ID from URL for filename
        const reportId = shareUrl.split('/').pop()?.substring(0, 16) || 'report';
        const a = document.createElement('a');
        a.href = url;
        a.download = `fleetclaim-report-${reportId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        btn.textContent = originalText;
        btn.disabled = false;
    } catch (err) {
        console.error('Error downloading PDF:', err);
        showToast('Failed to download PDF: ' + err.message, 'error');
        
        const btn = document.querySelector('.report-actions .btn-primary');
        if (btn) {
            btn.textContent = '📄 Download PDF';
            btn.disabled = false;
        }
    }
}

function closeModal() {
    document.getElementById('report-modal').classList.add('hidden');
}

// Cache for devices and groups
let devices = [];
let groups = [];
let deviceGroupMap = {}; // deviceId -> [groupIds]

async function loadGroups() {
    try {
        groups = await apiCall('Get', { typeName: 'Group' });
        // Filter to just the user-visible groups (exclude system groups)
        groups = groups.filter(g => g.id && !g.id.startsWith('Group') || g.name);
        groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        const select = document.getElementById('group-filter');
        if (select) {
            select.innerHTML = '<option value="">All Groups</option>' +
                groups.map(g => `<option value="${g.id}">${escapeHtml(g.name || g.id)}</option>`).join('');
        }
    } catch (err) {
        console.error('Error loading groups:', err);
    }
}

async function loadDevices() {
    try {
        devices = await apiCall('Get', { typeName: 'Device' });
        devices.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        // Build device -> groups mapping
        deviceGroupMap = {};
        devices.forEach(d => {
            deviceGroupMap[d.id] = (d.groups || []).map(g => g.id);
        });
        
        updateDeviceSelects();
    } catch (err) {
        console.error('Error loading devices:', err);
    }
}

function updateDeviceSelects() {
    const selectedGroup = document.getElementById('group-filter')?.value || '';
    
    // Filter devices by selected group
    let filteredDevices = devices;
    if (selectedGroup) {
        filteredDevices = devices.filter(d => {
            const deviceGroups = deviceGroupMap[d.id] || [];
            return deviceGroups.includes(selectedGroup);
        });
    }
    
    // Update vehicle filter dropdown
    const vehicleFilter = document.getElementById('vehicle-filter');
    if (vehicleFilter) {
        const currentValue = vehicleFilter.value;
        vehicleFilter.innerHTML = '<option value="">All Vehicles</option>' +
            filteredDevices.map(d => `<option value="${d.id}">${escapeHtml(d.name || d.id)}</option>`).join('');
        // Restore selection if still valid
        if (filteredDevices.some(d => d.id === currentValue)) {
            vehicleFilter.value = currentValue;
        }
    }
    
    // Update device select in request modal
    const deviceSelect = document.getElementById('device-select');
    if (deviceSelect) {
        const currentValue = deviceSelect.value;
        deviceSelect.innerHTML = '<option value="">Select a vehicle...</option>' +
            filteredDevices.map(d => `<option value="${d.id}">${escapeHtml(d.name || d.id)}</option>`).join('');
        // Restore selection if still valid
        if (filteredDevices.some(d => d.id === currentValue)) {
            deviceSelect.value = currentValue;
        }
    }
}

function showRequestModal() {
    document.getElementById('request-modal').classList.remove('hidden');
    
    // Set default times (last 1 hour)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDatetime = (d) => {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    
    document.getElementById('to-datetime').value = formatDatetime(now);
    document.getElementById('from-datetime').value = formatDatetime(oneHourAgo);
    
    // Load devices if not already loaded
    if (devices.length === 0) {
        loadDevices();
    }
}

function closeRequestModal() {
    document.getElementById('request-modal').classList.add('hidden');
}

function updateForceReportState() {
    const checkbox = document.getElementById('force-report');
    const stateEl = document.getElementById('force-report-state');
    if (checkbox && stateEl) {
        stateEl.textContent = checkbox.checked ? 'ON' : 'OFF';
    }
}

function regenerateReport(reportId) {
    const report = reports.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }
    
    // Close detail modal
    closeModal();
    
    // Open request modal
    document.getElementById('request-modal').classList.remove('hidden');
    
    // Prefill with report data
    const occurredAt = new Date(report.occurredAt);
    const oneHourBefore = new Date(occurredAt.getTime() - 30 * 60 * 1000);
    const oneHourAfter = new Date(occurredAt.getTime() + 30 * 60 * 1000);
    
    const formatDatetime = (d) => {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    
    document.getElementById('from-datetime').value = formatDatetime(oneHourBefore);
    document.getElementById('to-datetime').value = formatDatetime(oneHourAfter);
    document.getElementById('force-report').checked = true;
    updateForceReportState();
    
    // Try to select the device
    if (report.vehicleId) {
        const deviceSelect = document.getElementById('device-select');
        // Load devices first if needed
        if (devices.length === 0) {
            loadDevices().then(() => {
                deviceSelect.value = report.vehicleId;
            });
        } else {
            deviceSelect.value = report.vehicleId;
        }
    }
    
    showToast('Prefilled request - adjust if needed and submit', 'info', 3000);
}

async function submitReportRequest() {
    const deviceId = document.getElementById('device-select').value;
    const fromDatetime = document.getElementById('from-datetime').value;
    const toDatetime = document.getElementById('to-datetime').value;
    const forceReport = document.getElementById('force-report').checked;
    
    if (!deviceId) {
        showToast('Please select a vehicle', 'error');
        return;
    }
    if (!fromDatetime || !toDatetime) {
        showToast('Please select both from and to times', 'error');
        return;
    }
    
    const selectedDevice = devices.find(d => d.id === deviceId);
    
    try {
        // Get current user from stored credentials or API
        let userEmail = storedCredentials?.userName || 'unknown';
        
        // If we don't have stored credentials, try getting from API
        if (userEmail === 'unknown') {
            try {
                const users = await apiCall('Get', {
                    typeName: 'User',
                    search: { name: api.userName }
                });
                userEmail = users[0]?.name || 'unknown';
            } catch (e) {
                console.warn('Could not get user name:', e);
            }
        }
        
        // Create request record
        const request = {
            type: 'reportRequest',
            payload: {
                id: `req_${Date.now().toString(36)}`,
                deviceId: deviceId,
                deviceName: selectedDevice?.name || deviceId,
                fromDate: new Date(fromDatetime).toISOString(),
                toDate: new Date(toDatetime).toISOString(),
                requestedBy: userEmail,
                requestedAt: new Date().toISOString(),
                status: 'Pending',
                forceReport: forceReport  // Generate report even without collision event
            }
        };
        
        await apiCall('Add', {
            typeName: 'AddInData',
            entity: {
                addInId: ADDIN_ID,
                details: request
            }
        });
        
        closeRequestModal();
        
        // Switch to Pending Requests tab to show the new request
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.tab[data-tab="requests"]').classList.add('active');
        document.getElementById('requests-tab').classList.add('active');
        
        await loadRequests();
        
        showToast('Report requested! Worker processes every 2 minutes.', 'success', 4000);
        
        // Start auto-refresh polling to detect when report is ready
        startRequestPolling(request.payload.id);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// Auto-refresh polling to detect completed requests
let pollingInterval = null;
let pollingRequestId = null;
let pollCount = 0;
const MAX_POLLS = 10; // Max 10 polls (5 minutes at 30s intervals)

function startRequestPolling(requestId) {
    // Clear any existing polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    pollingRequestId = requestId;
    pollCount = 0;
    
    // Poll every 30 seconds
    pollingInterval = setInterval(async () => {
        pollCount++;
        
        if (pollCount > MAX_POLLS) {
            stopRequestPolling();
            return;
        }
        
        try {
            await loadRequests();
            await loadReports();
            
            // Check if our request is completed
            const request = requests.find(r => r.id === pollingRequestId);
            if (request && request.status === 'Completed') {
                showToast('✅ Report ready! Check the Reports tab.', 'success', 5000);
                stopRequestPolling();
                
                // Switch to reports tab
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('.tab[data-tab="reports"]').classList.add('active');
                document.getElementById('reports-tab').classList.add('active');
            } else if (request && request.status === 'Failed') {
                showToast('❌ Report generation failed', 'error', 5000);
                stopRequestPolling();
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    }, 30000); // 30 seconds
}

function stopRequestPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    pollingRequestId = null;
    pollCount = 0;
}

// Load filter preferences from localStorage
function loadFilterPreferences() {
    const savedSort = localStorage.getItem('fleetclaim-sort');
    const savedDateFilter = localStorage.getItem('fleetclaim-date-filter');
    
    if (savedSort) {
        document.getElementById('sort-by').value = savedSort;
    }
    if (savedDateFilter) {
        document.getElementById('date-filter').value = savedDateFilter;
    }
}

// Save filter preferences to localStorage
function saveFilterPreferences() {
    localStorage.setItem('fleetclaim-sort', document.getElementById('sort-by').value);
    localStorage.setItem('fleetclaim-date-filter', document.getElementById('date-filter').value);
}

// Severity order for sorting
const severityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };

// Populate vehicle filter dropdown from available reports
function populateVehicleFilter() {
    const select = document.getElementById('vehicle-filter');
    if (!select) return;
    
    const currentValue = select.value;
    
    // Get unique vehicles from reports
    const vehicles = [...new Set(reports.map(r => r.vehicleName || r.vehicleId).filter(Boolean))].sort();
    
    select.innerHTML = '<option value="">All Vehicles</option>' +
        vehicles.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    
    // Restore selected value
    if (currentValue && vehicles.includes(currentValue)) {
        select.value = currentValue;
    }
}

function onGroupFilterChange() {
    // Update vehicle dropdowns when group changes
    updateDeviceSelects();
    // Then filter reports
    filterAndSortReports();
}

function filterAndSortReports() {
    const search = document.getElementById('search').value.toLowerCase();
    const groupFilter = document.getElementById('group-filter')?.value || '';
    const severity = document.getElementById('severity-filter').value;
    const dateFilter = document.getElementById('date-filter').value;
    const vehicleFilter = document.getElementById('vehicle-filter')?.value || '';
    const sortBy = document.getElementById('sort-by').value;
    
    // Save preferences
    saveFilterPreferences();
    
    // Populate vehicle filter dropdown
    populateVehicleFilter();
    
    // Calculate date cutoff
    let dateCutoff = null;
    if (dateFilter !== 'all') {
        const days = parseInt(dateFilter, 10);
        dateCutoff = new Date();
        dateCutoff.setDate(dateCutoff.getDate() - days);
    }
    
    // Filter
    let filtered = reports.filter(r => {
        const matchesSearch = !search || 
            (r.summary || '').toLowerCase().includes(search) ||
            (r.vehicleName || '').toLowerCase().includes(search) ||
            (r.driverName || '').toLowerCase().includes(search);
        
        const matchesSeverity = !severity || 
            (r.severity || '').toLowerCase() === severity.toLowerCase();
        
        const matchesVehicle = !vehicleFilter ||
            (r.vehicleId === vehicleFilter) ||
            (r.vehicleName === vehicleFilter);
        
        // Filter by group - check if report's vehicle belongs to selected group
        const matchesGroup = !groupFilter || 
            (deviceGroupMap[r.vehicleId] || []).includes(groupFilter);
        
        const reportDate = new Date(r.occurredAt);
        const matchesDate = !dateCutoff || reportDate >= dateCutoff;
        
        return matchesSearch && matchesSeverity && matchesVehicle && matchesGroup && matchesDate;
    });
    
    // Sort
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'date-desc':
                return new Date(b.occurredAt) - new Date(a.occurredAt);
            case 'date-asc':
                return new Date(a.occurredAt) - new Date(b.occurredAt);
            case 'severity':
                const sevA = severityOrder[a.severity] ?? 99;
                const sevB = severityOrder[b.severity] ?? 99;
                return sevA - sevB || new Date(b.occurredAt) - new Date(a.occurredAt);
            case 'vehicle':
                return (a.vehicleName || '').localeCompare(b.vehicleName || '');
            default:
                return 0;
        }
    });
    
    renderReports(filtered);
    renderReportsStats(filtered, reports.length);
}

// Apply same sorting to requests
function sortRequests(requestsToSort) {
    const sortBy = document.getElementById('sort-by').value;
    const dateFilter = document.getElementById('date-filter').value;
    
    // Calculate date cutoff
    let dateCutoff = null;
    if (dateFilter !== 'all') {
        const days = parseInt(dateFilter, 10);
        dateCutoff = new Date();
        dateCutoff.setDate(dateCutoff.getDate() - days);
    }
    
    // Filter by date
    let filtered = requestsToSort;
    if (dateCutoff) {
        filtered = requestsToSort.filter(r => new Date(r.requestedAt) >= dateCutoff);
    }
    
    // Sort
    return filtered.sort((a, b) => {
        switch (sortBy) {
            case 'date-desc':
                return new Date(b.requestedAt) - new Date(a.requestedAt);
            case 'date-asc':
                return new Date(a.requestedAt) - new Date(b.requestedAt);
            case 'vehicle':
                return (a.deviceName || '').localeCompare(b.deviceName || '');
            default:
                return new Date(b.requestedAt) - new Date(a.requestedAt);
        }
    });
}

// Legacy function for backwards compatibility
function filterReports() {
    filterAndSortReports();
}

// Utilities
function apiCall(method, params) {
    return new Promise((resolve, reject) => {
        if (!api) {
            reject(new Error('API not initialized'));
            return;
        }
        api.call(method, params, resolve, reject);
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function formatDateShort(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function copyShareLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('Share link copied to clipboard!', 'success');
    });
}

// ========================================
// Delete Functionality
// ========================================

function showDeleteConfirmation(type, id, name) {
    pendingDelete = { type, id };
    
    const messageEl = document.getElementById('delete-message');
    if (type === 'report') {
        messageEl.textContent = `Are you sure you want to delete the report "${name}"? This action cannot be undone.`;
    } else {
        messageEl.textContent = `Are you sure you want to delete this request for "${name}"? This action cannot be undone.`;
    }
    
    document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.add('hidden');
    pendingDelete = null;
}

async function confirmDelete() {
    if (!pendingDelete) return;
    
    const { type, id } = pendingDelete;
    const confirmBtn = document.getElementById('confirm-delete');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
    
    try {
        // Get the AddInData record ID
        let recordId;
        if (type === 'report') {
            recordId = reportRecords[id];
        } else {
            recordId = requestRecords[id];
        }
        
        if (!recordId) {
            throw new Error('Record not found');
        }
        
        // Call Geotab API to remove the AddInData record
        await new Promise((resolve, reject) => {
            api.call('Remove', {
                typeName: 'AddInData',
                entity: { id: recordId }
            }, resolve, reject);
        });
        
        // Close modal and refresh list
        closeDeleteModal();
        
        if (type === 'report') {
            await loadReports();
        } else {
            await loadRequests();
        }
    } catch (err) {
        console.error('Error deleting:', err);
        alert('Failed to delete: ' + err.message);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';
    }
}

// ========================================
// Settings Management
// ========================================

let config = {
    notifyEmails: [],
    notifyWebhook: null,
    severityThreshold: 'Medium'
};

// Load config from AddInData
async function loadSettings() {
    try {
        const results = await new Promise((resolve, reject) => {
            api.call('Get', {
                typeName: 'AddInData',
                search: { addInId: ADDIN_ID }
            }, resolve, reject);
        });
        
        for (const item of results) {
            try {
                const wrapper = typeof item.details === 'string' 
                    ? JSON.parse(item.details) 
                    : item.details;
                
                if (wrapper.type === 'config') {
                    config = {
                        notifyEmails: wrapper.payload.notifyEmails || [],
                        notifyWebhook: wrapper.payload.notifyWebhook || null,
                        severityThreshold: wrapper.payload.severityThreshold || 'Medium'
                    };
                    break;
                }
            } catch (e) {}
        }
        
        renderSettingsUI();
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

// Render settings to UI
function renderSettingsUI() {
    // Email chips
    const emailList = document.getElementById('email-list');
    emailList.innerHTML = config.notifyEmails.map(email => `
        <div class="email-chip">
            ${escapeHtml(email)}
            <button onclick="removeEmail('${escapeHtml(email)}')" title="Remove">&times;</button>
        </div>
    `).join('');
    
    // Webhook
    const webhookInput = document.getElementById('webhook-url');
    if (webhookInput) {
        webhookInput.value = config.notifyWebhook || '';
    }
    
    // Severity threshold
    const severitySelect = document.getElementById('severity-threshold');
    if (severitySelect) {
        severitySelect.value = config.severityThreshold || 'Medium';
    }
}

// Add email to list
function addEmail() {
    const input = document.getElementById('notify-email-input');
    const email = input.value.trim().toLowerCase();
    
    if (!email) return;
    
    // Simple email validation
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    if (config.notifyEmails.includes(email)) {
        showToast('This email is already in the list', 'info');
        return;
    }
    
    config.notifyEmails.push(email);
    input.value = '';
    renderSettingsUI();
}

// Remove email from list
function removeEmail(email) {
    config.notifyEmails = config.notifyEmails.filter(e => e !== email);
    renderSettingsUI();
}

// Save settings to AddInData
async function saveSettings() {
    const statusEl = document.getElementById('settings-status');
    const saveBtn = document.getElementById('save-settings');
    
    // Update config from UI
    config.notifyWebhook = document.getElementById('webhook-url').value.trim() || null;
    config.severityThreshold = document.getElementById('severity-threshold').value;
    
    statusEl.textContent = 'Saving...';
    statusEl.className = 'settings-status';
    saveBtn.disabled = true;
    
    try {
        // First, find existing config record to remove it
        const existingRecords = await new Promise((resolve, reject) => {
            api.call('Get', {
                typeName: 'AddInData',
                search: { addInId: ADDIN_ID }
            }, resolve, reject);
        });
        
        for (const item of existingRecords) {
            try {
                const wrapper = typeof item.details === 'string' 
                    ? JSON.parse(item.details) 
                    : item.details;
                
                if (wrapper.type === 'config') {
                    // Remove existing config
                    await new Promise((resolve, reject) => {
                        api.call('Remove', {
                            typeName: 'AddInData',
                            entity: { id: item.id }
                        }, resolve, reject);
                    });
                    break;
                }
            } catch (e) {}
        }
        
        // Add new config
        const configData = {
            type: 'config',
            payload: {
                notifyEmails: config.notifyEmails,
                notifyWebhook: config.notifyWebhook,
                severityThreshold: config.severityThreshold,
                autoGenerateRules: ['Major Collision', 'Minor Collision']
            }
        };
        
        await new Promise((resolve, reject) => {
            api.call('Add', {
                typeName: 'AddInData',
                entity: {
                    addInId: ADDIN_ID,
                    details: configData
                }
            }, resolve, reject);
        });
        
        statusEl.textContent = '✓ Settings saved!';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
        console.error('Error saving settings:', err);
        statusEl.textContent = '✗ Failed to save';
        statusEl.className = 'settings-status error';
    } finally {
        saveBtn.disabled = false;
    }
}

// Initialize settings event listeners
function initializeSettingsUI() {
    document.getElementById('add-email-btn')?.addEventListener('click', addEmail);
    document.getElementById('notify-email-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addEmail();
    });
    document.getElementById('save-settings')?.addEventListener('click', saveSettings);
    
    // Load settings when settings tab is clicked
    document.querySelector('.tab[data-tab="settings"]')?.addEventListener('click', loadSettings);
}

// ========================================
// Toast Notification System
// ========================================

function initToastContainer() {
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'success'|'error'|'info'} type - The type of toast
 * @param {number} duration - Auto-dismiss duration in ms (default 3500)
 */
function showToast(message, type = 'info', duration = 3500) {
    initToastContainer();
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Auto-dismiss
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

// Expose for onclick handlers
window.showRequestModal = showRequestModal;
window.regenerateReport = regenerateReport;
window.copyShareLink = copyShareLink;
window.downloadPdf = downloadPdf;
window.downloadPdfForReport = downloadPdfForReport;
window.removeEmail = removeEmail;
window.saveReportNotes = saveReportNotes;
window.showDeleteConfirmation = showDeleteConfirmation;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.showToast = showToast;
window.showEmailModal = showEmailModal;
window.closeEmailModal = closeEmailModal;
window.sendReportEmail = sendReportEmail;
window.toggleSection = toggleSection;
window.saveThirdPartyInfo = saveThirdPartyInfo;
