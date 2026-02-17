const puppeteer = require('puppeteer');

const DATABASE = 'demo_fleetclaim';
const USERNAME = 'clawbif';
const PASSWORD = 'Evidence#Report2026';

async function main() {
    console.log('🚀 E2E Test v2: Submit a new request\n');
    
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
        
        // === LOGIN ===
        console.log('📍 Logging in...');
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
        console.log('📍 Opening FleetClaim Add-In...');
        
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
        
        // === CLICK PENDING REQUESTS TAB ===
        console.log('📍 Going to Pending Requests tab...');
        await page.evaluate(() => {
            const tabs = document.querySelectorAll('[role="tab"], button, a, span');
            for (const tab of tabs) {
                if (tab.textContent && tab.textContent.includes('Pending Requests')) {
                    tab.click();
                    break;
                }
            }
        });
        await new Promise(r => setTimeout(r, 2000));
        
        // === CLICK "+ Request Report" BUTTON ===
        console.log('📍 Clicking "+ Request Report" button...');
        const requestBtnClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const text = btn.textContent || '';
                if (text.includes('Request Report')) {
                    console.log('Found button:', text);
                    btn.click();
                    return text;
                }
            }
            return null;
        });
        console.log('Clicked button:', requestBtnClicked);
        
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: '/tmp/e2e-v2-modal.png' });
        
        // === FILL OUT FORM ===
        console.log('📍 Filling out request form...');
        
        // Select a device
        const devices = await page.evaluate(() => {
            const select = document.querySelector('#device-select, select[id*="device"]');
            if (!select) {
                // Try finding any select in modal
                const selects = document.querySelectorAll('select');
                for (const s of selects) {
                    const options = Array.from(s.options).map(o => o.text);
                    if (options.some(o => o.includes('Demo'))) {
                        return { found: true, options };
                    }
                }
            }
            if (select) {
                const options = Array.from(select.options).map(o => o.text);
                return { found: true, options };
            }
            return { found: false };
        });
        console.log('Device select:', devices);
        
        // Select second option (first real device)
        await page.evaluate(() => {
            const selects = document.querySelectorAll('select');
            for (const select of selects) {
                if (select.options.length > 1 && 
                    Array.from(select.options).some(o => o.text.includes('Demo'))) {
                    select.selectedIndex = 1;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('Selected:', select.options[1].text);
                    break;
                }
            }
        });
        
        await new Promise(r => setTimeout(r, 500));
        await page.screenshot({ path: '/tmp/e2e-v2-filled.png' });
        
        // === SUBMIT ===
        console.log('📍 Submitting request...');
        const submitResult = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const text = (btn.textContent || '').trim();
                if (text === 'Submit Request' || text === 'Submit') {
                    btn.click();
                    return text;
                }
            }
            return null;
        });
        console.log('Submit clicked:', submitResult);
        
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: '/tmp/e2e-v2-after.png' });
        
        // Check result
        const finalContent = await page.evaluate(() => {
            return document.body.innerText.substring(0, 600);
        });
        
        // Count pending requests
        const pendingCount = (finalContent.match(/Pending/g) || []).length;
        console.log('\n📋 Pending requests visible:', pendingCount);
        
        if (finalContent.includes('clawbif')) {
            console.log('✅ New request by clawbif found!');
        }
        
        console.log('\n📸 Screenshots saved to /tmp/e2e-v2-*.png');
        
    } finally {
        await browser.close();
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
