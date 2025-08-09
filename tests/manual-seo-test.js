/**
 * TalkTime SEO and Navigation Test Script
 * 
 * This script can be run manually to check SEO elements on the TalkTime pages.
 * It outputs the results to the console for review.
 */

// Pages to test
const pages = [
  {
    name: 'Students Dashboard',
    url: '/volunteer/dashboard/students',
    expectedTitle: 'TalkTime - Students | Volunteer Dashboard',
    expectedElements: ['meta[name="description"]', 'link[rel="canonical"]', 'meta[name="robots"]']
  },
  {
    name: 'Upcoming Meetings',
    url: '/volunteer/dashboard/upcoming',
    expectedTitle: 'TalkTime - Upcoming Meetings | Volunteer Dashboard',
    expectedElements: ['meta[name="description"]', 'link[rel="canonical"]', 'meta[name="robots"]']
  },
  {
    name: 'Call History',
    url: '/volunteer/dashboard/history',
    expectedTitle: 'TalkTime - Call History | Volunteer Dashboard',
    expectedElements: ['meta[name="description"]', 'link[rel="canonical"]', 'meta[name="robots"]']
  },
  {
    name: 'Student Detail',
    url: '/volunteer/dashboard/students/12345-john-doe',
    expectedTitle: 'TalkTime - John Doe | Student Profile',
    expectedElements: ['meta[name="description"]', 'link[rel="canonical"]', 'meta[name="robots"]']
  },
  {
    name: 'Schedule Meeting',
    url: '/volunteer/dashboard/students/12345-john-doe/new/schedule',
    expectedTitle: 'TalkTime - Schedule Meeting | Volunteer Dashboard',
    expectedElements: ['meta[name="description"]', 'link[rel="canonical"]', 'meta[name="robots"]']
  }
];

// Function to test a page
async function testPage(page) {
  console.log(`\n🧪 Testing: ${page.name} (${page.url})`);
  
  try {
    // Navigate to the page
    window.location.href = page.url;
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check title
    const title = document.title;
    console.log(`Title: ${title}`);
    console.log(`✓ Title matches expected: ${title.includes(page.expectedTitle.split(' | ')[0])}`);
    
    // Check SEO elements
    for (const selector of page.expectedElements) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`✓ Found ${selector}: ${element.outerHTML}`);
      } else {
        console.log(`❌ Missing ${selector}`);
      }
    }
    
    // Check navigation links
    const navLinks = document.querySelectorAll('a[href^="/volunteer/dashboard/"]');
    console.log(`Navigation links found: ${navLinks.length}`);
    navLinks.forEach(link => {
      console.log(`  - ${link.textContent.trim()}: ${link.getAttribute('href')}`);
    });
    
  } catch (error) {
    console.error(`❌ Error testing ${page.name}: ${error.message}`);
  }
}

// Run tests
async function runTests() {
  console.log('🔍 Starting SEO and Navigation Tests');
  
  for (const page of pages) {
    await testPage(page);
  }
  
  console.log('\n✅ Tests completed');
}

// Instructions for manual testing
console.log(`
=================================================
TalkTime SEO and Navigation Test Instructions
=================================================

This script should be run in the browser console while 
viewing the TalkTime application.

To run the tests:
1. Open the TalkTime application in your browser
2. Open the browser console (F12 or Ctrl+Shift+I)
3. Copy and paste this entire script into the console
4. Press Enter to execute

The test results will be displayed in the console.
=================================================
`);

// Uncomment to run tests automatically
// runTests();
