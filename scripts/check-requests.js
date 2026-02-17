const https = require('https');

const SERVER = 'my.geotab.com';
const DATABASE = 'demo_fleetclaim';
const USERNAME = 'fc_integration';
const PASSWORD = 'Incident87d60490Report2026!';
const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';

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
    const auth = await apiCall('Authenticate', { userName: USERNAME, password: PASSWORD, database: DATABASE });
    const credentials = auth.credentials;
    console.log('✅ Authenticated\n');

    const data = await apiCall('Get', {
        typeName: 'AddInData',
        search: { addInId: ADDIN_ID },
        credentials
    });
    
    console.log('AddInData records:', data.length);
    data.forEach((item, i) => {
        console.log(`\n--- Record ${i + 1} ---`);
        console.log(JSON.stringify(item.details, null, 2));
    });
}

main().catch(console.error);
