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
            if (msg.text().includes('FleetClaim')) {
                console.log('BROWSER:', msg.text());
            }
        });
        
        console.log('📍 Navigating to MyGeotab...');
        await page.goto('https://my.geotab.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Click "Specify database"
        await page.evaluate(() => {
            document.querySelectorAll('a, button, span, div').forEach(el => {
                if (el.textContent.includes('Specify database')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 1000));
        
        // Fill login form
        console.log('📝 Filling login form...');
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length >= 1) await textInputs[0].type(USERNAME, { delay: 30 });
        if (textInputs.length >= 2) await textInputs[1].type(DATABASE, { delay: 30 });
        
        // Click Next
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent.includes('Next')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 4000));
        
        // Fill password on IAM page
        console.log('🔐 Logging in...');
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) {
            await passwordInput.click();
            await passwordInput.type(PASSWORD, { delay: 30 });
        }
        
        // Click Log In
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent.trim() === 'Log In') btn.click();
            });
        });
        
        // Wait for page to load
        await new Promise(r => setTimeout(r, 10000));
        
        // Check for EULA and accept it
        console.log('📜 Checking for EULA...');
        const pageText = await page.evaluate(() => document.body.innerText);
        
        if (pageText.includes('End User Agreement')) {
            console.log('📜 EULA found! Scrolling to bottom and clicking Accept...');
            
            // Scroll the EULA content to bottom
            await page.evaluate(() => {
                // Find any scrollable element and scroll it
                const scrollables = document.querySelectorAll('div');
                scrollables.forEach(el => {
                    if (el.scrollHeight > el.clientHeight) {
                        el.scrollTop = el.scrollHeight;
                    }
                });
            });
            await new Promise(r => setTimeout(r, 1000));
            
            // Find and click Accept button using multiple methods
            const acceptClicked = await page.evaluate(() => {
                // Method 1: Find button with Accept text
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent.trim().toLowerCase() === 'accept') {
                        console.log('Found Accept button, clicking...');
                        btn.click();
                        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        return 'button';
                    }
                }
                
                // Method 2: Find any clickable with Accept
                const allElements = document.querySelectorAll('*');
                for (const el of allElements) {
                    if (el.textContent.trim().toLowerCase() === 'accept' && 
                        (el.tagName === 'BUTTON' || el.tagName === 'A' || el.onclick)) {
                        el.click();
                        return 'element';
                    }
                }
                
                return 'not found';
            });
            
            console.log('Accept click result:', acceptClicked);
            
            // Also try clicking by coordinates (the button appears to be at bottom left)
            await page.mouse.click(220, 830);
            
            await new Promise(r => setTimeout(r, 5000));
            await page.screenshot({ path: '/tmp/bif-after-accept.png' });
        }
        
        // Wait more and check result
        await new Promise(r => setTimeout(r, 5000));
        await page.screenshot({ path: '/tmp/bif-final.png' });
        
        console.log('📍 Final URL:', page.url());
        
        // Check if we're on dashboard
        const finalText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        console.log('📄 Page content preview:', finalText.substring(0, 200));
        
    } finally {
        await browser.close();
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
