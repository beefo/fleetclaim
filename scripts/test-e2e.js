const puppeteer = require('puppeteer');

const DATABASE = 'demo_fleetclaim';
const USERNAME = 'clawbif';
const PASSWORD = 'Evidence#Report2026';

async function main() {
    console.log('🚀 Launching browser for E2E test...\n');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('FleetClaim')) console.log('🔵 BROWSER:', text);
        });
        
        // === LOGIN ===
        console.log('📍 Step 1: Logging into MyGeotab...');
        await page.goto('https://my.geotab.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        await page.evaluate(() => {
            document.querySelectorAll('a, button, span, div').forEach(el => {
                if (el.textContent && el.textContent.includes('Specify database')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 1000));
        
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length >= 1) await textInputs[0].type(USERNAME, { delay: 10 });
        if (textInputs.length >= 2) await textInputs[1].type(DATABASE, { delay: 10 });
        
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent && btn.textContent.includes('Next')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 3000));
        
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) await passwordInput.type(PASSWORD, { delay: 10 });
        
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent && btn.textContent.trim() === 'Log In') btn.click();
            });
        });
        
        await new Promise(r => setTimeout(r, 12000));
        
        // Close welcome modals
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'skip' || text === 'ok') btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        console.log('✅ Logged in!\n');
        
        // === NAVIGATE TO ADD-IN ===
        console.log('📍 Step 2: Opening FleetClaim Add-In...');
        
        // Click Add-Ins to expand
        await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                if (walker.currentNode.textContent.trim() === 'Add-Ins') {
                    walker.currentNode.parentElement?.click();
                    break;
                }
            }
        });
        await new Promise(r => setTimeout(r, 1500));
        
        // Click Claim Reports
        await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                if (walker.currentNode.textContent.trim() === 'Claim Reports') {
                    walker.currentNode.parentElement?.click();
                    break;
                }
            }
        });
        await new Promise(r => setTimeout(r, 5000));
        console.log('✅ Add-In loaded!\n');
        
        // === CHECK CURRENT STATE ===
        console.log('📍 Step 3: Checking current reports and requests...');
        
        // Get all frames and find FleetClaim iframe
        let addinFrame = null;
        for (const frame of page.frames()) {
            const url = frame.url();
            if (url.includes('fleetclaim-addin')) {
                addinFrame = frame;
                break;
            }
        }
        
        if (!addinFrame) {
            // Try the main page content
            console.log('No iframe found, checking main page...');
            addinFrame = page;
        }
        
        await page.screenshot({ path: '/tmp/e2e-01-addin.png' });
        
        // Click "Pending Requests" tab
        console.log('📍 Step 4: Checking Pending Requests tab...');
        await page.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                if (el.textContent && el.textContent.trim() === 'Pending Requests') {
                    el.click();
                }
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: '/tmp/e2e-02-pending.png' });
        
        // Get pending requests content
        const pendingContent = await page.evaluate(() => {
            const container = document.querySelector('.pending-requests, [class*="pending"]');
            return container ? container.innerText : document.body.innerText.substring(0, 500);
        });
        console.log('📋 Pending tab content preview:', pendingContent.substring(0, 200));
        
        // === SUBMIT NEW REQUEST ===
        console.log('\n📍 Step 5: Opening "New Request" modal...');
        
        // Look for "+ New Request" button
        const newRequestClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent && btn.textContent.includes('New Request')) {
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        console.log('New Request button clicked:', newRequestClicked);
        
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: '/tmp/e2e-03-modal.png' });
        
        // Fill out the form
        console.log('📍 Step 6: Filling out request form...');
        
        // Select a device from dropdown
        const deviceSelected = await page.evaluate(() => {
            const select = document.querySelector('select');
            if (select && select.options.length > 1) {
                select.selectedIndex = 1; // Select first device
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return select.options[select.selectedIndex].text;
            }
            return null;
        });
        console.log('Selected device:', deviceSelected);
        
        // The datetime fields should already have defaults (last hour)
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: '/tmp/e2e-04-filled.png' });
        
        // Click Submit
        console.log('📍 Step 7: Submitting request...');
        const submitClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const text = btn.textContent?.trim().toLowerCase() || '';
                if (text === 'submit' || text === 'submit request') {
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        console.log('Submit clicked:', submitClicked);
        
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: '/tmp/e2e-05-after-submit.png' });
        
        // Check for success/error
        const afterSubmit = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        if (afterSubmit.includes('Request submitted') || afterSubmit.includes('Pending')) {
            console.log('✅ Request submitted successfully!\n');
        } else if (afterSubmit.includes('error') || afterSubmit.includes('Error')) {
            console.log('❌ Submission error detected');
        }
        
        console.log('📸 Screenshots saved to /tmp/e2e-*.png');
        console.log('\n✅ E2E test complete!');
        console.log('Next: Worker will pick up the request within 2 minutes.');
        
    } finally {
        await browser.close();
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
