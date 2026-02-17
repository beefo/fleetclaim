let apiKey = localStorage.getItem('fleetclaim_admin_key') || '';

// Check if we have a stored key
if (apiKey) {
    authenticate(true);
}

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
