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
        
        // Go to MyGeotab
        console.log('📍 Going to MyGeotab...');
        await page.goto('https://my.geotab.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Expand database and fill login
        await page.evaluate(() => {
            const els = document.querySelectorAll('a, button, span, div');
            els.forEach(el => {
                if (el.textContent && el.textContent.includes('Specify database')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 1000));
        
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length >= 1) await textInputs[0].type(USERNAME, { delay: 20 });
        if (textInputs.length >= 2) await textInputs[1].type(DATABASE, { delay: 20 });
        
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            btns.forEach(btn => {
                if (btn.textContent && btn.textContent.includes('Next')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 3000));
        
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) await passwordInput.type(PASSWORD, { delay: 20 });
        
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            btns.forEach(btn => {
                if (btn.textContent && btn.textContent.trim() === 'Log In') btn.click();
            });
        });
        
        console.log('⏳ Waiting for dashboard...');
        await new Promise(r => setTimeout(r, 15000));
        
        // Close any welcome modals by clicking Skip/Ok/Close
        console.log('🔄 Closing modals...');
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            btns.forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'skip' || text === 'ok') btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        
        await page.screenshot({ path: '/tmp/bif-dashboard.png' });
        console.log('📸 Dashboard screenshot saved');
        
        // Now click on Add-Ins in the left sidebar
        console.log('🔍 Clicking Add-Ins menu...');
        await page.evaluate(() => {
            const spans = document.querySelectorAll('span, a, div');
            for (const el of spans) {
                if (el.textContent && el.textContent.trim() === 'Add-Ins') {
                    el.click();
                    break;
                }
            }
        });
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: '/tmp/bif-addins.png' });
        
        // Look for Claim Reports submenu item
        console.log('🔍 Looking for Claim Reports...');
        const found = await page.evaluate(() => {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                const text = el.textContent || '';
                if (text.includes('Claim Reports')) {
                    if (el.click) el.click();
                    return true;
                }
            }
            return false;
        });
        console.log('Claim Reports found:', found);
        
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: '/tmp/bif-final.png' });
        
        console.log('📍 Final URL:', page.url());
        
    } finally {
        await browser.close();
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
});
