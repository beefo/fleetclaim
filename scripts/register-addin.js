#!/usr/bin/env node
/**
 * Register FleetClaim Add-In in MyGeotab SystemSettings
 */

const https = require('https');

const SERVER = 'my.geotab.com';
const DATABASE = 'demo_fleetclaim';
const USERNAME = 'fc_integration';
const PASSWORD = 'Incident87d60490Report2026!';
const ADDIN_URL = 'https://fleetclaim-addin-589116575765.us-central1.run.app';

function apiCall(method, params) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ method, params });
        console.log(`\n>>> ${method}:`, JSON.stringify(params, null, 2).substring(0, 500));

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
                console.log(`<<< Response: ${data.substring(0, 500)}`);
                try {
                    const result = JSON.parse(data);
                    if (result.error) {
                        reject(new Error(result.error.message || JSON.stringify(result.error)));
                    } else {
                        resolve(result.result);
                    }
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
    console.log('🔐 Authenticating to Geotab...');
    const auth = await apiCall('Authenticate', {
        userName: USERNAME,
        password: PASSWORD,
        database: DATABASE
    });
    const credentials = auth.credentials;
    console.log('\n✅ Authenticated');

    // Get current SystemSettings
    console.log('\n📋 Getting current SystemSettings...');
    const settings = await apiCall('Get', { 
        typeName: 'SystemSettings',
        credentials 
    });
    
    console.log('\nFull settings response:', JSON.stringify(settings, null, 2));
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
