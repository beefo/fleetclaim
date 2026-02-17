#!/usr/bin/env node
/**
 * Test the FleetClaim Add-In by logging into MyGeotab and navigating to it
 */

const puppeteer = require('puppeteer');

const DATABASE = 'demo_fleetclaim';
const USERNAME = 'fc_integration';
const PASSWORD = 'Incident87d60490Report2026!';

async function testAddIn() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        // Enable console logging
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
        
        console.log('Navigating to MyGeotab login...');
        await page.goto('https://my.geotab.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: '/tmp/myg-01-login.png' });
        console.log('Screenshot: /tmp/myg-01-login.png');
        
        // Click "Specify database" link to expand
        console.log('Clicking Specify database...');
        await page.evaluate(() => {
            const links = document.querySelectorAll('a, button, span, div');
            for (const link of links) {
                if (link.textContent.includes('Specify database')) {
                    link.click();
                    return true;
                }
            }
            return false;
        });
        await new Promise(r => setTimeout(r, 1000));
        
        await page.screenshot({ path: '/tmp/myg-02-expanded.png' });
        console.log('Screenshot: /tmp/myg-02-expanded.png');
        
        // Get all text inputs (not checkbox)
        console.log('Finding text inputs...');
        const textInputs = await page.$$('input[type="text"]');
        console.log(`Found ${textInputs.length} text inputs`);
        
        // First text input should be email, second should be database
        if (textInputs.length >= 1) {
            console.log('Filling email...');
            await textInputs[0].click();
            await textInputs[0].type(USERNAME, { delay: 50 });
        }
        
        if (textInputs.length >= 2) {
            console.log('Filling database...');
            await textInputs[1].click();
            await textInputs[1].type(DATABASE, { delay: 50 });
        }
        
        await page.screenshot({ path: '/tmp/myg-03-filled.png' });
        console.log('Screenshot: /tmp/myg-03-filled.png');
        
        // Click Next button
        console.log('Clicking Next...');
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.includes('Next')) {
                    btn.click();
                    return;
                }
            }
        });
        
        // Wait for password page
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: '/tmp/myg-04-step2.png' });
        console.log('Screenshot: /tmp/myg-04-step2.png');
        
        // Look for password field
        console.log('Looking for password field...');
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) {
            console.log('Filling password...');
            await passwordInput.click();
            await passwordInput.type(PASSWORD, { delay: 50 });
            
            await page.screenshot({ path: '/tmp/myg-05-password.png' });
            console.log('Screenshot: /tmp/myg-05-password.png');
            
            // Click Log in button
            console.log('Clicking Log in...');
            await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent.includes('Log in') || btn.textContent.includes('Next')) {
                        btn.click();
                        return;
                    }
                }
            });
        } else {
            console.log('No password field found - login may have failed');
        }
        
        // Wait and check for IAM login page
        console.log('Waiting for navigation...');
        await new Promise(r => setTimeout(r, 3000));
        
        // Check if on IAM login page (login.geotab.com)
        let currentUrl = page.url();
        console.log('URL after first login:', currentUrl);
        
        if (currentUrl.includes('login.geotab.com')) {
            console.log('On Geotab IAM page, filling password...');
            const iamPassword = await page.$('input[type="password"]');
            if (iamPassword) {
                // Clear any existing value first
                await iamPassword.click({ clickCount: 3 }); // Select all
                await page.keyboard.press('Backspace'); // Clear
                await iamPassword.type(PASSWORD, { delay: 50 });
                await page.screenshot({ path: '/tmp/myg-iam-password.png' });
                
                // Click Log In button
                console.log('Clicking IAM Log In...');
                await page.evaluate(() => {
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {
                        if (btn.textContent.includes('Log In') || btn.textContent.includes('Log in')) {
                            btn.click();
                            return;
                        }
                    }
                });
            }
        }
        
        // Wait for page to load
        console.log('Waiting for page...');
        await new Promise(r => setTimeout(r, 5000));
        
        await page.screenshot({ path: '/tmp/myg-06-eula.png' });
        
        // Check for EULA acceptance
        const pageContent1 = await page.content();
        if (pageContent1.includes('End User Agreement') || pageContent1.includes('Accept')) {
            console.log('EULA detected, looking for Accept button...');
            
            // Scroll to bottom and click Accept
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await new Promise(r => setTimeout(r, 500));
            
            // Find and click the Accept button
            const clicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const btn of buttons) {
                    if (btn.textContent.trim() === 'Accept') {
                        btn.scrollIntoView();
                        btn.focus();
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            
            console.log('Accept button clicked:', clicked);
            await new Promise(r => setTimeout(r, 5000));
        }
        
        await page.screenshot({ path: '/tmp/myg-06-dashboard.png' });
        console.log('Screenshot: /tmp/myg-06-dashboard.png');
        console.log('Current URL:', page.url());
        
        // Check if we're logged in
        currentUrl = page.url();
        if (currentUrl.includes('login')) {
            console.log('❌ Still on login page');
        } else {
            console.log('✅ Logged in successfully!');
        }
        
        // Look for Add-In in the page
        const pageContent = await page.content();
        if (pageContent.includes('Claim Reports')) {
            console.log('✅ Found "Claim Reports" in page!');
        } else if (pageContent.includes('FleetClaim')) {
            console.log('✅ Found "FleetClaim" in page!');
        } else {
            console.log('Add-In text not found in main content');
        }
        
        // Final screenshot
        await page.screenshot({ path: '/tmp/myg-final.png', fullPage: true });
        console.log('Final screenshot: /tmp/myg-final.png');
        
        console.log('\n=== Page Title ===');
        console.log(await page.title());
        
    } catch (err) {
        console.error('Error:', err.message);
        throw err;
    } finally {
        await browser.close();
    }
}

testAddIn().then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
}).catch(err => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
});
