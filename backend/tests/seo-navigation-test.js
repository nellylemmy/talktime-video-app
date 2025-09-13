/**
 * TalkTime SEO and Navigation Test Script
 * 
 * This script tests the SEO elements and navigation functionality
 * of the TalkTime volunteer dashboard pages.
 */

const puppeteer = require('puppeteer');

async function runTests() {
  console.log('Starting SEO and Navigation Tests...');
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Test 1: Students Page SEO Elements
    console.log('\n🧪 Test 1: Students Page SEO Elements');
    await page.goto('http://localhost:3000/volunteer/dashboard/students');
    
    // Check title
    const studentsTitle = await page.title();
    console.log(`✓ Page title: ${studentsTitle}`);
    
    // Check meta description
    const studentsDescription = await page.$eval('meta[name="description"]', el => el.content);
    console.log(`✓ Meta description: ${studentsDescription}`);
    
    // Check canonical link
    const studentsCanonical = await page.$eval('link[rel="canonical"]', el => el.href);
    console.log(`✓ Canonical link: ${studentsCanonical}`);
    
    // Check robots tag
    const studentsRobots = await page.$eval('meta[name="robots"]', el => el.content);
    console.log(`✓ Robots tag: ${studentsRobots}`);
    
    // Test 2: Navigation to Upcoming Page
    console.log('\n🧪 Test 2: Navigation to Upcoming Page');
    await page.click('a[href="/volunteer/dashboard/upcoming"]');
    await page.waitForSelector('.tab-content');
    
    // Check URL after navigation
    const upcomingUrl = page.url();
    console.log(`✓ URL after navigation: ${upcomingUrl}`);
    
    // Check title
    const upcomingTitle = await page.title();
    console.log(`✓ Page title: ${upcomingTitle}`);
    
    // Check meta description
    const upcomingDescription = await page.$eval('meta[name="description"]', el => el.content);
    console.log(`✓ Meta description: ${upcomingDescription}`);
    
    // Test 3: Navigation to History Page
    console.log('\n🧪 Test 3: Navigation to History Page');
    await page.click('a[href="/volunteer/dashboard/history"]');
    await page.waitForSelector('.tab-content');
    
    // Check URL after navigation
    const historyUrl = page.url();
    console.log(`✓ URL after navigation: ${historyUrl}`);
    
    // Check title
    const historyTitle = await page.title();
    console.log(`✓ Page title: ${historyTitle}`);
    
    // Check meta description
    const historyDescription = await page.$eval('meta[name="description"]', el => el.content);
    console.log(`✓ Meta description: ${historyDescription}`);
    
    // Test 4: Navigation to Student Detail Page (mock student)
    console.log('\n🧪 Test 4: Navigation to Student Detail Page');
    await page.goto('http://localhost:3000/volunteer/dashboard/students');
    
    // Mock student card click (since we don't have real data)
    await page.evaluate(() => {
      // Create a mock student card if none exists
      if (document.querySelectorAll('.student-card').length === 0) {
        const mockCard = document.createElement('div');
        mockCard.className = 'student-card';
        mockCard.innerHTML = '<a href="/volunteer/dashboard/students/12345-john-doe"></a>';
        document.querySelector('.students-grid').appendChild(mockCard);
      }
      
      // Click the first student card
      document.querySelector('.student-card a').click();
    });
    
    // Wait for navigation
    await page.waitForNavigation();
    
    // Check URL after navigation
    const detailUrl = page.url();
    console.log(`✓ URL after navigation: ${detailUrl}`);
    
    // Check if canonical link is updated dynamically
    const detailCanonical = await page.$eval('#canonical-link', el => el.href);
    console.log(`✓ Canonical link: ${detailCanonical}`);
    
    // Test 5: Browser History Navigation
    console.log('\n🧪 Test 5: Browser History Navigation');
    
    // Go back
    await page.goBack();
    const afterBackUrl = page.url();
    console.log(`✓ URL after going back: ${afterBackUrl}`);
    
    // Go forward
    await page.goForward();
    const afterForwardUrl = page.url();
    console.log(`✓ URL after going forward: ${afterForwardUrl}`);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

runTests();
