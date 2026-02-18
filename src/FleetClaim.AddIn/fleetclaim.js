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
    
    // Search
    document.getElementById('search').addEventListener('input', filterReports);
    document.getElementById('severity-filter').addEventListener('change', filterReports);
    
    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('report-modal').addEventListener('click', (e) => {
        if (e.target.id === 'report-modal') closeModal();
    });
    
    // Request modal
    document.getElementById('cancel-request').addEventListener('click', closeRequestModal);
    document.getElementById('submit-request').addEventListener('click', submitReportRequest);
    
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
        
        reports = addInData
            .map(item => {
                try {
                    // Geotab API returns 'details', not 'data'
                    const raw = item.details || item.data;
                    const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (wrapper && wrapper.type === 'report') {
                        return wrapper.payload || wrapper;
                    }
                } catch (e) { console.warn('Error parsing report:', e); }
                return null;
            })
            .filter(r => r !== null)
            .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
        
        renderReports(reports);
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
        
        requests = addInData
            .map(item => {
                try {
                    // Geotab API returns 'details', not 'data'
                    const raw = item.details || item.data;
                    console.log('FleetClaim: Processing item:', raw);
                    const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (wrapper && wrapper.type === 'reportRequest') {
                        return wrapper.payload || wrapper;
                    }
                } catch (e) { console.warn('FleetClaim: Error parsing request:', e); }
                return null;
            })
            .filter(r => r !== null)
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
        
        console.log('FleetClaim: Found', requests.length, 'requests');
        renderRequests(requests);
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
        return `
        <div class="report-card" data-id="${report.id}">
            <div class="report-info">
                <div class="report-title">
                    ${isBaseline ? '📋' : '⚠️'} ${escapeHtml(report.summary || 'Incident Report')}
                </div>
                <div class="report-meta">
                    <span>🚗 ${escapeHtml(report.vehicleName || report.vehicleId || 'Unknown')}</span>
                    <span>👤 ${escapeHtml(report.driverName || 'Unknown Driver')}</span>
                    <span>📅 ${formatDate(report.occurredAt)}</span>
                    ${isBaseline ? '<span class="baseline-tag">Baseline</span>' : ''}
                </div>
            </div>
            <span class="severity severity-${(report.severity || 'medium').toLowerCase()}">
                ${report.severity || 'Medium'}
            </span>
        </div>
    `}).join('');
    
    // Add click handlers
    listEl.querySelectorAll('.report-card').forEach(card => {
        card.addEventListener('click', () => {
            const report = reports.find(r => r.id === card.dataset.id);
            if (report) showReportDetail(report);
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
    ` + requestsToRender.map(req => `
        <div class="report-card">
            <div class="report-info">
                <div class="report-title">🚗 ${escapeHtml(req.deviceName || req.deviceId || 'Unknown Vehicle')}</div>
                <div class="report-meta">
                    <span>📅 ${formatDate(req.fromDate)} - ${formatDate(req.toDate)}</span>
                    <span>By: ${escapeHtml(req.requestedBy || 'Unknown')}</span>
                    ${req.incidentsFound !== undefined ? `<span>Found: ${req.incidentsFound} incidents</span>` : ''}
                </div>
            </div>
            <span class="status status-${(req.status || 'pending').toLowerCase()}">
                ${req.status || 'Pending'}
            </span>
        </div>
    `).join('');
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
            <button class="btn btn-primary" onclick="downloadPdfForReport('${report.id}')">📄 Download PDF</button>
            ${report.shareUrl ? `<button class="btn btn-secondary" onclick="copyShareLink('${report.shareUrl}')">🔗 Copy Share Link</button>` : ''}
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
        alert('Report not found');
        return;
    }
    
    if (!report.shareUrl) {
        alert('PDF not available for this report.\n\nThis report was created before PDF support was added. Please generate a new report to get PDF export.');
        return;
    }
    
    await downloadPdf(report.shareUrl);
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
        alert('Failed to download PDF: ' + err.message);
        
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
        alert('Please select a vehicle');
        return;
    }
    if (!fromDatetime || !toDatetime) {
        alert('Please select both from and to times');
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
        
        alert('Report requested! Check the Pending Requests tab for status. The worker processes requests every 2 minutes.');
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

function filterReports() {
    const search = document.getElementById('search').value.toLowerCase();
    const severity = document.getElementById('severity-filter').value;
    
    const filtered = reports.filter(r => {
        const matchesSearch = !search || 
            (r.summary || '').toLowerCase().includes(search) ||
            (r.vehicleName || '').toLowerCase().includes(search) ||
            (r.driverName || '').toLowerCase().includes(search);
        
        const matchesSeverity = !severity || 
            (r.severity || '').toLowerCase() === severity.toLowerCase();
        
        return matchesSearch && matchesSeverity;
    });
    
    renderReports(filtered);
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
        alert('Share link copied to clipboard!');
    });
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
        alert('Please enter a valid email address');
        return;
    }
    
    if (config.notifyEmails.includes(email)) {
        alert('This email is already in the list');
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

// Expose for onclick handlers
window.showRequestModal = showRequestModal;
window.copyShareLink = copyShareLink;
window.downloadPdf = downloadPdf;
window.downloadPdfForReport = downloadPdfForReport;
window.removeEmail = removeEmail;
window.saveReportNotes = saveReportNotes;
