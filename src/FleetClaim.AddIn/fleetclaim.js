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
    
    listEl.innerHTML = reportsToRender.map(report => `
        <div class="report-card" data-id="${report.id}">
            <div class="report-info">
                <div class="report-title">${escapeHtml(report.summary || 'Incident Report')}</div>
                <div class="report-meta">
                    <span>🚗 ${escapeHtml(report.vehicleName || report.vehicleId || 'Unknown')}</span>
                    <span>👤 ${escapeHtml(report.driverName || 'Unknown Driver')}</span>
                    <span>📅 ${formatDate(report.occurredAt)}</span>
                </div>
            </div>
            <span class="severity severity-${(report.severity || 'medium').toLowerCase()}">
                ${report.severity || 'Medium'}
            </span>
        </div>
    `).join('');
    
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
    
    detailEl.innerHTML = `
        <div class="report-detail-header">
            <h2>${escapeHtml(report.summary || 'Incident Report')}</h2>
            <span class="severity severity-${(report.severity || 'medium').toLowerCase()}">
                ${report.severity || 'Medium'}
            </span>
        </div>
        
        <div class="report-section">
            <h3>Incident Details</h3>
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
        
        <div class="report-actions">
            ${report.pdfBase64 ? '<button class="btn btn-primary" onclick="downloadPdf()">📄 Download PDF</button>' : ''}
            ${report.shareUrl ? `<button class="btn btn-secondary" onclick="copyShareLink('${report.shareUrl}')">🔗 Copy Share Link</button>` : ''}
        </div>
    `;
    
    document.getElementById('report-modal').classList.remove('hidden');
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
                status: 'Pending'
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

function downloadPdf() {
    // TODO: Implement PDF download from base64
    alert('PDF download coming soon!');
}

// Expose for onclick handlers
window.showRequestModal = showRequestModal;
window.copyShareLink = copyShareLink;
window.downloadPdf = downloadPdf;
