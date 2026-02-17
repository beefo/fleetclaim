const puppeteer = require('puppeteer');

const DATABASE = 'demo_fleetclaim';
const USERNAME = 'clawbif';
const PASSWORD = 'Evidence#Report2026';

async function main() {
    console.log('🚀 Quick submit test\n');
    
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
        
        // Close modals
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'skip' || text === 'ok') btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        
        // Nav to Add-In
        console.log('📍 Opening Add-In...');
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
        
        // Go to Pending tab
        await page.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                if (el.textContent?.includes('Pending Requests')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        
        // Click + Request Report
        console.log('📍 Opening modal...');
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent?.includes('Request Report')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 2000));
        
        // Select Demo - 05 (different from Demo - 01)
        console.log('📍 Selecting Demo - 05...');
        await page.evaluate(() => {
            document.querySelectorAll('select').forEach(select => {
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].text === 'Demo - 05') {
                        select.selectedIndex = i;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            });
        });
        await new Promise(r => setTimeout(r, 500));
        
        // Click "Search & Generate Reports"
        console.log('📍 Clicking Search & Generate Reports...');
        const clicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent?.includes('Search & Generate')) {
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        console.log('Clicked:', clicked);
        
        await new Promise(r => setTimeout(r, 4000));
        await page.screenshot({ path: '/tmp/submit-result.png' });
        
        // Check pending count
        const content = await page.evaluate(() => document.body.innerText);
        const pendingMatches = content.match(/Demo - \d+.*?Pending/g) || [];
        console.log('\n📋 Pending requests found:', pendingMatches.length);
        pendingMatches.forEach(m => console.log('  -', m));
        
    } finally {
        await browser.close();
    }
}

main().catch(err => console.error('❌', err.message));
