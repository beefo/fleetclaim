/**
 * FleetClaim MyGeotab Add-In
 * 
 * Reads processed reports from AddInData and displays them.
 * Does NOT process incidents - that's handled by the backend worker.
 */

// Add-In ID for MyGeotab AddInData
const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';

// Geotab API instance (injected by MyGeotab)
let api = null;
let state = null;
let reports = [];
let requests = [];

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
            loadReports();
            loadRequests();
        });
    } else {
        initializeUI();
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
    loadReports();
    loadRequests();
};

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
    document.getElementById('severity-filter').addEventListener('change', filterAndSortReports);
    document.getElementById('date-filter').addEventListener('change', filterAndSortReports);
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
    
    // Delete modal
    document.getElementById('cancel-delete').addEventListener('click', closeDeleteModal);
    document.getElementById('confirm-delete').addEventListener('click', confirmDelete);
    
    // Email modal
    document.getElementById('cancel-email')?.addEventListener('click', closeEmailModal);
    document.getElementById('send-email')?.addEventListener('click', sendReportEmail);
    
    // Settings
    initializeSettingsUI();
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
        
        <div class="report-actions">
            <button class="btn btn-primary" onclick="downloadPdfForReport('${report.id}')">${report.shareUrl ? '📄 Download PDF' : '🔄 Regenerate Report'}</button>
            ${report.shareUrl ? `<button class="btn btn-secondary" onclick="copyShareLink('${report.shareUrl}')">🔗 Copy Share Link</button>` : ''}
            ${report.shareUrl ? `<button class="btn btn-secondary" onclick="showEmailModal('${report.id}')">📧 Send to Email</button>` : ''}
        </div>
    `;
    
    document.getElementById('report-modal').classList.remove('hidden');
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
        // Use mailto: link as a simple solution (opens user's email client)
        const subject = encodeURIComponent(`FleetClaim Incident Report: ${report.vehicleName || report.vehicleId}`);
        const body = encodeURIComponent(`${message}\n\n🔗 View Report: ${report.shareUrl}\n\n---\nGenerated by FleetClaim`);
        
        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
        
        closeEmailModal();
        showToast('Email client opened! Send from your email app.', 'success', 4000);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
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

// Cache for devices
let devices = [];

async function loadDevices() {
    try {
        devices = await apiCall('Get', { typeName: 'Device' });
        devices.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        const select = document.getElementById('device-select');
        select.innerHTML = '<option value="">Select a vehicle...</option>' +
            devices.map(d => `<option value="${d.id}">${escapeHtml(d.name || d.id)}</option>`).join('');
    } catch (err) {
        console.error('Error loading devices:', err);
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
        // Get current user
        const users = await apiCall('Get', {
            typeName: 'User',
            search: { name: api.userName }
        });
        const userEmail = users[0]?.name || 'unknown';
        
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

function filterAndSortReports() {
    const search = document.getElementById('search').value.toLowerCase();
    const severity = document.getElementById('severity-filter').value;
    const dateFilter = document.getElementById('date-filter').value;
    const sortBy = document.getElementById('sort-by').value;
    
    // Save preferences
    saveFilterPreferences();
    
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
        
        const reportDate = new Date(r.occurredAt);
        const matchesDate = !dateCutoff || reportDate >= dateCutoff;
        
        return matchesSearch && matchesSeverity && matchesDate;
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
