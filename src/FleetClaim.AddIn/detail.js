/**
 * FleetClaim Report Detail Page
 * Standalone page for viewing report details
 */

const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';
const API_BASE_URL = 'https://fleetclaim-api-589116575765.us-central1.run.app';

let api = null;
let state = null;
let currentReport = null;
let reportRecordId = null;
let storedCredentials = null;
let geotabHost = null;

// Initialize the Add-In page
if (typeof geotab === 'undefined') {
    window.geotab = { addin: {} };
}
if (!geotab.addin) {
    geotab.addin = {};
}

// Entry point must match menuId from config - using hyphenated format
geotab.addin['fleetclaim-detail'] = function(geotabApi, pageState) {
    api = geotabApi;
    state = pageState;
    console.log('FleetClaim Detail page initializing...');
    
    // Get report ID from URL hash
    const reportId = getReportIdFromUrl();
    if (reportId) {
        loadReport(reportId);
    } else {
        showError('No report ID provided');
    }
};

geotab.addin['fleetclaim-detail'].focus = function(geotabApi, pageState) {
    api = geotabApi;
    state = pageState;
    console.log('FleetClaim Detail focused');
    captureCredentials();
    
    const reportId = getReportIdFromUrl();
    if (reportId && (!currentReport || currentReport.id !== reportId)) {
        loadReport(reportId);
    }
};

function getReportIdFromUrl() {
    // Check URL parameters (MyGeotab passes them via hash or query)
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    let reportId = params.get('reportId') || params.get('id');
    
    // Also check query string
    if (!reportId) {
        const queryParams = new URLSearchParams(window.location.search);
        reportId = queryParams.get('reportId') || queryParams.get('id');
    }
    
    // Check if passed via state
    if (!reportId && state && state.getState) {
        try {
            const pageState = state.getState();
            reportId = pageState?.reportId;
        } catch (e) {}
    }
    
    return reportId;
}

function captureCredentials() {
    if (api && typeof api.getSession === 'function') {
        api.getSession(function(session) {
            storedCredentials = {
                database: session.credentials?.database || session.database,
                userName: session.credentials?.userName || session.userName,
                sessionId: session.credentials?.sessionId || session.sessionId
            };
            geotabHost = session.server || 'my.geotab.com';
            console.log('Credentials captured for detail page');
        });
    }
}

async function loadReport(reportId) {
    showLoading();
    
    try {
        // Load all AddInData and find this report
        const results = await new Promise((resolve, reject) => {
            api.call('Get', {
                typeName: 'AddInData',
                search: { addInId: ADDIN_ID }
            }, resolve, reject);
        });
        
        // Find the report
        for (const record of results) {
            try {
                const data = typeof record.details === 'string' 
                    ? JSON.parse(record.details) 
                    : record.details;
                
                if (data.type === 'report' && data.payload?.id === reportId) {
                    currentReport = data.payload;
                    reportRecordId = record.id;
                    renderReport(currentReport);
                    return;
                }
            } catch (e) {}
        }
        
        showError('Report not found');
    } catch (err) {
        console.error('Failed to load report:', err);
        showError('Failed to load report: ' + err.message);
    }
}

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('report-content').classList.add('hidden');
}

function showError(message) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('report-content').classList.add('hidden');
    document.getElementById('error-message').textContent = message;
}

function renderReport(report) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('report-content').classList.remove('hidden');
    
    // Title and severity
    document.getElementById('report-title').textContent = report.title || 'Incident Report';
    const severityBadge = document.getElementById('severity-badge');
    const severity = (report.severity || 'LOW').toLowerCase();
    severityBadge.textContent = report.severity || 'LOW';
    severityBadge.className = 'severity-badge ' + severity;
    
    // Meta bar
    document.getElementById('meta-vehicle').textContent = '🚗 ' + (report.vehicleName || report.vehicleId || 'Unknown');
    document.getElementById('meta-driver').textContent = '👤 ' + (report.driverName || 'Unknown Driver');
    document.getElementById('meta-date').textContent = '📅 ' + formatDate(report.occurredAt);
    document.getElementById('meta-requested').textContent = '📋 ' + (report.requestedBy || 'System');
    
    // Map
    if (report.latitude && report.longitude) {
        const mapImg = document.getElementById('map-image');
        mapImg.src = `https://staticmap.openstreetmap.de/staticmap.php?center=${report.latitude},${report.longitude}&zoom=15&size=600x300&maptype=mapnik&markers=${report.latitude},${report.longitude},red-pushpin`;
        mapImg.alt = 'Incident location';
    }
    document.getElementById('location-address').textContent = report.address || 
        (report.latitude && report.longitude ? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}` : 'Location unknown');
    
    // Stats
    document.getElementById('stat-speed').textContent = report.speedAtEvent != null ? report.speedAtEvent + ' km/h' : '--';
    document.getElementById('stat-max-speed').textContent = report.maxSpeed != null ? report.maxSpeed + ' km/h' : '--';
    document.getElementById('stat-decel').textContent = report.maxDeceleration != null ? report.maxDeceleration.toFixed(2) + ' m/s²' : '--';
    document.getElementById('stat-weather').textContent = report.weather?.condition || '--';
    document.getElementById('stat-temp').textContent = report.weather?.temperature != null ? report.weather.temperature + '°C' : '--';
    document.getElementById('stat-gps').textContent = report.gpsTrail?.length || 0;
    
    // GPS Trail
    renderGpsTrail(report.gpsTrail || []);
    
    // Notes
    document.getElementById('notes-input').value = report.notes || '';
    
    // Photos
    renderPhotos(report.photos || []);
    
    // Third party info
    if (report.thirdParty) {
        document.getElementById('tp-name').value = report.thirdParty.name || '';
        document.getElementById('tp-phone').value = report.thirdParty.phone || '';
        document.getElementById('tp-email').value = report.thirdParty.email || '';
        document.getElementById('tp-plate').value = report.thirdParty.licensePlate || '';
        document.getElementById('tp-insurance').value = report.thirdParty.insuranceCompany || '';
        document.getElementById('tp-policy').value = report.thirdParty.policyNumber || '';
    }
    
    // Setup photo upload handler
    document.getElementById('photo-input').onchange = handlePhotoUpload;
}

function renderGpsTrail(trail) {
    const tbody = document.getElementById('gps-tbody');
    if (trail.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#6b7280;">No GPS data</td></tr>';
        return;
    }
    
    tbody.innerHTML = trail.map(point => `
        <tr>
            <td>${formatTime(point.timestamp || point.dateTime)}</td>
            <td>${point.speed != null ? point.speed + ' km/h' : '--'}</td>
            <td>${point.latitude?.toFixed(5) || '--'}</td>
            <td>${point.longitude?.toFixed(5) || '--'}</td>
        </tr>
    `).join('');
}

function renderPhotos(photos) {
    const grid = document.getElementById('photos-grid');
    
    if (photos.length === 0) {
        grid.innerHTML = '<p class="notes-hint">No photos attached yet.</p>';
        return;
    }
    
    grid.innerHTML = photos.map((photo, idx) => {
        const thumbUrl = getPhotoThumbnailUrl(photo);
        return `
            <div class="photo-card">
                <img src="${thumbUrl}" alt="${escapeHtml(photo.category || 'Photo')}" 
                     onclick="viewPhoto(${idx})" loading="lazy">
                <div class="photo-category">${escapeHtml(photo.category || 'Photo')}</div>
                <button class="photo-delete" onclick="deletePhoto(${idx})" title="Delete">×</button>
            </div>
        `;
    }).join('');
}

function getPhotoThumbnailUrl(photo) {
    if (photo.thumbnailUrl) return photo.thumbnailUrl;
    if (photo.mediaFileId && storedCredentials) {
        return `https://${geotabHost}/apiv1/GetImage?id=${photo.mediaFileId}&database=${storedCredentials.database}&sessionId=${storedCredentials.sessionId}&thumbnail=true`;
    }
    if (photo.dataUrl) return photo.dataUrl;
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%236b7280" font-size="12">No image</text></svg>';
}

function viewPhoto(index) {
    const photo = currentReport.photos?.[index];
    if (!photo) return;
    
    let url = photo.fullUrl || photo.url;
    if (!url && photo.mediaFileId && storedCredentials) {
        url = `https://${geotabHost}/apiv1/GetImage?id=${photo.mediaFileId}&database=${storedCredentials.database}&sessionId=${storedCredentials.sessionId}`;
    }
    if (url) {
        window.open(url, '_blank');
    }
}

async function deletePhoto(index) {
    if (!confirm('Delete this photo?')) return;
    
    currentReport.photos.splice(index, 1);
    renderPhotos(currentReport.photos);
    await saveReport();
    showToast('Photo deleted', 'success');
}

async function handlePhotoUpload(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    const category = document.getElementById('photo-category').value;
    
    for (const file of files) {
        showToast('Uploading photo...', 'info');
        
        try {
            // Read file as base64
            const dataUrl = await readFileAsDataUrl(file);
            
            // Upload via API
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', category);
            formData.append('reportId', currentReport.id);
            formData.append('vehicleId', currentReport.vehicleId);
            
            const response = await fetch(`${API_BASE_URL}/api/v1/photos/upload`, {
                method: 'POST',
                headers: { 'X-Database': storedCredentials?.database || '' },
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                currentReport.photos = currentReport.photos || [];
                currentReport.photos.push({
                    mediaFileId: result.mediaFileId,
                    category: category,
                    filename: file.name,
                    uploadedAt: new Date().toISOString()
                });
                renderPhotos(currentReport.photos);
                await saveReport();
                showToast('Photo uploaded!', 'success');
            } else {
                throw new Error('Upload failed');
            }
        } catch (err) {
            console.error('Photo upload failed:', err);
            showToast('Upload failed: ' + err.message, 'error');
        }
    }
    
    event.target.value = '';
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveNotes() {
    currentReport.notes = document.getElementById('notes-input').value;
    await saveReport();
    showToast('Notes saved!', 'success');
}

async function saveThirdParty() {
    currentReport.thirdParty = {
        name: document.getElementById('tp-name').value,
        phone: document.getElementById('tp-phone').value,
        email: document.getElementById('tp-email').value,
        licensePlate: document.getElementById('tp-plate').value,
        insuranceCompany: document.getElementById('tp-insurance').value,
        policyNumber: document.getElementById('tp-policy').value
    };
    await saveReport();
    showToast('Third party info saved!', 'success');
}

async function saveReport() {
    if (!reportRecordId || !currentReport) return;
    
    try {
        await new Promise((resolve, reject) => {
            api.call('Set', {
                typeName: 'AddInData',
                entity: {
                    id: reportRecordId,
                    addInId: ADDIN_ID,
                    details: JSON.stringify({
                        type: 'report',
                        payload: currentReport
                    })
                }
            }, resolve, reject);
        });
        console.log('Report saved');
    } catch (err) {
        console.error('Failed to save report:', err);
        showToast('Failed to save: ' + err.message, 'error');
    }
}

async function downloadPdf() {
    showToast('Generating PDF...', 'info');
    
    try {
        const db = storedCredentials?.database || 'demo_fleetclaim';
        const response = await fetch(`${API_BASE_URL}/api/v1/reports/${currentReport.id}/pdf`, {
            headers: { 'X-Database': db }
        });
        
        if (!response.ok) throw new Error('PDF generation failed');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FleetClaim-${currentReport.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('PDF downloaded!', 'success');
    } catch (err) {
        console.error('PDF download failed:', err);
        showToast('PDF download failed: ' + err.message, 'error');
    }
}

async function copyShareLink() {
    try {
        const db = storedCredentials?.database || 'demo_fleetclaim';
        const response = await fetch(`${API_BASE_URL}/api/v1/reports/${currentReport.id}/share`, {
            method: 'POST',
            headers: { 'X-Database': db }
        });
        
        if (!response.ok) throw new Error('Failed to generate share link');
        
        const result = await response.json();
        await navigator.clipboard.writeText(result.shareUrl);
        showToast('Share link copied!', 'success');
    } catch (err) {
        console.error('Share link failed:', err);
        showToast('Failed to copy link: ' + err.message, 'error');
    }
}

function sendEmail() {
    document.getElementById('email-modal').classList.remove('hidden');
}

function closeEmailModal() {
    document.getElementById('email-modal').classList.add('hidden');
}

async function sendEmailConfirm() {
    const recipient = document.getElementById('email-recipient').value;
    const message = document.getElementById('email-message').value;
    
    if (!recipient) {
        showToast('Please enter an email address', 'error');
        return;
    }
    
    showToast('Sending email...', 'info');
    closeEmailModal();
    
    try {
        const db = storedCredentials?.database || 'demo_fleetclaim';
        const response = await fetch(`${API_BASE_URL}/api/v1/reports/${currentReport.id}/email`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Database': db 
            },
            body: JSON.stringify({ recipient, message })
        });
        
        if (!response.ok) throw new Error('Failed to send email');
        
        showToast('Email sent!', 'success');
    } catch (err) {
        console.error('Email failed:', err);
        showToast('Failed to send email: ' + err.message, 'error');
    }
}

function deleteReport() {
    document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.add('hidden');
}

async function confirmDelete() {
    closeDeleteModal();
    showToast('Deleting report...', 'info');
    
    try {
        await new Promise((resolve, reject) => {
            api.call('Remove', {
                typeName: 'AddInData',
                entity: { id: reportRecordId }
            }, resolve, reject);
        });
        
        showToast('Report deleted', 'success');
        setTimeout(goBack, 1000);
    } catch (err) {
        console.error('Delete failed:', err);
        showToast('Failed to delete: ' + err.message, 'error');
    }
}

function goBack() {
    // Navigate back to main FleetClaim page
    if (state && state.gotoPage) {
        state.gotoPage('fleetclaim-index');
    } else {
        window.history.back();
    }
}

function toggleSection(header) {
    const section = header.closest('.collapsible');
    section.classList.toggle('collapsed');
}

// Utility functions
function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTime(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
