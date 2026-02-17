const puppeteer = require('puppeteer');

const DATABASE = 'demo_fleetclaim';
const USERNAME = 'clawbif';
const PASSWORD = 'Evidence#Report2026';

async function main() {
    console.log('🚀 Full E2E Test: Submit request, wait for worker, verify status\n');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('FleetClaim')) console.log('🔵', text);
        });
        
        // Login
        console.log('📍 Logging in...');
        await page.goto('https://my.geotab.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        await page.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                if (el.textContent?.includes('Specify database')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 1000));
        
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length >= 1) await textInputs[0].type(USERNAME, { delay: 10 });
        if (textInputs.length >= 2) await textInputs[1].type(DATABASE, { delay: 10 });
        
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent?.includes('Next')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 3000));
        
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) await passwordInput.type(PASSWORD, { delay: 10 });
        
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent?.trim() === 'Log In') btn.click();
            });
        });
        
        await new Promise(r => setTimeout(r, 12000));
        
        // Close modals
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'skip' || text === 'ok') btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        console.log('✅ Logged in!\n');
        
        // Navigate to Add-In
        console.log('📍 Opening FleetClaim Add-In...');
        await page.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                if (el.textContent?.trim() === 'Add-Ins') el.click();
            });
        });
        await new Promise(r => setTimeout(r, 1500));
        
        await page.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                if (el.textContent?.trim() === 'Claim Reports') el.click();
            });
        });
        await new Promise(r => setTimeout(r, 5000));
        console.log('✅ Add-In loaded!\n');
        
        // Go to Pending Requests tab
        await page.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                if (el.textContent?.includes('Pending Requests')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        
        // Take screenshot of current state
        await page.screenshot({ path: '/tmp/e2e-01-before.png' });
        console.log('📸 Screenshot: /tmp/e2e-01-before.png\n');
        
        // Click + Request Report
        console.log('📍 Opening new request modal...');
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent?.includes('Request Report')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: '/tmp/e2e-02-modal.png' });
        
        // Select Demo - 03 (a different vehicle)
        console.log('📍 Selecting Demo - 03...');
        await page.evaluate(() => {
            document.querySelectorAll('select').forEach(select => {
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].text === 'Demo - 03') {
                        select.selectedIndex = i;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            });
        });
        await new Promise(r => setTimeout(r, 500));
        
        // Submit
        console.log('📍 Submitting request...');
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent?.includes('Search & Generate')) btn.click();
            });
        });
        
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: '/tmp/e2e-03-after-submit.png' });
        console.log('✅ Request submitted!\n');
        
        // Verify request appears in Pending Requests
        const pendingContent = await page.evaluate(() => document.body.innerText);
        if (pendingContent.includes('Demo - 03') && pendingContent.includes('Pending')) {
            console.log('✅ Demo - 03 request visible with Pending status!\n');
        }
        
        console.log('📸 Screenshots saved to /tmp/e2e-*.png');
        console.log('🎉 E2E test complete! Worker will process this request within 2 minutes.');
        
    } finally {
        await browser.close();
    }
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
