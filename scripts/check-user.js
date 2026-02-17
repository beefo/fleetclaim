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
                const result = JSON.parse(data);
                if (result.error) reject(new Error(result.error.message));
                else resolve(result.result);
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    // Auth with fc_integration
    const auth = await apiCall('Authenticate', { 
        userName: 'fc_integration', 
        password: 'Incident87d60490Report2026!', 
        database: DATABASE 
    });
    const credentials = auth.credentials;
    console.log('✅ Authenticated as fc_integration\n');

    // Get fleetclaim@fleetclaim.com user details
    const users = await apiCall('Get', {
        typeName: 'User',
        search: { name: 'fleetclaim@fleetclaim.com' },
        credentials
    });
    
    if (users && users.length > 0) {
        const user = users[0];
        console.log('User: fleetclaim@fleetclaim.com');
        console.log('  ID:', user.id);
        console.log('  userAuthenticationType:', user.userAuthenticationType);
        console.log('  isDriver:', user.isDriver);
        console.log('  securityGroups:', user.securityGroups?.map(g => g.id).join(', '));
        console.log('  Full object:', JSON.stringify(user, null, 2).substring(0, 1000));
    } else {
        console.log('User not found');
    }
}

main().catch(console.error);
