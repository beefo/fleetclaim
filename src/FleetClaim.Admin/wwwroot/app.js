let apiKey = localStorage.getItem('fleetclaim_admin_key') || '';

// Check if we have a stored key
if (apiKey) {
    authenticate(true);
}

// Modal close function
function closeModal(e) {
    if (e && e.target && e.target.id === 'onboard-modal') {
        document.getElementById('onboard-modal').style.display = 'none';
    }
}

function hideModal() {
    document.getElementById('onboard-modal').style.display = 'none';
}

// Set up modal close handlers after DOM loads
document.addEventListener('DOMContentLoaded', function() {
    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.onclick = function(e) {
            e.preventDefault();
            hideModal();
            return false;
        };
    }
    
    // X close button
    const closeXBtn = document.getElementById('close-x-btn');
    if (closeXBtn) {
        closeXBtn.onclick = function(e) {
            e.preventDefault();
            hideModal();
            return false;
        };
    }
    
    // ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideModal();
        }
    });
});

async function authenticate(silent = false) {
    const input = document.getElementById('api-key');
    if (!silent && input.value) {
        apiKey = input.value;
    }
    
    if (!apiKey) return;
    
    try {
        const response = await fetch('/admin/overview', {
            headers: { 'X-API-Key': apiKey }
        });
        
        if (response.ok) {
            localStorage.setItem('fleetclaim_admin_key', apiKey);
            document.getElementById('auth-form').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            document.getElementById('auth-status').textContent = '✓ Connected';
            document.getElementById('auth-status').classList.add('connected');
            
            // Load dashboard data
            loadDashboard();
        } else {
            if (!silent) {
                alert('Invalid API key');
            }
            localStorage.removeItem('fleetclaim_admin_key');
        }
    } catch (error) {
        console.error('Auth error:', error);
        if (!silent) {
            alert('Connection failed');
        }
    }
}

async function fetchApi(endpoint) {
    const response = await fetch(endpoint, {
        headers: { 'X-API-Key': apiKey }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function loadDashboard() {
    try {
        // Load overview
        const overview = await fetchApi('/admin/overview');
        document.getElementById('db-count').textContent = overview.totalDatabases;
        
        // Load databases
        const databases = await fetchApi('/admin/databases');
        renderDatabases(databases);
        
        // Update selector
        const selector = document.getElementById('db-selector');
        selector.innerHTML = '<option value="">Select database...</option>';
        databases.forEach(db => {
            selector.innerHTML += `<option value="${db.database}">${db.database}</option>`;
        });
        
        // Calculate totals
        let totalRequests = 0, pendingRequests = 0, totalReports = 0;
        databases.forEach(db => {
            totalRequests += db.totalRequests || 0;
            pendingRequests += db.pendingRequests || 0;
            totalReports += db.totalReports || 0;
        });
        
        document.getElementById('request-count').textContent = totalRequests;
        document.getElementById('pending-count').textContent = pendingRequests;
        document.getElementById('report-count').textContent = totalReports;
        
        // Load jobs
        loadJobs();
        
        // Load logs
        loadLogs();
        
        // Update timestamp
        document.getElementById('last-updated').textContent = 
            'Last updated: ' + new Date().toLocaleTimeString();
            
    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

function renderDatabases(databases) {
    const container = document.getElementById('databases-list');
    
    if (!databases.length) {
        container.innerHTML = '<p>No databases configured</p>';
        return;
    }
    
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Database</th>
                    <th>Status</th>
                    <th>Requests</th>
                    <th>Pending</th>
                    <th>Completed</th>
                    <th>Reports</th>
                </tr>
            </thead>
            <tbody>
                ${databases.map(db => `
                    <tr>
                        <td><strong>${db.database}</strong></td>
                        <td><span class="status-badge ${db.status}">${db.status}</span></td>
                        <td>${db.totalRequests || 0}</td>
                        <td>${db.pendingRequests || 0}</td>
                        <td>${db.completedRequests || 0}</td>
                        <td>${db.totalReports || 0}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadRequests() {
    const database = document.getElementById('db-selector').value;
    const container = document.getElementById('requests-list');
    
    if (!database) {
        container.innerHTML = '<p>Select a database to view requests</p>';
        return;
    }
    
    try {
        const data = await fetchApi(`/admin/databases/${database}/requests`);
        
        if (!data.requests || !data.requests.length) {
            container.innerHTML = '<p>No requests found</p>';
            return;
        }
        
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Device</th>
                        <th>Status</th>
                        <th>Time Range</th>
                        <th>Incidents</th>
                        <th>Reports</th>
                        <th>Requested</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.requests.map(r => `
                        <tr>
                            <td><code>${r.id || '-'}</code></td>
                            <td>${r.deviceName || r.deviceId || '-'}</td>
                            <td><span class="status-badge ${(r.status || '').toLowerCase()}">${r.status || '-'}</span></td>
                            <td>${formatDateRange(r.fromDate, r.toDate)}</td>
                            <td>${r.incidentsFound ?? '-'}</td>
                            <td>${r.reportsGenerated ?? '-'}</td>
                            <td>${formatDate(r.requestedAt)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<p>Error loading requests: ${error.message}</p>`;
    }
}

async function loadJobs() {
    const container = document.getElementById('jobs-list');
    
    try {
        const data = await fetchApi('/admin/jobs?limit=10');
        
        if (data.error) {
            container.innerHTML = `<p>Error: ${data.error}</p>`;
            return;
        }
        
        if (!Array.isArray(data) || !data.length) {
            container.innerHTML = '<p>No recent job executions</p>';
            return;
        }
        
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Execution</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Run By</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(job => {
                        const name = job.metadata?.name || job.name || '-';
                        const succeeded = job.status?.succeededCount || 0;
                        const failed = job.status?.failedCount || 0;
                        const running = job.status?.runningCount || 0;
                        let status = 'pending';
                        if (succeeded > 0) status = 'success';
                        else if (failed > 0) status = 'failed';
                        else if (running > 0) status = 'running';
                        
                        return `
                            <tr>
                                <td><code>${name}</code></td>
                                <td><span class="status-badge ${status}">${status}</span></td>
                                <td>${formatDate(job.metadata?.creationTimestamp || job.createTime)}</td>
                                <td>${job.metadata?.annotations?.['run.googleapis.com/creator'] || '-'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<p>Error loading jobs: ${error.message}</p>`;
    }
}

async function loadLogs() {
    const container = document.getElementById('logs-list');
    
    try {
        const data = await fetchApi('/admin/logs?limit=50');
        
        if (data.error) {
            container.innerHTML = `<p>Error: ${data.error}</p>`;
            return;
        }
        
        if (!data.entries || !data.entries.length) {
            container.innerHTML = '<p>No recent logs</p>';
            return;
        }
        
        container.innerHTML = data.entries.map(entry => {
            const severity = (entry.severity || 'INFO').toLowerCase();
            const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '-';
            const message = entry.message || '-';
            
            return `
                <div class="log-entry ${severity}">
                    <span class="timestamp">${timestamp}</span>
                    <span class="message">${escapeHtml(message)}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = `<p>Error loading logs: ${error.message}</p>`;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleString();
    } catch {
        return dateStr;
    }
}

function formatDateRange(from, to) {
    if (!from || !to) return '-';
    try {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        return `${fromDate.toLocaleDateString()} ${fromDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${toDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    } catch {
        return `${from} - ${to}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh every 30 seconds
setInterval(() => {
    if (!document.getElementById('dashboard').classList.contains('hidden')) {
        loadDashboard();
    }
}, 30000);

// Database onboarding
function showOnboardModal() {
    console.log('showOnboardModal called');
    const modal = document.getElementById('onboard-modal');
    console.log('Modal element:', modal);
    if (!modal) {
        alert('Modal element not found!');
        return;
    }
    modal.classList.remove('hidden');
    document.getElementById('onboard-form').reset();
    document.getElementById('db-server').value = 'my.geotab.com';
    document.getElementById('onboard-result').classList.add('hidden');
}

function hideOnboardModal() {
    document.getElementById('onboard-modal').classList.add('hidden');
}

async function onboardDatabase(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('onboard-submit');
    const resultDiv = document.getElementById('onboard-result');
    
    const payload = {
        database: document.getElementById('db-name').value.trim(),
        server: document.getElementById('db-server').value.trim(),
        username: document.getElementById('db-username').value.trim(),
        password: document.getElementById('db-password').value
    };
    
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Connecting...';
    resultDiv.classList.add('hidden');
    
    try {
        const response = await fetch('/admin/databases', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            resultDiv.innerHTML = `
                <div class="success-message">
                    ✅ ${data.message}<br>
                    <small>Secret: ${data.secretName}</small>
                </div>
            `;
            resultDiv.classList.remove('hidden');
            
            // Refresh dashboard after 2 seconds
            setTimeout(() => {
                hideOnboardModal();
                loadDashboard();
            }, 2000);
        } else {
            throw new Error(data.detail || data.error || 'Unknown error');
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="error-message">❌ ${error.message}</div>`;
        resultDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Database';
    }
}
