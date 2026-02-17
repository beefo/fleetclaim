const https = require('https');

const SERVER = 'my.geotab.com';
const DATABASE = 'demo_fleetclaim';

function apiCall(method, params) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ method, params });
        const options = {
            hostname: SERVER, port: 443, path: '/apiv1', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log('Response:', data.substring(0, 500));
                try {
                    const result = JSON.parse(data);
                    if (result.error) reject(result.error);
                    else resolve(result.result);
                } catch (e) {
                    reject(new Error('Parse error'));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    // Try to auth with fleetclaim@fleetclaim.com
    console.log('Trying to authenticate fleetclaim@fleetclaim.com...\n');
    
    // We need to know/set the password first
    // Let's reset it using fc_integration
    const auth = await apiCall('Authenticate', { 
        userName: 'fc_integration', 
        password: 'Incident87d60490Report2026!', 
        database: DATABASE 
    });
    const credentials = auth.credentials;
    console.log('\n✅ Authenticated as fc_integration');
    
    // Get the user
    const users = await apiCall('Get', {
        typeName: 'User',
        search: { name: 'fleetclaim@fleetclaim.com' },
        credentials
    });
    
    if (!users || users.length === 0) {
        console.log('User not found');
        return;
    }
    
    const user = users[0];
    console.log('\nUser found, ID:', user.id);
    
    // Set a new password
    const newPassword = 'FleetClaim2026!';
    console.log('\nSetting new password...');
    
    try {
        await apiCall('Set', {
            typeName: 'User',
            entity: {
                ...user,
                password: newPassword
            },
            credentials
        });
        console.log('✅ Password set successfully!');
    } catch (err) {
        console.log('❌ Failed to set password:', err.message || JSON.stringify(err));
    }
    
    // Now try to authenticate with the new password
    console.log('\nTrying to authenticate with new password...');
    try {
        const authResult = await apiCall('Authenticate', {
            userName: 'fleetclaim@fleetclaim.com',
            password: newPassword,
            database: DATABASE
        });
        console.log('\n✅ Authentication successful!');
        console.log('Session:', authResult.credentials?.sessionId?.substring(0, 20) + '...');
    } catch (err) {
        console.log('❌ Authentication failed:', err.message || JSON.stringify(err));
    }
}

main().catch(console.error);
