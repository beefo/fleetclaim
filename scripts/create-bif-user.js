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
                try {
                    const result = JSON.parse(data);
                    if (result.error) reject(new Error(result.error.message));
                    else resolve(result.result);
                } catch (e) {
                    reject(new Error('Parse error: ' + data.substring(0, 200)));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    const auth = await apiCall('Authenticate', { 
        userName: 'fc_integration', 
        password: 'Incident87d60490Report2026!', 
        database: DATABASE 
    });
    const credentials = auth.credentials;
    console.log('✅ Authenticated\n');

    // Create clawbif user - non-email username to allow password in IAM mode
    const password = 'Evidence#Report2026';
    const newUser = {
        name: 'clawbif',  // Non-email username
        firstName: 'Bif',
        lastName: 'Assistant',
        password: password,
        userAuthenticationType: 'BasicAuthentication',
        securityGroups: [{ id: 'GroupEverythingSecurityId' }],
        companyGroups: [{ id: 'GroupCompanyId' }],
        isDriver: false,
        activeFrom: new Date().toISOString(),
        activeTo: '2050-01-01T00:00:00.000Z'
    };

    console.log('Creating user: clawbif');
    
    try {
        const userId = await apiCall('Add', {
            typeName: 'User',
            entity: newUser,
            credentials
        });
        console.log('✅ User created! ID:', userId);
        
        console.log('\nTesting authentication...');
        const testAuth = await apiCall('Authenticate', {
            userName: 'clawbif',
            password: password,
            database: DATABASE
        });
        console.log('✅ Authentication works!\n');
        console.log('========================================');
        console.log('Bif MyGeotab Login:');
        console.log('  Database: demo_fleetclaim');
        console.log('  Username: clawbif');
        console.log('  Password:', password);
        console.log('========================================');
        
    } catch (err) {
        console.log('❌ Failed:', err.message);
    }
}

main().catch(console.error);
