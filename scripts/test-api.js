#!/usr/bin/env node
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
                    reject(new Error(`Parse error: ${data.substring(0, 500)}`));
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
    console.log('✅ Authenticated\n');

    console.log('Using AddIn ID:', ADDIN_ID);

    // Test write
    console.log('\n✏️ Testing AddInData write...');
    try {
        const testId = await apiCall('Add', {
            typeName: 'AddInData',
            entity: {
                addInId: ADDIN_ID,
                details: { type: 'test', payload: { message: 'Hello!', ts: new Date().toISOString() } }
            },
            credentials
        });
        console.log('✅ Write works! Created:', testId);
        
        // Read it back
        console.log('\n📖 Reading AddInData...');
        const data = await apiCall('Get', {
            typeName: 'AddInData',
            search: { addInId: ADDIN_ID },
            credentials
        });
        console.log('✅ Read works! Found', data.length, 'records');
        if (data.length > 0) {
            console.log('   First record:', JSON.stringify(data[0], null, 2).substring(0, 300));
        }
        
        // Clean up
        await apiCall('Remove', {
            typeName: 'AddInData', 
            entity: { id: testId },
            credentials
        });
        console.log('🧹 Cleaned up');
    } catch (err) {
        console.log('❌ Failed:', err.message);
    }

    console.log('\n✅ Done!');
}

main().catch(console.error);
