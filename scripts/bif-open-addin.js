const puppeteer = require('puppeteer');

const DATABASE = 'demo_fleetclaim';
const USERNAME = 'clawbif';
const PASSWORD = 'Evidence#Report2026';

async function main() {
    console.log('🚀 Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('FleetClaim')) console.log('BROWSER:', text);
        });
        
        // Login
        console.log('📍 Logging in...');
        await page.goto('https://my.geotab.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        await page.evaluate(() => {
            document.querySelectorAll('a, button, span, div').forEach(el => {
                if (el.textContent && el.textContent.includes('Specify database')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 1000));
        
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length >= 1) await textInputs[0].type(USERNAME, { delay: 15 });
        if (textInputs.length >= 2) await textInputs[1].type(DATABASE, { delay: 15 });
        
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent && btn.textContent.includes('Next')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 3000));
        
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) await passwordInput.type(PASSWORD, { delay: 15 });
        
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent && btn.textContent.trim() === 'Log In') btn.click();
            });
        });
        
        console.log('⏳ Waiting for dashboard...');
        await new Promise(r => setTimeout(r, 12000));
        
        // Close welcome modals
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'skip' || text === 'ok') btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        
        // Click Add-Ins to expand
        console.log('🔍 Expanding Add-Ins menu...');
        await page.click('text=Add-Ins');
        await new Promise(r => setTimeout(r, 1500));
        
        // Now click Claim Reports
        console.log('🔍 Clicking Claim Reports...');
        await page.evaluate(() => {
            // Find all elements and click on "Claim Reports"
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                if (walker.currentNode.textContent.trim() === 'Claim Reports') {
                    const el = walker.currentNode.parentElement;
                    if (el) {
                        console.log('Found Claim Reports, clicking parent:', el.tagName);
                        el.click();
                        return;
                    }
                }
            }
        });
        
        await new Promise(r => setTimeout(r, 5000));
        await page.screenshot({ path: '/tmp/bif-fleetclaim.png' });
        
        console.log('📍 URL:', page.url());
        
        // Check for iframe (Add-In content loads in iframe)
        const frames = page.frames();
        console.log('Frames found:', frames.length);
        
        for (const frame of frames) {
            const url = frame.url();
            if (url.includes('fleetclaim')) {
                console.log('Found FleetClaim frame:', url);
                const content = await frame.evaluate(() => document.body.innerText.substring(0, 300));
                console.log('Frame content:', content);
            }
        }
        
    } finally {
        await browser.close();
    }
}

main().catch(err => console.error('❌ Error:', err.message));
