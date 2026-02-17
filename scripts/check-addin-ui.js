#!/usr/bin/env node
const puppeteer = require('puppeteer');

const DATABASE = 'demo_fleetclaim';
const USERNAME = 'fc_integration';
const PASSWORD = 'Incident87d60490Report2026!';

async function main() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        
        page.on('console', msg => {
            if (msg.type() === 'error' || msg.text().includes('FleetClaim')) {
                console.log('BROWSER:', msg.text());
            }
        });
        
        console.log('Navigating to MyGeotab...');
        await page.goto('https://my.geotab.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Click "Specify database"
        console.log('Expanding database field...');
        await page.evaluate(() => {
            document.querySelectorAll('a, button, span, div').forEach(el => {
                if (el.textContent.includes('Specify database')) el.click();
            });
        });
        await new Promise(r => setTimeout(r, 1000));
        
        // Fill login form
        console.log('Filling login form...');
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length >= 1) await textInputs[0].type(USERNAME, { delay: 30 });
        if (textInputs.length >= 2) await textInputs[1].type(DATABASE, { delay: 30 });
        
        // Click Next
        console.log('Clicking Next...');
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent.includes('Next')) btn.click();
            });
        });
        await new Promise(r => setTimeout(r, 4000));
        
        // Now we're on IAM login - fill password and click Log In
        console.log('On IAM login page, filling password...');
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) {
            await passwordInput.click();
            await passwordInput.type(PASSWORD, { delay: 30 });
        }
        await page.screenshot({ path: '/tmp/addin-02-iam.png' });
        
        // Click "Log In" button on IAM page
        console.log('Clicking Log In...');
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent.trim() === 'Log In') btn.click();
            });
        });
        
        // Wait for redirect to MyGeotab
        console.log('Waiting for MyGeotab dashboard...');
        await new Promise(r => setTimeout(r, 10000));
        
        await page.screenshot({ path: '/tmp/addin-03-after-login.png' });
        console.log('URL:', page.url());
        
        // Check page content
        const pageText = await page.evaluate(() => document.body.innerText.substring(0, 800));
        console.log('Page text:', pageText.substring(0, 400));
        
        // Look for EULA
        if (pageText.includes('End User Agreement') || pageText.includes('EULA')) {
            console.log('\n⚠️  EULA screen detected!');
            await page.screenshot({ path: '/tmp/addin-eula.png' });
            
            // Try to accept
            const accepted = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent.includes('Accept')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            console.log('Clicked Accept:', accepted);
            await new Promise(r => setTimeout(r, 5000));
        }
        
        await page.screenshot({ path: '/tmp/addin-04-dashboard.png' });
        
        // If we're on dashboard, look for Add-In
        if (page.url().includes('my.geotab.com')) {
            console.log('\nLooking for FleetClaim/Claim Reports in menu...');
            
            // Get all visible text
            const allText = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('*'))
                    .filter(el => el.offsetParent !== null)
                    .map(el => el.textContent.trim())
                    .filter(t => t.length > 0 && t.length < 100)
                    .slice(0, 100);
            });
            
            const claimItems = allText.filter(t => 
                t.toLowerCase().includes('claim') || 
                t.toLowerCase().includes('fleetclaim') ||
                t.toLowerCase().includes('activity')
            );
            console.log('Relevant menu items:', claimItems);
        }
        
        console.log('\nScreenshots saved to /tmp/addin-*.png');
        
    } finally {
        await browser.close();
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
