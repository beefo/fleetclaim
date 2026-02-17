#!/usr/bin/env node
const https = require('https');

const SERVER = 'my.geotab.com';
const DATABASE = 'demo_fleetclaim';
const USERNAME = 'fc_integration';
const PASSWORD = 'Incident87d60490Report2026!';

function apiCall(method, params) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ method, params });
        const options = {
            hostname: SERVER,
            port: 443,
            path: '/apiv1',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.error) reject(new Error(result.error.message));
                    else resolve(result.result);
                } catch (e) {
                    reject(new Error(`Parse error: ${data.substring(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    console.log('🔐 Authenticating...');
    const auth = await apiCall('Authenticate', { userName: USERNAME, password: PASSWORD, database: DATABASE });
    const credentials = auth.credentials;
    console.log('✅ Authenticated');

    // Get all security groups
    console.log('\n🔒 Getting all security groups...');
    try {
        const groups = await apiCall('Get', {
            typeName: 'Group',
            credentials
        });
        
        // Filter to security-related groups
        const securityGroups = groups.filter(g => 
            g.id?.includes('Security') || 
            g.name?.toLowerCase().includes('admin') ||
            g.name?.toLowerCase().includes('system')
        );
        
        console.log('Security groups found:', securityGroups.length);
        securityGroups.forEach(g => {
            console.log(`   - ${g.id}: ${g.name || '(no name)'}`);
        });
        
        // Find AddInData-related stuff
        const addInGroups = groups.filter(g => 
            g.id?.toLowerCase().includes('addin') ||
            g.name?.toLowerCase().includes('addin')
        );
        console.log('\nAddIn-related groups:', addInGroups.length);
        addInGroups.forEach(g => {
            console.log(`   - ${g.id}: ${g.name || '(no name)'}`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    }

    // List all users to see security group patterns
    console.log('\n👥 Listing all users...');
    try {
        const users = await apiCall('Get', {
            typeName: 'User',
            credentials
        });
        console.log('Users:', users.length);
        users.forEach(u => {
            console.log(`   - ${u.name}: securityGroups=[${u.securityGroups?.map(g => g.id).join(', ')}]`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main().catch(err => console.error('Fatal:', err.message));
